using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Dashboard;

/// <summary>
/// Cada bloco só existe se o usuário tiver a mesma permissão exigida pelo card na web (null = oculto).
/// `View`: "store" para quem vê o financeiro da loja (contas a receber), "seller" para os demais; a meta segue a visão.
/// </summary>
public sealed record DashboardResponse(
    CountAndTotal? SalesToday,
    CountAndTotal? Receivables,
    long? LowStockCount,
    CountAndTotal? OpenConditionals,
    IReadOnlyList<RecentSale>? RecentSales,
    string View,
    SalesGoal? SalesGoal);

public static class DashboardModule
{
    // Mesmas permissões que a web exige para os cards correspondentes.
    public const string ViewSales = "sales.view";
    public const string ViewReceivables = "financial.receivables.view";
    public const string ViewInventory = "inventory.view";

    public static IServiceCollection AddDashboardModule(this IServiceCollection services) =>
        services.AddScoped<DashboardQueries>();

    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/dashboard", async (ClaimsPrincipal user, DashboardQueries queries, IPermissionChecker permissions,
            IConfiguration config, TimeProvider clock, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            Task<bool> Can(string permission) => permissions.HasAsync(ids.UserId, ids.BusinessId, permission, ct);

            var sales = await Can(ViewSales);
            var receivables = await Can(ViewReceivables);
            var inventory = await Can(ViewInventory);

            // "Hoje" da empresa (APP_TIMEZONE da web), não do servidor da API.
            var today = DateOnly.FromDateTime(LocalTime.Now(config, clock));

            // Loja: meta da empresa (card "Meta do mês" da web). Vendedor: a meta dele. As duas são faturamento, então pedem
            // sales.view, como a aba Gráficos da web; sem a permissão a API não envia (esconder no app não basta).
            var goal = !sales ? null
                : receivables ? await queries.StoreGoalAsync(ids.BusinessId, today, ct)
                : await queries.SellerGoalAsync(ids.BusinessId, ids.UserId, today, ct);

            return Results.Ok(new DashboardResponse(
                sales ? await queries.SalesOfDayAsync(ids.BusinessId, today, ct) : null,
                receivables ? await queries.OpenReceivablesAsync(ids.BusinessId, ct) : null,
                inventory ? await queries.LowStockCountAsync(ids.BusinessId, ct) : null,
                sales ? await queries.OpenConditionalsAsync(ids.BusinessId, ct) : null,
                sales ? await queries.RecentSalesAsync(ids.BusinessId, ct) : null,
                receivables ? "store" : "seller",
                goal));
        }).RequireAuthorization();

        return app;
    }
}
