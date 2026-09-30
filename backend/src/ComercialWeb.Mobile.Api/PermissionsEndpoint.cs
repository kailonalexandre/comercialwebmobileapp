using System.Security.Claims;
using ComercialWeb.Mobile.Catalog;
using ComercialWeb.Mobile.Customers;
using ComercialWeb.Mobile.Dashboard;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Sales;
using ComercialWeb.Mobile.Sales.Orders;
using ComercialWeb.Mobile.Sales.Pdv;
using ComercialWeb.Mobile.Sales.PreSales;

namespace ComercialWeb.Mobile.Api;

/// <summary>
/// Quais permissões da web o usuário tem na empresa da sessão, entre as que o app usa para decidir o que mostrar.
/// Só conveniência de interface: cada rota confere a própria permissão no servidor.
/// </summary>
internal static class PermissionsEndpoint
{
    // Fonte única: as mesmas constantes que as rotas exigem.
    internal static readonly string[] AppPermissions =
    [
        CatalogModule.ViewProducts,
        CustomersModule.ViewPeople,
        SalesModule.ViewSales,
        PreSaleEndpoints.CreatePreSale,
        PdvEndpoints.UsePdv,
        PdvEndpoints.DiscountPdv,
        DashboardModule.ViewReceivables,
        DashboardModule.ViewInventory,
        OrdersEndpoints.StoreOrders,
        OrdersEndpoints.MarketplaceOrders,
    ];

    public static IEndpointRouteBuilder MapPermissionsEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/me/permissions", async (ClaimsPrincipal user, IPermissionChecker permissions, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var granted = new List<string>();
            foreach (var permission in AppPermissions)
                if (await permissions.HasAsync(ids.UserId, ids.BusinessId, permission, ct)) granted.Add(permission);
            return Results.Ok(new { permissions = granted });
        }).RequireAuthorization();

        return app;
    }
}
