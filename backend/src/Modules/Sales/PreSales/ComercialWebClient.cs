using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Sales.PreSales;

public sealed record PreSaleLine(long ProductId, decimal Quantity, decimal? DiscountPercent = null, long? DiscountCents = null);

/// <summary>Pedido já validado; usuário e empresa vêm da sessão, nunca do app.</summary>
public sealed record PreSaleCommand(
    long UserId, long BusinessId, Guid ClientSaleUuid, long? CustomerId, long? SellerPersonId, string? Observation, IReadOnlyList<PreSaleLine> Items,
    decimal? SaleDiscountPercent = null, long? SaleDiscountCents = null, string? PriceTable = null);

public sealed record PreSaleCreated(long SaleId, string Number, string Status, long TotalCents, bool AlreadyExisted);

public enum PreSaleFailure { Forbidden, BusinessRule, Unavailable }

public sealed record PreSaleOutcome(PreSaleCreated? Created, PreSaleFailure? Failure, string? Message = null, string? Code = null);

/// <summary>
/// Envia pré-vendas ao ComercialWeb (POST /api/mobile/v1/pre-sales), onde as regras de venda da web são aplicadas.
/// Assinatura HMAC-SHA256 de "{timestamp}\n{MÉTODO}\n{caminho}\n{corpo}" com o segredo compartilhado entre os
/// dois servidores (ComercialWeb:MobileApiSecret). Sem retry automático: a repetição segura é o app reenviar com a
/// mesma Idempotency-Key, que vira client_sale_uuid e é deduplicada lá.
/// </summary>
public sealed partial class ComercialWebClient(HttpClient http, IConfiguration config, TimeProvider clock, ILogger<ComercialWebClient> logger)
{
    public const string PreSalesPath = "/api/mobile/v1/pre-sales";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<PreSaleOutcome> SendPreSaleAsync(PreSaleCommand command, CancellationToken ct)
    {
        var secret = config["ComercialWeb:MobileApiSecret"];
        if (string.IsNullOrEmpty(secret) || http.BaseAddress is null)
        {
            LogNotConfigured(logger);
            return new PreSaleOutcome(null, PreSaleFailure.Unavailable);
        }

        var body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            user_id = command.UserId,
            business_id = command.BusinessId,
            client_sale_uuid = command.ClientSaleUuid.ToString(),
            customer_id = command.CustomerId,
            seller_person_id = command.SellerPersonId,
            observation = command.Observation,
            items = command.Items.Select(i => new { product_id = i.ProductId, quantity = i.Quantity, discount_percent = i.DiscountPercent, discount_cents = i.DiscountCents }),
            sale_discount_percent = command.SaleDiscountPercent,
            sale_discount_cents = command.SaleDiscountCents,
            price_mode = command.PriceTable,
        }, Json);

        using var request = new HttpRequestMessage(HttpMethod.Post, PreSalesPath) { Content = new ByteArrayContent(body) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        var timestamp = clock.GetUtcNow().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        request.Headers.Add("X-Mobile-Timestamp", timestamp);
        request.Headers.Add("X-Mobile-Signature", MobileSignature.Sign(secret, timestamp, "POST", PreSalesPath, body));

        try
        {
            using var response = await http.SendAsync(request, ct);
            return await ReadAsync(response, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return new PreSaleOutcome(null, PreSaleFailure.Unavailable);
        }
    }

    private async Task<PreSaleOutcome> ReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        switch (response.StatusCode)
        {
            case HttpStatusCode.Created or HttpStatusCode.OK:
                var ok = await response.Content.ReadFromJsonAsync<CreatedDto>(Json, ct);
                return ok is null
                    ? new PreSaleOutcome(null, PreSaleFailure.Unavailable)
                    : new PreSaleOutcome(new PreSaleCreated(ok.SaleId, ok.Number, ok.Status, ok.TotalCents, ok.AlreadyExisted), null);
            case HttpStatusCode.Forbidden:
                return new PreSaleOutcome(null, PreSaleFailure.Forbidden);
            case HttpStatusCode.UnprocessableEntity:
                var error = await response.Content.ReadFromJsonAsync<ErrorDto>(Json, ct);
                // Só a mensagem de regra de negócio vai para o app; erro de validação estrutural fica genérico.
                return error?.Error?.Code is "business_rule" or "discount_limit_exceeded"
                    ? new PreSaleOutcome(null, PreSaleFailure.BusinessRule, error.Error.Message, error.Error.Code)
                    : new PreSaleOutcome(null, PreSaleFailure.BusinessRule);
            default:
                LogUnexpectedStatus(logger, (int)response.StatusCode);
                return new PreSaleOutcome(null, PreSaleFailure.Unavailable);
        }
    }

    private sealed record CreatedDto(long SaleId, string Number, string Status, long TotalCents, bool AlreadyExisted);
    private sealed record ErrorBody(string? Code, string? Message);
    private sealed record ErrorDto(ErrorBody? Error);

    [LoggerMessage(Level = LogLevel.Error, Message = "Integração com o ComercialWeb não configurada (ComercialWeb:BaseUrl / ComercialWeb:MobileApiSecret).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível ao enviar pré-venda ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} à pré-venda (401 indica segredo divergente).")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);
}
