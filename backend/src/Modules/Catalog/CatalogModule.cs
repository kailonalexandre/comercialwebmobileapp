using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Catalog;

public static class CatalogModule
{
    // Mesma permissão da web (App\Modules\Cadastros\Products\ProductPermissions::VIEW).
    public const string ViewProducts = "products.view";

    public static IServiceCollection AddCatalogModule(this IServiceCollection services) =>
        services.AddScoped<ProductQueries>();

    public static IEndpointRouteBuilder MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var products = app.MapGroup("/api/v1/products");

        products.MapGet("/", async (ClaimsPrincipal user, ProductQueries queries, CancellationToken ct,
            string? search, bool? includeInactive, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging)) return Paging.Invalid();
            var ids = SessionIds.From(user)!;
            return Results.Ok(await queries.SearchAsync(ids.BusinessId, search, includeInactive ?? false, paging, ct));
        }).RequirePermission(ViewProducts);

        products.MapGet("/{id:long}", async (long id, ClaimsPrincipal user, ProductQueries queries, CancellationToken ct) =>
        {
            var product = await queries.FindAsync(SessionIds.From(user)!.BusinessId, id, ct);
            return product is null ? Results.Problem(statusCode: StatusCodes.Status404NotFound) : Results.Ok(product);
        }).RequirePermission(ViewProducts);

        // O saldo tem regras do ComercialWeb (grade, endereços da unidade): a API só repassa o que ele calcula para o aparelho.
        products.MapGet("/{id:long}/stock", async (long id, ClaimsPrincipal user, ProductQueries queries, DeviceLink link, IComercialWebAuth cw, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            if (await queries.FindAsync(ids.BusinessId, id, ct) is null) return Results.Problem(statusCode: StatusCodes.Status404NotFound);
            var result = await link.CallAsync(ids.SessionId, (token, c) => cw.ProductStockAsync(token, id, c), ct);
            return result switch
            {
                { Status: CwStatus.Ok, Value: { } stock } => Results.Ok(new { productId = id, unitId = stock.UnitId, totalMilli = stock.TotalMilli }),
                { Status: CwStatus.Unavailable } => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
                _ => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
            };
        }).RequirePermission(ViewProducts);

        return app;
    }
}
