using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Customers;

/// <summary>Resposta do ComercialWeb repassada ao app: só 200/201/422 carregam corpo; o resto vira 403/503 no endpoint.</summary>
public sealed record WebResponse(HttpStatusCode Status, byte[] Body);

/// <summary>
/// Cadastro de clientes no ComercialWeb (/api/mobile/v1/customers/*), onde ficam as regras de Pessoa da web
/// (CPF/CNPJ, telefone, unicidade, idempotência por client_uuid). Mesma assinatura HMAC da pré-venda; usuário e empresa
/// vão no corpo assinado. Sem retry automático: a repetição segura é o app reenviar com a mesma Idempotency-Key.
/// </summary>
public sealed partial class CustomerWebClient(HttpClient http, IConfiguration config, TimeProvider clock, ILogger<CustomerWebClient> logger)
{
    public const string QuickPath = "/api/mobile/v1/customers/quick";
    public const string DuplicatesPath = "/api/mobile/v1/customers/duplicates";
    public const string PostalCodePath = "/api/mobile/v1/customers/lookup/postal-code";
    public const string CompanyPath = "/api/mobile/v1/customers/lookup/company";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<WebResponse> PostAsync(string path, object payload, CancellationToken ct)
    {
        var secret = config["ComercialWeb:MobileApiSecret"];
        if (string.IsNullOrEmpty(secret) || http.BaseAddress is null)
        {
            LogNotConfigured(logger);
            return new WebResponse(HttpStatusCode.ServiceUnavailable, []);
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
            var status = response.StatusCode;
            if (status is not (HttpStatusCode.OK or HttpStatusCode.Created or HttpStatusCode.UnprocessableEntity or HttpStatusCode.Forbidden))
            {
                LogUnexpectedStatus(logger, (int)status);
                return new WebResponse(HttpStatusCode.ServiceUnavailable, []);
            }
            return new WebResponse(status, await response.Content.ReadAsByteArrayAsync(ct));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return new WebResponse(HttpStatusCode.ServiceUnavailable, []);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Integração com o ComercialWeb não configurada (ComercialWeb:BaseUrl / ComercialWeb:MobileApiSecret).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível no cadastro de clientes ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} ao cadastro de clientes (401 indica segredo divergente).")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);
}
