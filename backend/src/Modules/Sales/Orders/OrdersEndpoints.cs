using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ComercialWeb.Mobile.Sales.Orders;

/// <summary>
/// Pedidos da Loja Virtual e dos marketplaces: o mesmo Monitor de Pedidos da web. A regra é do ComercialWeb; a API só
/// repassa (com o token do aparelho) o que ele devolve para o usuário e a empresa do aparelho.
/// </summary>
public static class OrdersEndpoints
{
    // Mesmas permissões da rota /api/mobile/v1/orders do ComercialWeb.
    public const string StoreOrders = "loja-virtual.access";
    public const string MarketplaceOrders = "marketplaces.view";

    private static readonly string[] Sources = ["all", "store", "mercadolivre"];
    private const int MaxStatus = 30;

    public static IEndpointRouteBuilder MapOrdersEndpoints(this IEndpointRouteBuilder app)
    {
        var orders = app.MapGroup("/api/v1/orders");

        orders.MapGet("/", async (ClaimsPrincipal user, DeviceLink link, IComercialWebAuth cw, CancellationToken ct,
            string? source, string? status, string? search, int? page, int? pageSize) =>
        {
            source ??= "all";
            if (!Paging.TryCreate(page, pageSize, search, out var paging) || !Sources.Contains(source) || status?.Length > MaxStatus)
                return Paging.Invalid();

            var query = new CwOrdersQuery(source, status, search, paging.Page, paging.PageSize);
            var result = await link.CallAsync(SessionIds.From(user)!.SessionId, (token, c) => cw.OrdersAsync(token, query, c), ct);
            return result switch
            {
                { Status: CwStatus.Ok, Value: { } sections } => Results.Ok(new { sections }),
                { Status: CwStatus.Unavailable } => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
                _ => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
            };
        }).RequireAnyPermission(StoreOrders, MarketplaceOrders);

        // Só pedido de marketplace tem detalhe na API do ComercialWeb; o da Loja Virtual ainda não.
        orders.MapGet("/marketplace/{id:long}", async (long id, ClaimsPrincipal user, DeviceLink link, IComercialWebAuth cw, CancellationToken ct) =>
        {
            var result = await link.CallAsync(SessionIds.From(user)!.SessionId, (token, c) => cw.MarketplaceOrderAsync(token, id, c), ct);
            return result switch
            {
                { Status: CwStatus.Ok, Value: { } order } => Results.Ok(order),
                { Status: CwStatus.Unavailable } => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
                // O ComercialWeb responde 404 para inexistente ou de outra empresa; a permissão já foi conferida aqui.
                _ => Results.Problem(statusCode: StatusCodes.Status404NotFound),
            };
        }).RequirePermission(MarketplaceOrders);

        return app;
    }
}
