using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Identity.Tenancy;
using ComercialWeb.Mobile.Sales.PreSales;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Sales;

public static class SalesModule
{
    // Mesma permissão da "Consulta de Vendas" da web (separada de sales.access, que é lançar venda).
    public const string ViewSales = "sales.view";

    public static IServiceCollection AddSalesModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<SaleQueries>();
        services.AddHttpClient<ComercialWebClient>(http =>
        {
            if (Uri.TryCreate(config["ComercialWeb:BaseUrl"], UriKind.Absolute, out var baseUrl)) http.BaseAddress = baseUrl;
            http.Timeout = TimeSpan.FromSeconds(20);
        });
        return services;
    }

    public static IEndpointRouteBuilder MapSalesEndpoints(this IEndpointRouteBuilder app)
    {
        var sales = app.MapGroup("/api/v1/sales");

        sales.MapGet("/", async (ClaimsPrincipal user, SaleQueries queries, OperationUnits units, CancellationToken ct,
            string? search, string? status, DateOnly? from, DateOnly? to, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging)
                || (status is not null && !SaleQueries.Statuses.Contains(status))
                || (from is not null && to is not null && from > to))
                return Paging.Invalid();

            var ids = SessionIds.From(user)!;
            var unit = await units.CurrentAsync(ids.UserId, ids.BusinessId, ct);
            if (unit is null) return NoUnit();
            return Results.Ok(await queries.SearchAsync(ids.BusinessId, unit.Id, new SaleFilter(search, status, from, to), paging, ct));
        }).RequirePermission(ViewSales);

        sales.MapGet("/{id:long}", async (long id, ClaimsPrincipal user, SaleQueries queries, OperationUnits units, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var unit = await units.CurrentAsync(ids.UserId, ids.BusinessId, ct);
            if (unit is null) return NoUnit();
            var sale = await queries.FindAsync(ids.BusinessId, unit.Id, id, ct);
            return sale is null ? Results.Problem(statusCode: StatusCodes.Status404NotFound) : Results.Ok(sale);
        }).RequirePermission(ViewSales);

        app.MapPreSaleEndpoints();
        return app;
    }

    // Empresa sem unidade operável para o usuário (a web lança NoCurrentLocationException no mesmo caso).
    private static IResult NoUnit() => Results.Problem(statusCode: StatusCodes.Status409Conflict);
}
