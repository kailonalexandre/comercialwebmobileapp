using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Customers;

public static class CustomersModule
{
    // Mesma permissão da web para consultar pessoas (Person/Core).
    public const string ViewPeople = "people.view";

    public static IServiceCollection AddCustomersModule(this IServiceCollection services) =>
        services.AddScoped<CustomerQueries>();

    public static IEndpointRouteBuilder MapCustomersEndpoints(this IEndpointRouteBuilder app)
    {
        var customers = app.MapGroup("/api/v1/customers");

        customers.MapGet("/", async (ClaimsPrincipal user, CustomerQueries queries, CancellationToken ct,
            string? search, bool? includeInactive, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging)) return Paging.Invalid();
            var ids = SessionIds.From(user)!;
            return Results.Ok(await queries.SearchAsync(ids.BusinessId, search, includeInactive ?? false, paging, ct));
        }).RequirePermission(ViewPeople);

        customers.MapGet("/{id:long}", async (long id, ClaimsPrincipal user, CustomerQueries queries, CancellationToken ct) =>
        {
            var customer = await queries.FindAsync(SessionIds.From(user)!.BusinessId, id, ct);
            return customer is null ? Results.Problem(statusCode: StatusCodes.Status404NotFound) : Results.Ok(customer);
        }).RequirePermission(ViewPeople);

        return app;
    }
}
