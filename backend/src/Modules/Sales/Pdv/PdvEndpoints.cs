using System.Security.Claims;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ComercialWeb.Mobile.Sales.Pdv;

public sealed record PdvItemRequest(long ProductId, int Quantity, decimal? DiscountPercent = null, long? DiscountCents = null);

public sealed record PdvPaymentRequest(string? Method, long AmountCents);

public record PdvQuoteRequest(
    long? CustomerId, long? SellerPersonId, string? Observation, IReadOnlyList<PdvItemRequest>? Items,
    decimal? SaleDiscountPercent = null, long? SaleDiscountCents = null);

public sealed record PdvSaleRequest(
    long? CustomerId, long? SellerPersonId, string? Observation, IReadOnlyList<PdvItemRequest>? Items, IReadOnlyList<PdvPaymentRequest>? Payments,
    decimal? SaleDiscountPercent = null, long? SaleDiscountCents = null)
    : PdvQuoteRequest(CustomerId, SellerPersonId, Observation, Items, SaleDiscountPercent, SaleDiscountCents);

public static class PdvEndpoints
{
    // Mesma permissão do grupo de rotas do PDV da web; o ComercialWeb confere de novo.
    public const string UsePdv = "pdv.access";

    public static IEndpointRouteBuilder MapPdvEndpoints(this IEndpointRouteBuilder app)
    {
        var pdv = app.MapGroup("/api/v1/pdv");

        pdv.MapGet("/payment-methods", async (ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var result = await client.PaymentMethodsAsync(ids.UserId, ids.BusinessId, ct);
            return result.Value is { } methods ? Results.Ok(new { methods }) : Problem(result);
        }).RequirePermission(UsePdv);

        pdv.MapPost("/quote", async (PdvQuoteRequest body, ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            if (!IsValid(body)) return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            var ids = SessionIds.From(user)!;
            var result = await client.QuoteAsync(Order(ids, null, body, null), ct);
            return result.Value is { } quote ? Results.Ok(quote) : Problem(result);
        }).RequirePermission(UsePdv);

        pdv.MapPost("/sales", async (PdvSaleRequest body, HttpContext http, ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            // A chave nasce no app ao montar a venda e se repete em todo reenvio: vira client_sale_uuid no ComercialWeb.
            if (!Guid.TryParse(http.Request.Headers["Idempotency-Key"].ToString(), out var key) || key == Guid.Empty
                || !IsValid(body) || !ValidPayments(body.Payments))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);

            var ids = SessionIds.From(user)!;
            var payments = body.Payments!.Select(p => new PdvPayment(p.Method!.Trim(), p.AmountCents)).ToList();
            var result = await client.SendSaleAsync(Order(ids, key, body, payments), ct);
            return result.Value switch
            {
                { AlreadyExisted: true } sale => Results.Ok(sale),
                { } sale => Results.Json(sale, statusCode: StatusCodes.Status201Created),
                _ => Problem(result),
            };
        }).RequirePermission(UsePdv);

        return app;
    }

    private static PdvOrder Order(SessionIds ids, Guid? key, PdvQuoteRequest body, IReadOnlyList<PdvPayment>? payments) =>
        new(ids.UserId, ids.BusinessId, key, body.CustomerId, body.SellerPersonId, body.Observation?.Trim(),
            [.. body.Items!.Select(i => new PdvItem(i.ProductId, i.Quantity, i.DiscountPercent, i.DiscountCents))], payments,
            body.SaleDiscountPercent, body.SaleDiscountCents);

    // Mesmos limites do FormRequest do ComercialWeb, para recusar aqui sem ida e volta.
    internal static bool IsValid(PdvQuoteRequest body) =>
        body.Items is { Count: >= 1 and <= 200 }
        && body.Items.All(i => i.ProductId > 0 && i.Quantity is >= 1 and <= 99_999 && Discounts.IsValid(i.DiscountPercent, i.DiscountCents))
        && Discounts.IsValid(body.SaleDiscountPercent, body.SaleDiscountCents)
        && (body.Observation?.Length ?? 0) <= 1000;

    internal static bool ValidPayments(IReadOnlyList<PdvPaymentRequest>? payments) =>
        payments is { Count: >= 1 and <= 8 }
        && payments.All(p => !string.IsNullOrWhiteSpace(p.Method) && p.Method.Length <= 40 && p.AmountCents is >= 1 and <= 100_000_000);

    private static IResult Problem<T>(PdvResult<T> result) => result switch
    {
        { Failure: PdvFailure.Forbidden } => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
        { Failure: PdvFailure.Refused, Refusal: { } r } => Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity, extensions: Extensions(r)),
        _ => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
    };

    private static Dictionary<string, object?> Extensions(PdvRefusal r)
    {
        var e = new Dictionary<string, object?> { ["code"] = r.Code };
        if (r.Message is not null) e["message"] = r.Message;
        if (r.TotalCents is not null) e["totalCents"] = r.TotalCents;
        if (r.RemainingCents is not null) e["remainingCents"] = r.RemainingCents;
        return e;
    }
}
