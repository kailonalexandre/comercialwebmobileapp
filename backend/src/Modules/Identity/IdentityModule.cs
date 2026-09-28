using System.Globalization;
using System.Security.Claims;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
        services.AddScoped<AuthService>();

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
        services.AddAuthorization();
        return services;
    }

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/v1/auth");

        auth.MapPost("/login", async (LoginRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
        {
            if (!Valid(body.Login) || !Valid(body.Password) || body.DeviceName?.Length > 100) return Results.Problem(statusCode: 422);
            var result = await service.LoginAsync(body.Login!, body.Password!, http.Connection.RemoteIpAddress?.ToString(), body.DeviceName, ct);
            return ToHttp(result, http);
        });

        auth.MapPost("/refresh", async (RefreshRequest body, HttpContext http, AuthService service, CancellationToken ct) =>
            ToHttp(await service.RefreshAsync(body.RefreshToken ?? "", ct), http));

        auth.MapPost("/logout", async (ClaimsPrincipal user, AuthService service, CancellationToken ct) =>
        {
            await service.LogoutAsync(SessionIds.From(user)!.SessionId, ct);
            return Results.NoContent();
        }).RequireAuthorization();

        app.MapGet("/api/v1/me", async (ClaimsPrincipal user, IIdentityStore store, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var profile = await store.GetProfileAsync(ids.UserId, ids.BusinessId, ct);
            return profile is null ? Results.NotFound() : Results.Ok(profile);
        }).RequireAuthorization();

        return app;
    }

    private static bool Valid(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= MaxInput;

    private static IResult ToHttp(AuthResult result, HttpContext http)
    {
        if (result.Session is { } s) return Results.Ok(new { s.AccessToken, s.RefreshToken, expiresAt = s.ExpiresAt });
        if (result.Failure == AuthFailure.LockedOut)
        {
            http.Response.Headers.RetryAfter = ((int)Math.Ceiling(result.RetryAfter!.Value.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
            return Results.Problem(statusCode: 429);
        }
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
