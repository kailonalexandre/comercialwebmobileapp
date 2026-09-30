using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Sales.Receipts;

public enum ReceiptStatus { Ok, Refused, Forbidden, NotFound, Unavailable }

/// <param name="Code">error.code do ComercialWeb (business_rule, forbidden...). Em 422 sem código próprio (validação Laravel), "validation".</param>
/// <param name="Reason">connection_missing | customer_phone_missing quando o ComercialWeb informa.</param>
public sealed record ReceiptFailure(ReceiptStatus Status, string? Code = null, string? Reason = null, string? Message = null);

public sealed record ReceiptPdf(byte[] Content, string FileName);

/// <summary>
/// Comprovante da venda no ComercialWeb (/api/mobile/v1/sales/{id}/receipt/*), com a mesma assinatura HMAC das demais rotas de
/// máquina. O envio por WhatsApp e o PDF usam o serviço e o template da web; a API só repassa. Sem retry automático.
/// </summary>
public sealed partial class ReceiptClient(HttpClient http, IConfiguration config, TimeProvider clock, ILogger<ReceiptClient> logger)
{
    private const int MaxPdfBytes = 15 * 1024 * 1024;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<ReceiptFailure> SendWhatsAppAsync(long userId, long businessId, long saleId, string? phone, CancellationToken ct)
    {
        var (status, body, _) = await PostAsync($"/api/mobile/v1/sales/{saleId}/receipt/whatsapp", new { user_id = userId, business_id = businessId, phone }, ct);
        return status == HttpStatusCode.Accepted ? new ReceiptFailure(ReceiptStatus.Ok) : Failure(status, body);
    }

    public async Task<(ReceiptPdf? Pdf, ReceiptFailure? Failure)> PdfAsync(long userId, long businessId, long saleId, CancellationToken ct)
    {
        var (status, body, headers) = await PostAsync($"/api/mobile/v1/sales/{saleId}/receipt/pdf", new { user_id = userId, business_id = businessId }, ct);
        if (status != HttpStatusCode.OK) return (null, Failure(status, body));
        // Um 200 que não é PDF (proxy, página de erro) não pode chegar ao app como comprovante.
        if (headers?.ContentType?.MediaType != "application/pdf" || body.Length == 0 || body.Length > MaxPdfBytes)
        {
            LogNotPdf(logger);
            return (null, new ReceiptFailure(ReceiptStatus.Unavailable));
        }
        return (new ReceiptPdf(body, SafeFileName(headers.ContentDisposition?.FileName, saleId)), null);
    }

    // Só [A-Za-z0-9._-]: o nome vem de fora e vira nome de arquivo no aparelho.
    internal static string SafeFileName(string? raw, long saleId)
    {
        var last = (raw ?? "").Trim('"');
        last = last[(last.LastIndexOfAny(['/', '\\']) + 1)..]; // nunca um caminho: só o nome depois da última barra
        var name = new string(last.Where(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_').ToArray()).TrimStart('.');
        return name.Length is > 4 and <= 80 && name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? name : $"comprovante-{saleId}.pdf";
    }

    private async Task<(HttpStatusCode Status, byte[] Body, HttpContentHeaders? Headers)> PostAsync(string path, object payload, CancellationToken ct)
    {
        var secret = config["ComercialWeb:MobileApiSecret"];
        if (string.IsNullOrEmpty(secret) || http.BaseAddress is null)
        {
            LogNotConfigured(logger);
            return (HttpStatusCode.ServiceUnavailable, [], null);
        }

        var body = JsonSerializer.SerializeToUtf8Bytes(payload, Json);
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new ByteArrayContent(body) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/pdf"));
        var timestamp = clock.GetUtcNow().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        request.Headers.Add("X-Mobile-Timestamp", timestamp);
        request.Headers.Add("X-Mobile-Signature", MobileSignature.Sign(secret, timestamp, "POST", path, body));

        try
        {
            using var response = await http.SendAsync(request, ct);
            return (response.StatusCode, await response.Content.ReadAsByteArrayAsync(ct), response.Content.Headers);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return (HttpStatusCode.ServiceUnavailable, [], null);
        }
    }

    private ReceiptFailure Failure(HttpStatusCode status, byte[] body)
    {
        switch (status)
        {
            case HttpStatusCode.Forbidden:
                return new ReceiptFailure(ReceiptStatus.Forbidden);
            case HttpStatusCode.NotFound:
                return new ReceiptFailure(ReceiptStatus.NotFound);
            case HttpStatusCode.UnprocessableEntity:
                var dto = Read(body);
                var reason = dto?.Reason ?? dto?.Error?.Reason;
                // Sem error.code é validação estrutural do Laravel (ex.: telefone inválido): mensagem genérica nossa.
                return dto?.Error?.Code is { } code
                    ? new ReceiptFailure(ReceiptStatus.Refused, code, reason, dto.Error.Message)
                    : new ReceiptFailure(ReceiptStatus.Refused, "validation", reason);
            default:
                LogUnexpectedStatus(logger, (int)status);
                return new ReceiptFailure(ReceiptStatus.Unavailable);
        }
    }

    private static ErrorDto? Read(byte[] body)
    {
        try
        {
            return JsonSerializer.Deserialize<ErrorDto>(body, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record ErrorBody(string? Code, string? Message, string? Reason);
    private sealed record ErrorDto(ErrorBody? Error, string? Reason);

    [LoggerMessage(Level = LogLevel.Error, Message = "Integração com o ComercialWeb não configurada (ComercialWeb:BaseUrl / ComercialWeb:MobileApiSecret).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível no comprovante ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} ao comprovante (401 indica segredo divergente).")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu 200 ao PDF do comprovante sem ser um PDF válido.")]
    private static partial void LogNotPdf(ILogger logger);
}
