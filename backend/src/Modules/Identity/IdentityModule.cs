using System.Globalization;
using System.Security.Claims;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Identity.Tenancy;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Builder;
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

public sealed record SwitchBusinessRequest(long? BusinessId);

public sealed record PairRequest(string? Code, string? DeviceName, string? Platform = null, string? AppVersion = null);

public sealed record BindTerminalRequest(string? Code, string? InstallationId, string? DeviceName, string? Platform = null, string? AppVersion = null);

public sealed record TerminalRequest(string? TerminalId, string? TerminalSecret);

public sealed record TerminalLoginRequest(
    string? TerminalId, string? TerminalSecret, string? Method, string? Login = null, string? Password = null, long? UserId = null,
    string? Pin = null, string? InviteCode = null, string? NewPassword = null, string? Platform = null, string? AppVersion = null);

public sealed record SetPinRequest(string? Password, string? Pin);

public sealed record LogoutRequest(string? Reason);

public static class IdentityModule
{
    private const int MaxInput = 255; // mesmo teto do ComercialWeb: bcrypt de entrada gigante vira DoS de CPU

    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        var key = TokenIssuer.LoadSigningKey(config["Jwt:SigningKeyPath"], allowEphemeral: env.IsDevelopment());
        var settings = new JwtSettings(config["Jwt:Issuer"] ?? "comercialweb-mobile-api", config["Jwt:Audience"] ?? "comercialweb-mobile", key);

        services.AddSingleton(settings);
        services.AddSingleton<TokenIssuer>();
        services.AddSingleton<LoginThrottle>();
        services.AddScoped<IIdentityStore, MySqlIdentityStore>();
        services.AddScoped<AuditTrail>();
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

        // Rate limit NÃO mora aqui: é da borda (Traefik/nginx), antes da aplicação. Ver docs/ARCHITECTURE.md, "Borda".
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

    /// <summary>
    /// Trilha das operações da fila do app (toda escrita com Idempotency-Key): quem, em qual empresa, quando foi criada no
    /// aparelho (X-Client-Created-At) e se o servidor aceitou ou recusou. 401/429/5xx não decidem nada (o app reenvia).
    /// </summary>
    public static IApplicationBuilder UseSyncAudit(this IApplicationBuilder app) => app.Use(async (HttpContext http, RequestDelegate next) =>
    {
        await next(http);
        var key = http.Request.Headers["Idempotency-Key"].ToString();
        var status = http.Response.StatusCode;
        if (!HttpMethods.IsPost(http.Request.Method) || key.Length is 0 or > 64 || status is 401 or 429 or >= 500 || SessionIds.From(http.User) is not { } ids) return;

        var createdAt = http.Request.Headers["X-Client-Created-At"].ToString();
        var meta = new Dictionary<string, string?>
        {
            ["path"] = http.Request.Path.Value,
            ["status"] = status.ToString(CultureInfo.InvariantCulture),
            ["key"] = key,
            ["createdAt"] = DateTimeOffset.TryParse(createdAt, CultureInfo.InvariantCulture, out var at) ? at.ToString("O", CultureInfo.InvariantCulture) : null,
        };
        await http.RequestServices.GetRequiredService<AuditTrail>()
            .RecordAsync(new AuditEvent(status < 300 ? "sync.accepted" : "sync.rejected", ids.BusinessId, ids.UserId, Meta: meta), CancellationToken.None);
    });

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

        // QR antigo (sessão do usuário que gerou). Desligar com Auth:LegacyPairing=false ao fim da migração.
        auth.MapPost("/pair", async (PairRequest body, HttpContext http, AuthService service, IConfiguration config, CancellationToken ct) =>
        {
            if (!config.GetValue("Auth:LegacyPairing", true)) return Results.Problem(statusCode: 422, title: "invalid_pairing_code");
            if (!ValidCode(body.Code) || body.DeviceName?.Length > 100) return Results.Problem(statusCode: 422);
            return ToHttp(await service.PairAsync(body.Code!, body.DeviceName?.Trim(), ClientIp(http), ct, DeviceInfo.From(body.Platform, body.AppVersion)), http);
        });

        auth.MapPost("/refresh", async (RefreshRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
            ToHttp(await service.RefreshAsync(body.RefreshToken ?? "", ct), http));

        // Troca a empresa da sessão atual sem sair da conta. Empresa sem vínculo ativo: 403 (mesma resposta de qualquer recusa).
        auth.MapPost("/switch-business", async (SwitchBusinessRequest body, ClaimsPrincipal user, AuthService service, CancellationToken ct) =>
        {
            if (body.BusinessId is not > 0) return Results.Problem(statusCode: 422);
            var ids = SessionIds.From(user)!;
            var switched = await service.SwitchBusinessAsync(ids.SessionId, ids.UserId, body.BusinessId.Value, ct);
            return switched is null
                ? Results.Problem(statusCode: 403)
                : Results.Ok(new { switched.AccessToken, expiresAt = switched.ExpiresAt, switched.BusinessId, switched.BusinessName });
        }).RequireAuthorization();

        auth.MapPost("/logout", async (LogoutRequest? body, ClaimsPrincipal user, AuthService service, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            await service.LogoutAsync(ids.SessionId, ct, ids.UserId, ids.BusinessId, body?.Reason);
            return Results.NoContent();
        }).RequireAuthorization();

        // Login individual num aparelho vinculado: senha, PIN (só compartilhado) ou convite. Nenhum dado do app escolhe
        // usuário ou empresa: o ComercialWeb confere o segredo do aparelho, a credencial, o bloqueio e a permissão.
        auth.MapPost("/terminal-login", async (TerminalLoginRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
        {
            if (Terminal(body.TerminalId, body.TerminalSecret) is not { } terminal || ToLoginInput(body) is not { } input) return Results.Problem(statusCode: 422);
            var result = await service.TerminalLoginAsync(terminal, input, ClientIp(http), DeviceInfo.From(body.Platform, body.AppVersion), ct);
            if (result is { Session: { } s, Login: { } l, Policy: { } p })
            {
                return Results.Ok(new
                {
                    s.AccessToken,
                    s.RefreshToken,
                    expiresAt = s.ExpiresAt,
                    minAppVersion = s.MinAppVersion,
                    user = new { id = l.UserId, name = l.UserName },
                    terminal = Present(l.Terminal),
                    policy = new { mode = p.Mode, idleLockSeconds = p.IdleLockSeconds, offlineHours = p.OfflineHours, biometric = p.Mode == SessionPolicy.Personal },
                });
            }
            return Refusal(http, result.Status, result.Error, result.RetryAfter);
        });

        var terminals = app.MapGroup("/api/v1/terminal");

        // QR de vínculo: o aparelho recebe um segredo (guardado no Keychain/Keystore), nunca uma sessão.
        terminals.MapPost("/bind", async (BindTerminalRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
        {
            if (!ValidCode(body.Code) || !Guid.TryParse(body.InstallationId, out var installation) || body.DeviceName?.Length > 100)
                return Results.Problem(statusCode: 422);
            var bound = await service.BindTerminalAsync(body.Code!, installation.ToString(), string.IsNullOrWhiteSpace(body.DeviceName) ? "Aplicativo" : body.DeviceName.Trim(),
                ClientIp(http), DeviceInfo.From(body.Platform, body.AppVersion), ct);
            return bound is { Status: CwStatus.Ok, Value: { } b }
                ? Results.Ok(new { terminal = Present(b.Terminal), terminalSecret = b.Secret })
                : Refusal(http, bound.Status, bound.Error ?? (bound.Status == CwStatus.Rejected ? "invalid_binding_code" : null), bound.RetryAfter);
        });

        // Ao abrir o app: o aparelho segue vinculado? Quem pode entrar (troca de operador)?
        terminals.MapPost("/state", async (TerminalRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
        {
            if (Terminal(body.TerminalId, body.TerminalSecret) is not { } terminal) return Results.Problem(statusCode: 422);
            var state = await service.TerminalStateAsync(terminal, ClientIp(http), ct);
            return state is { Status: CwStatus.Ok, Value: { } s }
                ? Results.Ok(new { terminal = Present(s.Terminal), operators = s.Operators.Select(o => new { o.Id, o.Name, o.HasPin }) })
                : Refusal(http, state.Status, state.Error, state.RetryAfter);
        });

        // PIN do aparelho compartilhado (exige a senha atual). Recusa é 422, nunca 401: 401 aqui derrubaria a sessão no app.
        app.MapPut("/api/v1/me/pin", async (SetPinRequest body, ClaimsPrincipal user, AuthService service, CancellationToken ct) =>
        {
            if (!Valid(body.Password) || body.Pin is not { Length: 6 } pin || !pin.All(char.IsAsciiDigit)) return Results.Problem(statusCode: 422);
            var ids = SessionIds.From(user)!;
            var set = await service.SetPinAsync(ids.SessionId, ids.BusinessId, body.Password!, pin, ct);
            return set.Status switch
            {
                CwStatus.Ok => Results.NoContent(),
                CwStatus.NotPaired => Results.Problem(statusCode: 409),
                CwStatus.Rejected => Results.Json(new { code = set.Error ?? "invalid_credentials" }, statusCode: 422),
                _ when set.RetryAfter is not null => Results.Json(new { code = "rate_limited" }, statusCode: 429),
                _ => Results.Problem(statusCode: 503),
            };
        }).RequireAuthorization();

        // Empresas que o usuário pode alternar (vínculo ativo) e qual está ativa na sessão.
        app.MapGet("/api/v1/me/businesses", async (ClaimsPrincipal user, AuthService service, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            return Results.Ok(new { businesses = await service.BusinessesAsync(ids.UserId, ct), currentBusinessId = ids.BusinessId });
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

    private static TerminalCredentials? Terminal(string? id, string? secret) =>
        Guid.TryParse(id, out var terminal) && ValidCode(secret) ? new TerminalCredentials(terminal.ToString(), secret!) : null;

    // Cada método leva só os seus campos; formato errado não chega ao ComercialWeb.
    private static TerminalLoginInput? ToLoginInput(TerminalLoginRequest b) => b.Method switch
    {
        "password" when Valid(b.Login) && Valid(b.Password) => new("password", b.Login!.Trim(), b.Password, null, null, null, null),
        "pin" when b.UserId is > 0 && b.Pin is { Length: 6 } pin && pin.All(char.IsAsciiDigit) => new("pin", null, null, b.UserId, pin, null, null),
        "invite" when ValidCode(b.InviteCode) && b.NewPassword is { Length: >= 8 and <= MaxInput } => new("invite", null, null, null, null, b.InviteCode, b.NewPassword),
        _ => null,
    };

    private static object Present(CwTerminal t) => new { id = t.Id, name = t.Name, mode = t.Mode, businessId = t.BusinessId, businessName = t.BusinessName };

    /// <summary>
    /// Recusa do aparelho/login com o código estável do ComercialWeb: invalid_credentials (401), terminal_revoked e
    /// terminal_assigned (403), invalid_binding_code (422), account_locked / limite de taxa (429 + Retry-After).
    /// ComercialWeb fora do ar: 503.
    /// </summary>
    private static IResult Refusal(HttpContext http, CwStatus status, string? code, int? retryAfter)
    {
        if (retryAfter is { } wait)
        {
            http.Response.Headers.RetryAfter = wait.ToString(CultureInfo.InvariantCulture);
            return Results.Json(new { code = code == "account_locked" ? code : "rate_limited" }, statusCode: 429);
        }
        if (status != CwStatus.Rejected) return Results.Problem(statusCode: 503);
        return code switch
        {
            "terminal_revoked" or "terminal_assigned" => Results.Json(new { code }, statusCode: 403),
            "invalid_binding_code" => Results.Json(new { code }, statusCode: 422),
            // Resposta única para senha/PIN/convite errados, usuário inexistente, desligado ou sem acesso ao app.
            _ => Results.Json(new { code = "invalid_credentials" }, statusCode: 401),
        };
    }

    private static IResult ToHttp(AuthResult result, HttpContext http)
    {
        if (result.Session is { } s) return Results.Ok(new { s.AccessToken, s.RefreshToken, expiresAt = s.ExpiresAt, minAppVersion = s.MinAppVersion });
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
