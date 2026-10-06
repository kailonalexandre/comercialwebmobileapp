using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Catalog;

public static class CatalogModule
{
    // Mesma permissão da web (App\Modules\Cadastros\Products\ProductPermissions::VIEW).
    public const string ViewProducts = "products.view";

    public sealed record PricesRequest(IReadOnlyList<long>? ProductIds, string? PriceTable);

    public static IServiceCollection AddCatalogModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<ProductQueries>();
        services.AddHttpClient<PriceWebClient>(http =>
        {
            if (Uri.TryCreate(config["ComercialWeb:BaseUrl"], UriKind.Absolute, out var baseUrl)) http.BaseAddress = baseUrl;
            http.Timeout = TimeSpan.FromSeconds(15);
        });
        return services;
    }

    public static IEndpointRouteBuilder MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var products = app.MapGroup("/api/v1/products");

        // Tabelas de preço da empresa (nome interno + rótulo configurado). O ComercialWeb confere a permissão.
        app.MapGet("/api/v1/price-tables", async (ClaimsPrincipal user, PriceWebClient prices, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            return await prices.TablesAsync(ids.UserId, ids.BusinessId, ct) is { } tables
                ? Results.Ok(new { tables })
                : Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable);
        });

        products.MapGet("/", async (ClaimsPrincipal user, ProductQueries queries, PriceWebClient prices, CancellationToken ct,
            string? search, bool? includeInactive, int? page, int? pageSize, string? priceTable) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging) || !PriceTables.IsValidKey(priceTable)) return Paging.Invalid();
            var ids = SessionIds.From(user)!;
            var result = await queries.SearchAsync(ids.BusinessId, search, includeInactive ?? false, paging, ct);
            if (PriceTables.IsDefault(priceTable))
                return Results.Ok(result with { Items = [.. result.Items.Select(p => p with { PriceCents = p.SalePriceCents })] });

            // Outra tabela: o preço é calculado pelo ComercialWeb (nunca reimplementado aqui). Sem resposta, não se mostra preço errado.
            var table = await prices.PricesAsync(ids.UserId, ids.BusinessId, [.. result.Items.Select(p => p.Id)], ct);
            if (table is null) return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable);
            return Results.Ok(result with
            {
                Items = [.. result.Items.Select(p => p with { PriceCents = table.TryGetValue(p.Id, out var byTable) && byTable.TryGetValue(priceTable!, out var cents) ? cents : null })],
            });
        }).RequirePermission(ViewProducts);

        products.MapGet("/{id:long}", async (long id, ClaimsPrincipal user, ProductQueries queries, PriceWebClient prices, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var product = await queries.FindAsync(ids.BusinessId, id, ct);
            if (product is null) return Results.Problem(statusCode: StatusCodes.Status404NotFound);
            var all = await prices.PricesAsync(ids.UserId, ids.BusinessId, [id], ct);
            return Results.Ok(all is not null && all.TryGetValue(id, out var byTable) ? product with { Prices = byTable } : product);
        }).RequirePermission(ViewProducts);

        // Preços do carrinho numa tabela (ao trocar a tabela da operação): { prices: { "<id>": cents | null } }.
        products.MapPost("/prices", async (PricesRequest body, ClaimsPrincipal user, PriceWebClient prices, CancellationToken ct) =>
        {
            if (body.ProductIds is not { Count: >= 1 and <= 100 } || body.ProductIds.Any(i => i <= 0) || string.IsNullOrEmpty(body.PriceTable) || !PriceTables.IsValidKey(body.PriceTable))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            var ids = SessionIds.From(user)!;
            var table = await prices.PricesAsync(ids.UserId, ids.BusinessId, [.. body.ProductIds.Distinct()], ct);
            if (table is null) return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable);
            return Results.Ok(new
            {
                prices = body.ProductIds.Distinct().ToDictionary(
                    i => i, i => table.TryGetValue(i, out var byTable) && byTable.TryGetValue(body.PriceTable, out var cents) ? (long?)cents : null),
            });
        });

        // O saldo tem regras do ComercialWeb (grade, endereços da unidade): a API só repassa o que ele calcula para o aparelho.
        products.MapGet("/{id:long}/stock", async (long id, ClaimsPrincipal user, ProductQueries queries, DeviceLink link, IComercialWebAuth cw, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            if (await queries.FindAsync(ids.BusinessId, id, ct) is null) return Results.Problem(statusCode: StatusCodes.Status404NotFound);
            var result = await link.CallAsync(ids.SessionId, ids.BusinessId, (token, c) => cw.ProductStockAsync(token, id, c), ct);
            return result switch
            {
                { Status: CwStatus.Ok, Value: { } stock } => Results.Ok(new { productId = id, unitId = stock.UnitId, totalMilli = stock.TotalMilli }),
                { Status: CwStatus.Unavailable } => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
                { Status: CwStatus.NotPaired } => Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "company_not_paired"),
                _ => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
            };
        }).RequirePermission(ViewProducts);

        return app;
    }
}
