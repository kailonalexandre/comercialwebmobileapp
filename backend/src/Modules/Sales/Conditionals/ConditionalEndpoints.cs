using System.Security.Claims;
using ComercialWeb.Mobile.Common;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Sales.PreSales;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ComercialWeb.Mobile.Sales.Conditionals;

public sealed record ConditionalItemRequest(long ProductId, decimal Quantity);

public sealed record ConditionalRequest(long? CustomerId, long? SellerPersonId, string? Observation, IReadOnlyList<ConditionalItemRequest>? Items, string? PriceTable = null);

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

        return app;
    }

    // Mesmos limites do FormRequest do ComercialWeb, para recusar aqui sem ida e volta.
    internal static bool IsValid(ConditionalRequest body) =>
        body.CustomerId is > 0
        && body.Items is { Count: >= 1 and <= 200 }
        && body.Items.All(i => i.ProductId > 0 && i.Quantity > 0 && i.Quantity <= 99_999 && decimal.Round(i.Quantity, 3) == i.Quantity)
        && body.SellerPersonId is null or > 0
        && (body.Observation?.Length ?? 0) <= 1000
        && PriceTables.IsValidKey(body.PriceTable);
}
