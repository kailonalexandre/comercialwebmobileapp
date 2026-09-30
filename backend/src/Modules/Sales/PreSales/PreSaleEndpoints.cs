using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ComercialWeb.Mobile.Sales.PreSales;

public sealed record PreSaleItemRequest(long ProductId, decimal Quantity, decimal? DiscountPercent = null, long? DiscountCents = null);

public sealed record PreSaleRequest(
    long? CustomerId, long? SellerPersonId, string? Observation, IReadOnlyList<PreSaleItemRequest>? Items,
    decimal? SaleDiscountPercent = null, long? SaleDiscountCents = null);

public static class PreSaleEndpoints
{
    // Mesma permissão da tela de pré-venda da web; o ComercialWeb confere de novo (sales.access + sales.create).
    public const string CreatePreSale = "sales.create";

    public static IEndpointRouteBuilder MapPreSaleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/v1/pre-sales", async (PreSaleRequest body, HttpContext http, ClaimsPrincipal user, ComercialWebClient comercialWeb, CancellationToken ct) =>
        {
            // A chave de idempotência nasce no app quando o pedido é montado e se repete em todo reenvio.
            if (!Guid.TryParse(http.Request.Headers["Idempotency-Key"].ToString(), out var key) || key == Guid.Empty || !IsValid(body))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);

            var ids = SessionIds.From(user)!;
            var outcome = await comercialWeb.SendPreSaleAsync(new PreSaleCommand(
                ids.UserId, ids.BusinessId, key, body.CustomerId, body.SellerPersonId, body.Observation?.Trim(),
                [.. body.Items!.Select(i => new PreSaleLine(i.ProductId, i.Quantity, i.DiscountPercent, i.DiscountCents))],
                body.SaleDiscountPercent, body.SaleDiscountCents), ct);

            return outcome switch
            {
                { Created: { AlreadyExisted: true } sale } => Results.Ok(sale),
                { Created: { } sale } => Results.Json(sale, statusCode: StatusCodes.Status201Created),
                { Failure: PreSaleFailure.Forbidden } => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
                { Failure: PreSaleFailure.BusinessRule } => Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity,
                    extensions: outcome.Message is null ? null : new Dictionary<string, object?> { ["code"] = outcome.Code, ["message"] = outcome.Message }),
                _ => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
            };
        }).RequirePermission(CreatePreSale);

        return app;
    }

    // Mesmos limites do FormRequest do ComercialWeb, para recusar aqui sem ida e volta.
    internal static bool IsValid(PreSaleRequest body) =>
        body.Items is { Count: >= 1 and <= 200 }
        && body.Items.All(i => i.ProductId > 0 && i.Quantity > 0 && i.Quantity <= 99_999 && decimal.Round(i.Quantity, 3) == i.Quantity
            && Discounts.IsValid(i.DiscountPercent, i.DiscountCents))
        && Discounts.IsValid(body.SaleDiscountPercent, body.SaleDiscountCents)
        && body.CustomerId is null or > 0
        && body.SellerPersonId is null or > 0
        && (body.Observation?.Length ?? 0) <= 1000;
}
