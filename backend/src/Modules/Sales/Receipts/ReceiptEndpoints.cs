using System.Security.Claims;
using System.Text.RegularExpressions;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ComercialWeb.Mobile.Sales.Receipts;

public sealed record ReceiptWhatsAppRequest(string? Phone);

/// <summary>
/// Comprovante da venda: o ComercialWeb gera o PDF e envia pelo WhatsApp da empresa com o template configurado lá.
/// O app só pede o envio (WhatsApp) ou baixa o PDF para compartilhar por outros apps.
/// </summary>
public static partial class ReceiptEndpoints
{
    // Basta uma destas (mesmas que o ComercialWeb aceita); ele confere de novo, junto com a empresa da venda.
    private static readonly string[] Permissions = ["sales.view", "sales.access", "pdv.access"];

    [GeneratedRegex(@"^[0-9+()\-\s]{8,25}$")]
    private static partial Regex PhoneShape();

    public static IEndpointRouteBuilder MapReceiptEndpoints(this IEndpointRouteBuilder app)
    {
        var receipt = app.MapGroup("/api/v1/sales/{id:long:min(1)}/receipt");

        receipt.MapPost("/whatsapp", async (long id, ReceiptWhatsAppRequest? body, ClaimsPrincipal user, ReceiptClient client, CancellationToken ct) =>
        {
            var phone = body?.Phone?.Trim();
            if (phone is { Length: 0 }) phone = null;
            if (phone is not null && !PhoneShape().IsMatch(phone)) return Problem(new ReceiptFailure(ReceiptStatus.Refused, "validation"));

            var ids = SessionIds.From(user)!;
            var result = await client.SendWhatsAppAsync(ids.UserId, ids.BusinessId, id, phone, ct);
            return result.Status == ReceiptStatus.Ok
                ? Results.Json(new { message = "Comprovante enviado para a fila do WhatsApp." }, statusCode: StatusCodes.Status202Accepted)
                : Problem(result);
        }).RequireAnyPermission(Permissions);

        receipt.MapPost("/pdf", async (long id, ClaimsPrincipal user, ReceiptClient client, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            var (pdf, failure) = await client.PdfAsync(ids.UserId, ids.BusinessId, id, ct);
            return pdf is null ? Problem(failure!) : Results.File(pdf.Content, "application/pdf", pdf.FileName);
        }).RequireAnyPermission(Permissions);

        return app;
    }

    private static IResult Problem(ReceiptFailure f) => f.Status switch
    {
        ReceiptStatus.Forbidden => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
        ReceiptStatus.NotFound => Results.Problem(statusCode: StatusCodes.Status404NotFound),
        ReceiptStatus.Refused => Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity, extensions: Extensions(f)),
        _ => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
    };

    private static Dictionary<string, object?> Extensions(ReceiptFailure f)
    {
        var e = new Dictionary<string, object?> { ["code"] = f.Code };
        if (f.Reason is not null) e["reason"] = f.Reason;
        // Só texto de operador do ComercialWeb; validação estrutural fica sem mensagem (o app usa a dele).
        if (f.Message is not null && f.Code != "validation") e["message"] = f.Message;
        return e;
    }
}
