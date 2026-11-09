using System.Data.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Identity.Application;

/// <summary>
/// Validade da sessão aberta num aparelho vinculado, por modo. Os valores vêm da configuração (Auth:Personal:*,
/// Auth:Shared:*); o app recebe só o que usa (bloqueio por inatividade, janela offline), nunca decide sozinho.
/// </summary>
/// <param name="Lifetime">Expiração absoluta: passou, só com nova autenticação completa (biometria não renova).</param>
/// <param name="Idle">Sem nenhum refresh por este tempo, a sessão cai no servidor.</param>
/// <param name="IdleLockSeconds">Inatividade na tela até o app bloquear (pessoal: biometria; compartilhado: volta à troca de operador).</param>
/// <param name="OfflineHours">Quanto tempo sem falar com o servidor o app ainda grava operações para sincronizar depois.</param>
public sealed record SessionPolicy(string Mode, TimeSpan Lifetime, TimeSpan Idle, int IdleLockSeconds, int OfflineHours)
{
    public const string Personal = "personal";
    public const string Shared = "shared";

    public static SessionPolicy For(string? mode, IConfiguration? config) => mode == Shared
        ? new(Shared,
            TimeSpan.FromHours(Value(config, "Auth:Shared:SessionHours", 12)),
            TimeSpan.FromMinutes(Value(config, "Auth:Shared:IdleMinutes", 30)),
            Value(config, "Auth:Shared:IdleLockSeconds", 120),
            Value(config, "Auth:Shared:OfflineHours", 12))
        : new(Personal,
            TimeSpan.FromDays(Value(config, "Auth:Personal:SessionDays", 30)),
            TimeSpan.FromDays(Value(config, "Auth:Personal:IdleDays", 7)),
            Value(config, "Auth:Personal:IdleLockSeconds", 300),
            Value(config, "Auth:Personal:OfflineHours", 72));

    private static int Value(IConfiguration? config, string key, int fallback) => config?.GetValue<int?>(key) is int v and > 0 ? v : fallback;
}

/// <summary>Grava na trilha do ComercialWeb sem nunca derrubar a operação: erro de banco vira aviso no log.</summary>
public sealed partial class AuditTrail(IIdentityStore store, ILogger<AuditTrail> logger)
{
    public async Task RecordAsync(AuditEvent audit, CancellationToken ct)
    {
        try
        {
            await store.RecordAuditAsync(audit, ct);
        }
        catch (DbException e)
        {
            LogFailed(logger, audit.Event, e.GetType().Name);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Auditoria mobile não gravada ({Event}): {Error}.")]
    private static partial void LogFailed(ILogger logger, string @event, string error);
}
