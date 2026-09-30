using System.Globalization;
using System.Security.Claims;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Identity.Tenancy;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Builder;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ComercialWeb.Mobile.Identity;

public sealed record LoginRequest(string? Login, string? Password, string? DeviceName);

public sealed record RefreshRequest(string? RefreshToken);

public sealed record PairRequest(string? Code, string? DeviceName);

public static class IdentityModule
{
    private const string PairPolicy = "pair";
    private const string RefreshPolicy = "refresh";
    private const int MaxInput = 255; // mesmo teto do ComercialWeb: bcrypt de entrada gigante vira DoS de CPU

    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        var key = TokenIssuer.LoadSigningKey(config["Jwt:SigningKeyPath"], allowEphemeral: env.IsDevelopment());
        var settings = new JwtSettings(config["Jwt:Issuer"] ?? "comercialweb-mobile-api", config["Jwt:Audience"] ?? "comercialweb-mobile", key);

        services.AddSingleton(settings);
        services.AddSingleton<TokenIssuer>();
        services.AddSingleton<LoginThrottle>();
        services.AddScoped<IIdentityStore, MySqlIdentityStore>();
        services.AddScoped<AuthService>();
        services.AddScoped<DeviceLink>();
        services.AddHttpClient<IComercialWebAuth, ComercialWebAuthClient>(http =>
        {
            if (Uri.TryCreate(config["ComercialWeb:BaseUrl"], UriKind.Absolute, out var baseUrl))
            {
                // O bearer e o refresh do ComercialWeb não podem trafegar em claro.
                if (baseUrl.Scheme != Uri.UriSchemeHttps && !env.IsDevelopment()) throw new InvalidOperationException("ComercialWeb:BaseUrl deve usar HTTPS.");
                http.BaseAddress = baseUrl;
            }
            http.Timeout = TimeSpan.FromSeconds(15);
        });
        // Cifra o par de tokens do ComercialWeb guardado em mobile_sessions. Em produção as chaves precisam
        // sobreviver a deploys (volume em DataProtection:KeysPath); chave perdida = sessões pareadas caem.
        var protection = services.AddDataProtection().SetApplicationName("comercialweb-mobile-api");
        if (config["DataProtection:KeysPath"] is { Length: > 0 } keys) protection.PersistKeysToFileSystem(new DirectoryInfo(keys));
        else if (!env.IsDevelopment()) throw new InvalidOperationException("DataProtection:KeysPath é obrigatório fora do desenvolvimento.");

        // Rotas sem Bearer: limite por IP para não virar amplificador contra o ComercialWeb nem esgotar os workers.
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy(PairPolicy, http => RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "?", _ => new() { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
            o.AddPolicy(RefreshPolicy, http => RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "?", _ => new() { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
        });
        services.AddScoped<IPermissionChecker, MySqlPermissionChecker>();
        services.AddScoped<OperationUnits>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
        {
            o.MapInboundClaims = false;
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = settings.Issuer,
                ValidAudience = settings.Audience,
                IssuerSigningKey = key,
                ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
                ClockSkew = TimeSpan.FromSeconds(30),
            };
            // JWT válido não basta: logout, desativação e perda de vínculo com a empresa valem na hora.
            o.Events = new JwtBearerEvents
            {
                OnTokenValidated = async ctx =>
                {
                    var ids = SessionIds.From(ctx.Principal);
                    var store = ctx.HttpContext.RequestServices.GetRequiredService<IIdentityStore>();
                    var clock = ctx.HttpContext.RequestServices.GetRequiredService<TimeProvider>();
                    if (ids is null || !await store.IsSessionActiveAsync(ids.SessionId, ids.UserId, ids.BusinessId, clock.GetUtcNow(), ctx.HttpContext.RequestAborted))
                        ctx.Fail("Sessão inativa.");
                },
            };
        });
        // Emissão (TokenIssuer/AuthService) e validação usam o mesmo relógio injetável.
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<TimeProvider>((o, clock) =>
        {
            var skew = o.TokenValidationParameters.ClockSkew;
            o.TokenValidationParameters.LifetimeValidator = (notBefore, expires, _, _) =>
            {
                var now = clock.GetUtcNow().UtcDateTime;
                return (notBefore is null || notBefore <= now + skew) && (expires is null || expires > now - skew);
            };
        });
        services.AddAuthorization();
        return services;
    }

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/v1/auth");

        // O login do app é por QR (/pair). E-mail/senha fica desligado, salvo Auth:PasswordLogin=true (testes/dev).
        auth.MapPost("/login", async (LoginRequest body, HttpContext http, AuthService service, IConfiguration config, CancellationToken ct) =>
        {
            if (!config.GetValue<bool>("Auth:PasswordLogin")) return Results.NotFound();
            if (!Valid(body.Login) || !Valid(body.Password) || body.DeviceName?.Length > 100) return Results.Problem(statusCode: 422);
            var result = await service.LoginAsync(body.Login!, body.Password!, http.Connection.RemoteIpAddress?.ToString(), body.DeviceName, ct);
            return ToHttp(result, http);
        });

        auth.MapPost("/pair", async (PairRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
        {
            if (!ValidCode(body.Code) || body.DeviceName?.Length > 100) return Results.Problem(statusCode: 422);
            return ToHttp(await service.PairAsync(body.Code!, body.DeviceName?.Trim(), ClientIp(http), ct), http);
        }).RequireRateLimiting(PairPolicy);

        auth.MapPost("/refresh", async (RefreshRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
            ToHttp(await service.RefreshAsync(body.RefreshToken ?? "", ct), http)).RequireRateLimiting(RefreshPolicy);

        auth.MapPost("/logout", async (ClaimsPrincipal user, AuthService service, CancellationToken ct) =>
        {
            await service.LogoutAsync(SessionIds.From(user)!.SessionId, ct);
            return Results.NoContent();
        }).RequireAuthorization();

        app.MapGet("/api/v1/me", async (ClaimsPrincipal user, IIdentityStore store, OperationUnits units, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var profile = await store.GetProfileAsync(ids.UserId, ids.BusinessId, ct);
            if (profile is null) return Results.NotFound();
            var unit = await units.CurrentAsync(ids.UserId, ids.BusinessId, ct);
            return Results.Ok(new { profile.UserName, profile.BusinessId, profile.BusinessName, unit });
        }).RequireAuthorization();

        return app;
    }

    // IP do aparelho já resolvido pelo ForwardedHeaders (só de proxy confiável); sem porta nem escopo IPv6.
    private static string? ClientIp(HttpContext http) =>
        http.Connection.RemoteIpAddress is { } ip ? (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).ToString().Split('%')[0] : null;

    // Formato do código do QR (60 alfanuméricos): recusa lixo antes de chamar o ComercialWeb.
    private static bool ValidCode(string? code) => code is { Length: 60 } && code.All(char.IsAsciiLetterOrDigit);

    private static bool Valid(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= MaxInput;

    private static IResult ToHttp(AuthResult result, HttpContext http)
    {
        if (result.Session is { } s) return Results.Ok(new { s.AccessToken, s.RefreshToken, expiresAt = s.ExpiresAt });
        if (result.Failure == AuthFailure.LockedOut)
        {
            http.Response.Headers.RetryAfter = ((int)Math.Ceiling(result.RetryAfter!.Value.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
            return Results.Problem(statusCode: 429);
        }
        if (result.Failure == AuthFailure.InvalidPairingCode) return Results.Problem(statusCode: 422, title: "invalid_pairing_code");
        if (result.Failure == AuthFailure.Unavailable) return Results.Problem(statusCode: 503);
        // Resposta única: não revela se o usuário existe, está desativado ou sem empresa.
        return Results.Problem(statusCode: 401);
    }
}

/// <summary>Identidade da sessão extraída do access token. O tenant (bid) vem do servidor, nunca do cliente.</summary>
public sealed record SessionIds(long UserId, Guid SessionId, long BusinessId)
{
    public static SessionIds? From(ClaimsPrincipal? principal) =>
        long.TryParse(principal?.FindFirstValue(JwtRegisteredClaimNames.Sub), CultureInfo.InvariantCulture, out var user)
        && Guid.TryParse(principal.FindFirstValue(TokenIssuer.SessionClaim), out var session)
        && long.TryParse(principal.FindFirstValue(TokenIssuer.BusinessClaim), CultureInfo.InvariantCulture, out var business)
            ? new SessionIds(user, session, business)
            : null;
}
