using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Catalog;

public sealed record PriceTable(string Key, string Label);

/// <summary>
/// Tabelas de preço e preços por tabela (/api/mobile/v1/price-tables, /products/prices). O ComercialWeb é a fonte de
/// verdade (PriceTablePrice + rótulos da empresa); aqui só se assina, repassa e converte. Mesma assinatura HMAC das
/// outras rotas de máquina. Falha vira null: quem chama decide se degrada ou responde 503.
/// </summary>
public sealed partial class PriceWebClient(HttpClient http, IConfiguration config, TimeProvider clock, ILogger<PriceWebClient> logger)
{
    public const string TablesPath = "/api/mobile/v1/price-tables";
    public const string PricesPath = "/api/mobile/v1/products/prices";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<IReadOnlyList<PriceTable>?> TablesAsync(long userId, long businessId, CancellationToken ct)
    {
        var dto = await PostAsync<TablesData>(TablesPath, new { user_id = userId, business_id = businessId }, ct);
        return dto?.Tables?.Select(t => new PriceTable(t.Key, t.Label)).ToList();
    }

    /// <summary>Preço unitário em centavos por produto e por tabela; produto sem preço na tabela não aparece.</summary>
    public async Task<IReadOnlyDictionary<long, IReadOnlyDictionary<string, long>>?> PricesAsync(
        long userId, long businessId, IReadOnlyCollection<long> productIds, CancellationToken ct)
    {
        if (productIds.Count == 0) return new Dictionary<long, IReadOnlyDictionary<string, long>>();
        var dto = await PostAsync<PricesData>(PricesPath, new { user_id = userId, business_id = businessId, product_ids = productIds }, ct);
        return dto?.Prices?.ToDictionary(kv => kv.Key, kv => (IReadOnlyDictionary<string, long>)kv.Value);
    }

    private async Task<T?> PostAsync<T>(string path, object payload, CancellationToken ct) where T : class
    {
        var secret = config["ComercialWeb:MobileApiSecret"];
        if (string.IsNullOrEmpty(secret) || http.BaseAddress is null)
        {
            LogNotConfigured(logger);
            return null;
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
            if (response.StatusCode != HttpStatusCode.OK)
            {
                LogUnexpectedStatus(logger, (int)response.StatusCode);
                return null;
            }
            return (await response.Content.ReadFromJsonAsync<Envelope<T>>(Json, ct))?.Data;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return null;
        }
    }

    private sealed record Envelope<T>(T? Data);
    private sealed record TableDto(string Key, string Label);
    private sealed record TablesData(List<TableDto>? Tables);
    private sealed record PricesData(Dictionary<long, Dictionary<string, long>>? Prices);

    [LoggerMessage(Level = LogLevel.Error, Message = "Integração com o ComercialWeb não configurada (ComercialWeb:BaseUrl / ComercialWeb:MobileApiSecret).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível ao consultar preços ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} à consulta de preços (401 indica segredo divergente).")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);
}
