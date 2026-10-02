using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Sales.Pdv;

public sealed record PdvItem(long ProductId, int Quantity, decimal? DiscountPercent = null, long? DiscountCents = null);

public sealed record PdvPayment(string Method, long AmountCents);

/// <summary>Pedido já validado; usuário e empresa vêm da sessão, nunca do app.</summary>
public sealed record PdvOrder(
    long UserId, long BusinessId, Guid? ClientSaleUuid, long? CustomerId, long? SellerPersonId, string? Observation,
    IReadOnlyList<PdvItem> Items, IReadOnlyList<PdvPayment>? Payments, decimal? SaleDiscountPercent = null, long? SaleDiscountCents = null,
    string? PriceTable = null);

public sealed record PdvQuoteLine(long ProductId, string Name, int Quantity, long UnitPriceCents, long TotalCents, long DiscountCents = 0);

public sealed record PdvQuote(long SubtotalCents, long DiscountCents, long TotalCents, IReadOnlyList<PdvQuoteLine> Items);

public sealed record PdvPaymentMethod(string Code, string Name);

public sealed record PdvSaleCreated(long SaleId, string Number, string Status, long TotalCents, long ChangeCents, bool AlreadyExisted);

/// <summary>Recusa com código estável do ComercialWeb (cash_register_closed, payment_incomplete, business_rule...).</summary>
public sealed record PdvRefusal(string Code, string? Message, long? TotalCents, long? RemainingCents);

public enum PdvFailure { Forbidden, Refused, Unavailable }

public sealed record PdvResult<T>(T? Value, PdvFailure? Failure = null, PdvRefusal? Refusal = null);

/// <summary>
/// PDV móvel no ComercialWeb (/api/mobile/v1/pdv/*), com a mesma assinatura HMAC da pré-venda. Tudo é POST porque a
/// assinatura cobre o corpo (usuário e empresa). Sem retry automático: a repetição segura é o app reenviar com a
/// mesma Idempotency-Key, que o ComercialWeb usa como client_sale_uuid.
/// </summary>
public sealed partial class PdvClient(HttpClient http, IConfiguration config, TimeProvider clock, ILogger<PdvClient> logger)
{
    public const string PaymentMethodsPath = "/api/mobile/v1/pdv/payment-methods";
    public const string QuotePath = "/api/mobile/v1/pdv/quote";
    public const string SalesPath = "/api/mobile/v1/pdv/sales";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<PdvResult<IReadOnlyList<PdvPaymentMethod>>> PaymentMethodsAsync(long userId, long businessId, CancellationToken ct)
    {
        var (status, body) = await PostAsync(PaymentMethodsPath, new { user_id = userId, business_id = businessId }, ct);
        if (status != HttpStatusCode.OK) return Failed<IReadOnlyList<PdvPaymentMethod>>(status, body);
        var dto = Read<MethodsDto>(body);
        return dto?.Methods is null
            ? new PdvResult<IReadOnlyList<PdvPaymentMethod>>(default, PdvFailure.Unavailable)
            : new PdvResult<IReadOnlyList<PdvPaymentMethod>>([.. dto.Methods.Select(m => new PdvPaymentMethod(m.Code, m.Name))]);
    }

    public async Task<PdvResult<PdvQuote>> QuoteAsync(PdvOrder order, CancellationToken ct)
    {
        var (status, body) = await PostAsync(QuotePath, Payload(order, includePayments: false), ct);
        if (status != HttpStatusCode.OK) return Failed<PdvQuote>(status, body);
        var dto = Read<QuoteDto>(body);
        return dto?.Items is null
            ? new PdvResult<PdvQuote>(default, PdvFailure.Unavailable)
            : new PdvResult<PdvQuote>(new PdvQuote(dto.SubtotalCents, dto.DiscountCents, dto.TotalCents,
                [.. dto.Items.Select(i => new PdvQuoteLine(i.ProductId, i.Name, i.Quantity, i.UnitPriceCents, i.TotalCents, i.DiscountCents))]));
    }

    public async Task<PdvResult<PdvSaleCreated>> SendSaleAsync(PdvOrder order, CancellationToken ct)
    {
        var (status, body) = await PostAsync(SalesPath, Payload(order, includePayments: true), ct);
        if (status is not (HttpStatusCode.Created or HttpStatusCode.OK)) return Failed<PdvSaleCreated>(status, body);
        var dto = Read<SaleDto>(body);
        return dto is null
            ? new PdvResult<PdvSaleCreated>(default, PdvFailure.Unavailable)
            : new PdvResult<PdvSaleCreated>(new PdvSaleCreated(dto.SaleId, dto.Number, dto.Status, dto.TotalCents, dto.ChangeCents, dto.AlreadyExisted));
    }

    private static object Payload(PdvOrder o, bool includePayments) => new
    {
        user_id = o.UserId,
        business_id = o.BusinessId,
        client_sale_uuid = o.ClientSaleUuid?.ToString(),
        customer_id = o.CustomerId,
        seller_person_id = o.SellerPersonId,
        observation = o.Observation,
        items = o.Items.Select(i => new { product_id = i.ProductId, quantity = i.Quantity, discount_percent = i.DiscountPercent, discount_cents = i.DiscountCents }),
        sale_discount_percent = o.SaleDiscountPercent,
        sale_discount_cents = o.SaleDiscountCents,
        price_mode = o.PriceTable,
        payments = includePayments ? o.Payments?.Select(p => new { method = p.Method, amount_cents = p.AmountCents }) : null,
    };

    private async Task<(HttpStatusCode Status, byte[] Body)> PostAsync(string path, object payload, CancellationToken ct)
    {
        var secret = config["ComercialWeb:MobileApiSecret"];
        if (string.IsNullOrEmpty(secret) || http.BaseAddress is null)
        {
            LogNotConfigured(logger);
            return (HttpStatusCode.ServiceUnavailable, []);
        }

        var body = JsonSerializer.SerializeToUtf8Bytes(payload, Json);
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new ByteArrayContent(body) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        var timestamp = clock.GetUtcNow().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        request.Headers.Add("X-Mobile-Timestamp", timestamp);
        request.Headers.Add("X-Mobile-Signature", MobileSignature.Sign(secret, timestamp, "POST", path, body));

        try
        {
            using var response = await http.SendAsync(request, ct);
            return (response.StatusCode, await response.Content.ReadAsByteArrayAsync(ct));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return (HttpStatusCode.ServiceUnavailable, []);
        }
    }

    private PdvResult<T> Failed<T>(HttpStatusCode status, byte[] body)
    {
        switch (status)
        {
            case HttpStatusCode.Forbidden:
                return new PdvResult<T>(default, PdvFailure.Forbidden);
            case HttpStatusCode.UnprocessableEntity:
                var error = Read<ErrorDto>(body)?.Error;
                // Só o que o ComercialWeb marca como texto de operador vai ao app; validação estrutural fica genérica.
                return new PdvResult<T>(default, PdvFailure.Refused, error is null
                    ? new PdvRefusal("invalid", null, null, null)
                    : new PdvRefusal(error.Code ?? "invalid", error.Code == "invalid" ? null : error.Message, error.TotalCents, error.RemainingCents));
            default:
                LogUnexpectedStatus(logger, (int)status);
                return new PdvResult<T>(default, PdvFailure.Unavailable);
        }
    }

    private static T? Read<T>(byte[] body)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(body, Json);
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private sealed record MethodDto(string Code, string Name);
    private sealed record MethodsDto(List<MethodDto>? Methods);
    private sealed record QuoteItemDto(long ProductId, string Name, int Quantity, long UnitPriceCents, long TotalCents, long DiscountCents = 0);
    private sealed record QuoteDto(long SubtotalCents, long DiscountCents, long TotalCents, List<QuoteItemDto>? Items);
    private sealed record SaleDto(long SaleId, string Number, string Status, long TotalCents, long ChangeCents, bool AlreadyExisted);
    private sealed record ErrorBody(string? Code, string? Message, long? TotalCents, long? RemainingCents);
    private sealed record ErrorDto(ErrorBody? Error);

    [LoggerMessage(Level = LogLevel.Error, Message = "Integração com o ComercialWeb não configurada (ComercialWeb:BaseUrl / ComercialWeb:MobileApiSecret).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível no PDV móvel ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} ao PDV móvel (401 indica segredo divergente).")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);
}
