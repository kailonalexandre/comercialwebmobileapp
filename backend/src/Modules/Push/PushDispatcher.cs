using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Push;

/// <summary>
/// Varre `notifications` e envia push por Expo aos dispositivos com sessão ativa. Polling (não é tempo real).
/// ponytail: instância única; com várias instâncias da API cada uma enviaria (duplicado), então precisaria de lock (ex.: GET_LOCK).
/// </summary>
public sealed partial class PushDispatcher(PushStore store, IPushSender sender, TimeProvider clock, IConfiguration config, ILogger<PushDispatcher> log) : BackgroundService
{
    public const int PerCycleCap = 50;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue("Push:Enabled", false)) return;
        var period = TimeSpan.FromSeconds(Math.Max(1, config.GetValue("Push:PollSeconds", 15)));
        using var timer = new PeriodicTimer(period);
        do
        {
            try { await RunOnceAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { LogCycleFailed(ex.GetType().Name); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>Um ciclo. Lança em falha do envio (a marca d'água do dispositivo fica onde estava, retenta no próximo ciclo).</summary>
    public async Task RunOnceAsync(CancellationToken ct)
    {
        foreach (var token in await store.ActiveTokensAsync(clock.GetUtcNow().UtcDateTime, ct))
        {
            var pending = await store.PendingAsync(token, PerCycleCap, ct);
            if (pending.Count == 0) continue;

            var results = await sender.SendAsync(
                [.. pending.Select(n => new PushMessage(token.Token, n.Title, n.Body, n.Id, n.EntityType, n.EntityId))], ct);

            // Avança até a última entrega OK antes do primeiro erro; erro genérico será tentado de novo.
            long? lastOk = null;
            for (var i = 0; i < pending.Count; i++)
            {
                if (results[i] == PushOutcome.DeviceNotRegistered)
                {
                    await store.DeleteAsync(token.SessionId, ct);
                    lastOk = null;
                    break;
                }
                if (results[i] == PushOutcome.Error)
                {
                    LogRejected(pending[i].Id);
                    break;
                }
                lastOk = pending[i].Id;
            }
            if (lastOk is { } id) await store.AdvanceAsync(token.SessionId, id, ct);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Ciclo de push falhou ({Error}); nova tentativa no próximo ciclo.")]
    private partial void LogCycleFailed(string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Expo recusou a notificação {NotificationId}; tentará de novo.")]
    private partial void LogRejected(long notificationId);
}
