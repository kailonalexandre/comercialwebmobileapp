using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Management;

public static class ManagementModule
{
    // Mesmas permissões das telas da web (Financial, Compras e Relatórios).
    public const string ViewReceivables = "financial.receivables.view";
    public const string ViewPayables = "financial.payables.view";
    public const string AccessPurchases = "purchases.access";
    public const string AccessReports = "relatorios.access";

    public const int MaxReportDays = 366;

    public static IServiceCollection AddManagementModule(this IServiceCollection services) =>
        services.AddScoped<ManagementQueries>();

    public static IEndpointRouteBuilder MapManagementEndpoints(this IEndpointRouteBuilder app)
    {
        var financial = app.MapGroup("/api/v1/financial");

        // Resumo só traz o lado que o usuário pode ver (o outro vem null).
        financial.MapGet("/summary", async (ClaimsPrincipal user, ManagementQueries queries, IPermissionChecker permissions,
            IConfiguration config, TimeProvider clock, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var today = DateOnly.FromDateTime(LocalTime.Now(config, clock));
            var canReceive = await permissions.HasAsync(ids.UserId, ids.BusinessId, ViewReceivables, ct);
            var canPay = await permissions.HasAsync(ids.UserId, ids.BusinessId, ViewPayables, ct);
            if (!canReceive && !canPay) return Results.Problem(statusCode: StatusCodes.Status403Forbidden);
            TitleTotals? receivableOpen = null, receivableOverdue = null, payableOpen = null, payableOverdue = null;
            if (canReceive) (receivableOpen, receivableOverdue) = await queries.TitleTotalsAsync(ids.BusinessId, "receivable", today, ct);
            if (canPay) (payableOpen, payableOverdue) = await queries.TitleTotalsAsync(ids.BusinessId, "payable", today, ct);
            return Results.Ok(new FinancialSummary(receivableOpen, receivableOverdue, payableOpen, payableOverdue));
        }).RequireAuthorization();

        MapTitles(financial, "receivables", "receivable", ViewReceivables);
        MapTitles(financial, "payables", "payable", ViewPayables);

        app.MapGet("/api/v1/purchases", async (ClaimsPrincipal user, ManagementQueries queries, CancellationToken ct,
            string? search, string? status, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging) || (status is not null && status.Length > 40)) return Paging.Invalid();
            return Results.Ok(await queries.PurchasesAsync(SessionIds.From(user)!.BusinessId, status, search, paging, ct));
        }).RequirePermission(AccessPurchases);

        app.MapGet("/api/v1/reports/sales", async (ClaimsPrincipal user, ManagementQueries queries, IConfiguration config, TimeProvider clock,
            CancellationToken ct, DateOnly? from, DateOnly? to) =>
        {
            var today = DateOnly.FromDateTime(LocalTime.Now(config, clock));
            var end = to ?? today;
            var start = from ?? end.AddDays(-29);
            if (start > end || end.DayNumber - start.DayNumber >= MaxReportDays) return Paging.Invalid();
            return Results.Ok(await queries.SalesAsync(SessionIds.From(user)!.BusinessId, start, end, ct));
        }).RequirePermission(AccessReports);

        return app;
    }

    private static void MapTitles(RouteGroupBuilder group, string path, string type, string permission) =>
        group.MapGet($"/{path}", async (ClaimsPrincipal user, ManagementQueries queries, IConfiguration config, TimeProvider clock, CancellationToken ct,
            string? search, string? status, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging) || (status is not null && !ManagementQueries.TitleStatuses.Contains(status)))
                return Paging.Invalid();
            var today = DateOnly.FromDateTime(LocalTime.Now(config, clock));
            return Results.Ok(await queries.TitlesAsync(SessionIds.From(user)!.BusinessId, type, status, search, today, paging, ct));
        }).RequirePermission(permission);
}
