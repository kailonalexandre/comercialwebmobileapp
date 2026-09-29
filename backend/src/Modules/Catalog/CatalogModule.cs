using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
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

        return app;
    }
}
