using System.Security.Claims;
using System.Text.RegularExpressions;
using ComercialWeb.Mobile.Identity;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Push;

public static partial class PushModule
{
    private const int MaxToken = 255;

    [GeneratedRegex(@"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$")]
    private static partial Regex ExpoToken();

    public static bool IsValidToken(string? token) => token is { Length: <= MaxToken } && ExpoToken().IsMatch(token);

    public static IServiceCollection AddPushModule(this IServiceCollection services)
    {
        services.AddSingleton<PushStore>();
        services.AddHttpClient<IPushSender, ExpoPushSender>(http => http.Timeout = TimeSpan.FromSeconds(20));
        services.AddSingleton<PushDispatcher>();
        services.AddHostedService(sp => sp.GetRequiredService<PushDispatcher>());
        return services;
    }

    public sealed record RegisterRequest(string? Token, string? Platform);

    public sealed record MutedRequest(string[]? MutedDomains);

    private static readonly Regex DomainName = new(@"^[a-z0-9_]{1,40}$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/me/push-token").RequireAuthorization();

        group.MapPut("/", async (RegisterRequest body, ClaimsPrincipal user, PushStore store, TimeProvider clock, CancellationToken ct) =>
        {
            if (!IsValidToken(body.Token) || body.Platform is not ("android" or "ios"))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            var ids = SessionIds.From(user)!;
            await store.UpsertAsync(ids.SessionId, ids.UserId, body.Token!, body.Platform, clock.GetUtcNow().UtcDateTime, ct);
            return Results.NoContent();
        });

        group.MapDelete("/", async (ClaimsPrincipal user, PushStore store, CancellationToken ct) =>
        {
            await store.DeleteAsync(SessionIds.From(user)!.SessionId, ct);
            return Results.NoContent();
        });

        var prefs = app.MapGroup("/api/v1/me/push-preferences").RequireAuthorization();

        prefs.MapGet("/", async (ClaimsPrincipal user, PushStore store, CancellationToken ct) =>
            Results.Ok(new { mutedDomains = await store.MutedAsync(SessionIds.From(user)!.UserId, ct) }));

        prefs.MapPut("/", async (MutedRequest body, ClaimsPrincipal user, PushStore store, CancellationToken ct) =>
        {
            var domains = body.MutedDomains?.Distinct().ToArray();
            if (domains is null || domains.Length > 50 || domains.Any(d => !DomainName.IsMatch(d)))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            await store.SetMutedAsync(SessionIds.From(user)!.UserId, domains, ct);
            return Results.NoContent();
        });

        return app;
    }
}
