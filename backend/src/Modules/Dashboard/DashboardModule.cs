using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Dashboard;

/// <summary>Cada bloco só existe se o usuário tiver a mesma permissão exigida pelo card na web (null = oculto).</summary>
public sealed record DashboardResponse(
    CountAndTotal? SalesToday,
    CountAndTotal? Receivables,
    long? LowStockCount,
    CountAndTotal? OpenConditionals,
    IReadOnlyList<RecentSale>? RecentSales);

public static class DashboardModule
{
    public static IServiceCollection AddDashboardModule(this IServiceCollection services) =>
        services.AddScoped<DashboardQueries>();

    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/dashboard", async (ClaimsPrincipal user, DashboardQueries queries, IPermissionChecker permissions,
            IConfiguration config, TimeProvider clock, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            Task<bool> Can(string permission) => permissions.HasAsync(ids.UserId, ids.BusinessId, permission, ct);

            var sales = await Can("sales.view");
            var receivables = await Can("financial.receivables.view");
            var inventory = await Can("inventory.view");

            // "Hoje" da empresa (APP_TIMEZONE da web), não do servidor da API.
            var zone = TimeZoneInfo.FindSystemTimeZoneById(config["ComercialWeb:TimeZone"] ?? "America/Sao_Paulo");
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);

            return Results.Ok(new DashboardResponse(
                sales ? await queries.SalesOfDayAsync(ids.BusinessId, today, ct) : null,
                receivables ? await queries.OpenReceivablesAsync(ids.BusinessId, ct) : null,
                inventory ? await queries.LowStockCountAsync(ids.BusinessId, ct) : null,
                sales ? await queries.OpenConditionalsAsync(ids.BusinessId, ct) : null,
                sales ? await queries.RecentSalesAsync(ids.BusinessId, ct) : null));
        }).RequireAuthorization();

        return app;
    }
}
