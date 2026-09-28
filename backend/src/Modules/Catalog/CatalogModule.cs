using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Catalog;

public static class CatalogModule
{
    // Mesma permissão da web (App\Modules\Cadastros\Products\ProductPermissions::VIEW).
    public const string ViewProducts = "products.view";

    public const int MaxPageSize = 50;
    private const int MaxPage = 10_000;
    private const int MaxSearch = 100;

    public static IServiceCollection AddCatalogModule(this IServiceCollection services) =>
        services.AddScoped<ProductQueries>();

    public static IEndpointRouteBuilder MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var products = app.MapGroup("/api/v1/products");

        products.MapGet("/", async (ClaimsPrincipal user, ProductQueries queries, CancellationToken ct,
            string? search, bool? includeInactive, int? page, int? pageSize) =>
        {
            var p = page ?? 1;
            var size = pageSize ?? 20;
            // Paginação abusiva é rejeitada, não silenciosamente corrigida.
            if (p is < 1 or > MaxPage || size is < 1 or > MaxPageSize || search?.Length > MaxSearch)
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);

            var ids = SessionIds.From(user)!;
            return Results.Ok(await queries.SearchAsync(ids.BusinessId, search, includeInactive ?? false, p, size, ct));
        }).RequirePermission(ViewProducts);

        products.MapGet("/{id:long}", async (long id, ClaimsPrincipal user, ProductQueries queries, CancellationToken ct) =>
        {
            var product = await queries.FindAsync(SessionIds.From(user)!.BusinessId, id, ct);
            return product is null ? Results.Problem(statusCode: StatusCodes.Status404NotFound) : Results.Ok(product);
        }).RequirePermission(ViewProducts);

        return app;
    }
}
