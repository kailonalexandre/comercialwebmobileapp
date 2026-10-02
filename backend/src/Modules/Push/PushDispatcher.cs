using ComercialWeb.Mobile.Common;
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
        // Espera alguns segundos antes de avisar: a API marca a venda que o app acabou de criar (mobile_sale_origins)
        // logo depois da resposta do ComercialWeb, e o aviso dessa venda não deve chegar ao próprio celular.
        var grace = config.GetValue("Push:OriginGraceSeconds", 8);
        DateTime? createdBefore = grace > 0 ? LocalTime.Now(config, clock).AddSeconds(-grace) : null;

        foreach (var token in await store.ActiveTokensAsync(clock.GetUtcNow().UtcDateTime, ct))
        {
            var pending = await store.PendingAsync(token, PerCycleCap, createdBefore, ct);
            if (pending.Count == 0) continue;

            // Vendas feitas pelo próprio app (só avisam no web) e domínios silenciados não geram push; a marca d'água avança por cima.
            var toSend = pending.Where(n => !n.Skip).ToList();
            var results = toSend.Count == 0
                ? []
                : await sender.SendAsync([.. toSend.Select(n => new PushMessage(token.Token, n.Title, n.Body, n.Id, n.EntityType, n.EntityId))], ct);
            var outcomes = toSend.Zip(results).ToDictionary(x => x.First.Id, x => x.Second);

            // Avança até a última entrega OK (ou item sem push: venda do app/silenciado) antes do primeiro erro.
            long? lastOk = null;
            foreach (var n in pending)
            {
                if (n.Skip)
                {
                    lastOk = n.Id;
                    continue;
                }
                if (outcomes[n.Id] == PushOutcome.DeviceNotRegistered)
                {
                    await store.DeleteAsync(token.SessionId, ct);
                    lastOk = null;
                    break;
                }
                if (outcomes[n.Id] == PushOutcome.Error)
                {
                    LogRejected(n.Id);
                    break;
                }
                lastOk = n.Id;
            }
            if (lastOk is { } id) await store.AdvanceAsync(token.SessionId, id, ct);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Ciclo de push falhou ({Error}); nova tentativa no próximo ciclo.")]
    private partial void LogCycleFailed(string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Expo recusou a notificação {NotificationId}; tentará de novo.")]
    private partial void LogRejected(long notificationId);
}
