using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace ComercialWeb.Mobile.Push;

public sealed record PushMessage(string To, string Title, string Body, long NotificationId, string? EntityType, long? EntityId);

public enum PushOutcome { Ok, DeviceNotRegistered, Error }

public interface IPushSender
{
    /// <summary>Um resultado por mensagem, na mesma ordem. Falha de rede/HTTP não-2xx lança (nada foi entregue).</summary>
    Task<IReadOnlyList<PushOutcome>> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken ct);
}

/// <summary>Expo Push API. O token de acesso opcional (Push:ExpoAccessToken) vai só no header e nunca é logado.</summary>
public sealed class ExpoPushSender(HttpClient http, IConfiguration config) : IPushSender
{
    public const string Endpoint = "https://exp.host/--/api/v2/push/send";
    public const int BatchSize = 100;

    public async Task<IReadOnlyList<PushOutcome>> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken ct)
    {
        var results = new List<PushOutcome>(messages.Count);
        foreach (var batch in messages.Chunk(BatchSize))
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
            {
                Content = JsonContent.Create(batch.Select(m => new
                {
                    to = m.To,
                    title = m.Title,
                    body = m.Body,
                    sound = "default",
                    priority = "high",
                    channelId = "default",
                    data = new { notificationId = m.NotificationId, entityType = m.EntityType, entityId = m.EntityId },
                })),
            };
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (config["Push:ExpoAccessToken"] is { Length: > 0 } token)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await http.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            var body = await response.Content.ReadFromJsonAsync<ExpoResponse>(ct);
            if (body?.Data is null || body.Data.Count != batch.Length)
                throw new InvalidOperationException("Resposta do Expo Push fora do formato esperado.");
            results.AddRange(body.Data.Select(t => t.Status == "ok" ? PushOutcome.Ok
                : t.Details?.Error == "DeviceNotRegistered" ? PushOutcome.DeviceNotRegistered : PushOutcome.Error));
        }
        return results;
    }

    private sealed record ExpoResponse([property: JsonPropertyName("data")] List<Ticket>? Data);

    private sealed record Ticket([property: JsonPropertyName("status")] string? Status, [property: JsonPropertyName("details")] TicketDetails? Details);

    private sealed record TicketDetails([property: JsonPropertyName("error")] string? Error);
}
