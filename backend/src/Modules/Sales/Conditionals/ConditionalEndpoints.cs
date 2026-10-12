using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Sales.Pdv;
using ComercialWeb.Mobile.Sales.PreSales;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ComercialWeb.Mobile.Sales.Conditionals;

public sealed record ConditionalItemRequest(long ProductId, decimal Quantity);

public sealed record ConditionalRequest(long? CustomerId, long? SellerPersonId, string? Observation, IReadOnlyList<ConditionalItemRequest>? Items, string? PriceTable = null);

public sealed record BagMoveRequest(long ItemId, string? Kind, decimal Quantity);

public sealed record BagFinalizeRequest(IReadOnlyList<PdvPaymentRequest>? Payments);

public static class ConditionalEndpoints
{
    // Mesma permissão do grupo de rotas do Novo Condicional da web; o ComercialWeb confere de novo.
    public const string SaveConditional = "sales.access";

    public static IEndpointRouteBuilder MapConditionalEndpoints(this IEndpointRouteBuilder app)
    {
        // Só salvar (baixa o estoque como na tela); finalizar continua na web. A chave de idempotência nasce no app
        // quando a sacola é montada e se repete em todo reenvio: o ComercialWeb devolve o mesmo condicional.
        app.MapPost("/api/v1/conditionals", async (ConditionalRequest body, HttpContext http, ClaimsPrincipal user, ComercialWebClient comercialWeb, CancellationToken ct) =>
        {
            if (!Guid.TryParse(http.Request.Headers["Idempotency-Key"].ToString(), out var key) || key == Guid.Empty || !IsValid(body))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);

            var ids = SessionIds.From(user)!;
            var outcome = await comercialWeb.SendConditionalAsync(new ConditionalCommand(
                ids.UserId, ids.BusinessId, key, body.CustomerId!.Value, body.SellerPersonId, body.Observation?.Trim(),
                [.. body.Items!.Select(i => new ConditionalLine(i.ProductId, i.Quantity))], body.PriceTable), ct);

            return outcome switch
            {
                { Created: { AlreadyExisted: true } conditional } => Results.Ok(conditional),
                { Created: { } conditional } => Results.Json(conditional, statusCode: StatusCodes.Status201Created),
                { Failure: PreSaleFailure.Forbidden } => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
                { Failure: PreSaleFailure.BusinessRule } => Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity,
                    extensions: outcome.Message is null ? null : new Dictionary<string, object?> { ["code"] = outcome.Code, ["message"] = outcome.Message }),
                _ => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
            };
        }).RequirePermission(SaveConditional);

        // Sacola na rua: o vendedor acompanha, dá baixa por peça (vendida/devolvida, idempotente pela chave do app)
        // e encerra com o recebimento. As regras (estoque, total, caixa, título) são todas do ComercialWeb.
        app.MapGet("/api/v1/conditionals/open", async (ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var result = await client.OpenBagsAsync(ids.UserId, ids.BusinessId, ct);
            return result.Value is { } bags ? Results.Ok(new { data = bags }) : Problem(result);
        }).RequirePermission(SaveConditional);

        app.MapGet("/api/v1/conditionals/{id:long}", async (long id, ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var result = await client.BagAsync(ids.UserId, ids.BusinessId, id, ct);
            return result.Value is { } bag ? Results.Ok(bag) : Problem(result);
        }).RequirePermission(SaveConditional);

        app.MapPost("/api/v1/conditionals/{id:long}/movements", async (long id, BagMoveRequest body, HttpContext http, ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            if (!Guid.TryParse(http.Request.Headers["Idempotency-Key"].ToString(), out var key) || key == Guid.Empty || !IsValidMove(body))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);

            var ids = SessionIds.From(user)!;
            var result = await client.MoveAsync(ids.UserId, ids.BusinessId, id, key, body.ItemId, body.Kind!, body.Quantity, ct);
            return result.Value is { } update ? Results.Ok(update) : Problem(result);
        }).RequirePermission(SaveConditional);

        app.MapPost("/api/v1/conditionals/{id:long}/finalize", async (long id, BagFinalizeRequest body, ClaimsPrincipal user, PdvClient client, CancellationToken ct) =>
        {
            // Condicional sem saldo (tudo devolvido) fecha sem pagamento; a lista pode vir vazia.
            if (body.Payments is not { Count: <= 8 } payments || (payments.Count > 0 && !PdvEndpoints.ValidPayments(payments)))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);

            var ids = SessionIds.From(user)!;
            var result = await client.FinalizeBagAsync(ids.UserId, ids.BusinessId, id, [.. payments.Select(p => new PdvPayment(p.Method!.Trim(), p.AmountCents))], ct);
            return result.Value is { } update ? Results.Ok(update) : Problem(result);
        }).RequirePermission(SaveConditional);

        return app;
    }

    internal static bool IsValidMove(BagMoveRequest body) =>
        body.ItemId > 0 && body.Kind is "sold" or "returned" && body.Quantity is > 0 and <= 99_999 && decimal.Round(body.Quantity, 3) == body.Quantity;

    private static IResult Problem<T>(PdvResult<T> result) => result switch
    {
        { Failure: PdvFailure.Forbidden } => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
        { Failure: PdvFailure.Refused, Refusal: { } r } => Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity,
            extensions: r.Message is null ? null : new Dictionary<string, object?> { ["code"] = r.Code, ["message"] = r.Message }),
        _ => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
    };

    // Mesmos limites do FormRequest do ComercialWeb, para recusar aqui sem ida e volta.
    internal static bool IsValid(ConditionalRequest body) =>
        body.CustomerId is > 0
        && body.Items is { Count: >= 1 and <= 200 }
        && body.Items.All(i => i.ProductId > 0 && i.Quantity > 0 && i.Quantity <= 99_999 && decimal.Round(i.Quantity, 3) == i.Quantity)
        && body.SellerPersonId is null or > 0
        && (body.Observation?.Length ?? 0) <= 1000
        && PriceTables.IsValidKey(body.PriceTable);
}
