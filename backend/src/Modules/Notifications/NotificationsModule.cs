using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Notifications;

public static class NotificationsModule
{
    private const int MaxDomain = 40;

    public static IServiceCollection AddNotificationsModule(this IServiceCollection services) =>
        services.AddScoped<NotificationQueries>();

    // A web não exige permissão para ver os próprios avisos (só login); o recorte é sempre o usuário da sessão.
    public static IEndpointRouteBuilder MapNotificationsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/notifications").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal user, NotificationQueries queries, CancellationToken ct,
            string? status, string? read, string? domain, string? severity, string? search, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging)
                || status is not (null or "active" or "archived")
                || read is not (null or "read" or "unread")
                || (severity is not null && !NotificationQueries.Severities.Contains(severity))
                || domain?.Length > MaxDomain)
                return Paging.Invalid();

            var ids = SessionIds.From(user)!;
            var filter = new NotificationFilter(status == "archived", read is null ? null : read == "read", domain, severity, search);
            return Results.Ok(await queries.SearchAsync(ids.UserId, ids.BusinessId, filter, paging, ct));
        });

        group.MapGet("/unread-count", async (ClaimsPrincipal user, NotificationQueries queries, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            return Results.Ok(await queries.UnreadCountsAsync(ids.UserId, ids.BusinessId, ct));
        });

        group.MapPost("/{id:long}/read", async (long id, ClaimsPrincipal user, NotificationQueries queries, IConfiguration config, TimeProvider clock, CancellationToken ct) =>
            await queries.MarkReadAsync(SessionIds.From(user)!.UserId, SessionIds.From(user)!.BusinessId, id, LocalTime.Now(config, clock), ct)
                ? Results.NoContent()
                : Results.Problem(statusCode: StatusCodes.Status404NotFound));

        group.MapPost("/{id:long}/archive", async (long id, ClaimsPrincipal user, NotificationQueries queries, IConfiguration config, TimeProvider clock, CancellationToken ct) =>
            await queries.ArchiveAsync(SessionIds.From(user)!.UserId, SessionIds.From(user)!.BusinessId, id, LocalTime.Now(config, clock), ct)
                ? Results.NoContent()
                : Results.Problem(statusCode: StatusCodes.Status404NotFound));

        group.MapPost("/read-all", async (ClaimsPrincipal user, NotificationQueries queries, IConfiguration config, TimeProvider clock, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            return Results.Ok(new { updated = await queries.MarkAllReadAsync(ids.UserId, ids.BusinessId, LocalTime.Now(config, clock), ct) });
        });

        return app;
    }
}
