using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Push;

public sealed record ActiveToken(Guid SessionId, string Token, long UserId, long BusinessId, long LastNotificationId);

public sealed record PendingNotification(long Id, string Title, string Body, string? EntityType, long? EntityId);

/// <summary>SQL do módulo: tokens em mobile_push_tokens (da API) e leitura de `notifications` (do ComercialWeb, somente leitura).</summary>
public sealed class PushStore(MySqlDataSource db)
{
    /// <summary>Registra o token da sessão. Token que muda de sessão substitui a linha antiga. A marca d'água nunca recua.</summary>
    public async Task UpsertAsync(Guid sessionId, long userId, string token, string platform, DateTime utcNow, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        var args = new { sid = sessionId.ToString(), userId, token, platform, now = utcNow };
        await conn.ExecuteAsync(new CommandDefinition("DELETE FROM mobile_push_tokens WHERE token = @token AND session_id <> @sid", args, tx, cancellationToken: ct));
        // Notificações que já existem não são enviadas: a marca d'água começa no maior id do usuário.
        await conn.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO mobile_push_tokens (session_id, token, platform, created_at, updated_at, last_notification_id)
            VALUES (@sid, @token, @platform, @now, @now, (SELECT COALESCE(MAX(id), 0) FROM notifications WHERE user_id = @userId))
            ON DUPLICATE KEY UPDATE token = @token, platform = @platform, updated_at = @now
            """, args, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    public async Task DeleteAsync(Guid sessionId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition("DELETE FROM mobile_push_tokens WHERE session_id = @sid", new { sid = sessionId.ToString() }, cancellationToken: ct));
    }

    /// <summary>Só sessões ativas: logout/revogação/expiração (mobile_sessions, UTC) param os envios.</summary>
    public async Task<IReadOnlyList<ActiveToken>> ActiveTokensAsync(DateTime utcNow, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<ActiveToken>(new CommandDefinition(
            """
            SELECT t.session_id AS SessionId, t.token AS Token, CAST(s.user_id AS SIGNED) AS UserId,
                   CAST(s.business_id AS SIGNED) AS BusinessId, CAST(t.last_notification_id AS SIGNED) AS LastNotificationId
            FROM mobile_push_tokens t
            JOIN mobile_sessions s ON s.id = t.session_id
            WHERE s.revoked_at IS NULL AND s.expires_at > @utcNow
            """, new { utcNow }, cancellationToken: ct))).AsList();
    }

    /// <summary>Mesmo escopo do sino: do usuário, da empresa da sessão ou sem empresa; não lidas e não arquivadas.</summary>
    public async Task<IReadOnlyList<PendingNotification>> PendingAsync(ActiveToken t, int limit, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<PendingNotification>(new CommandDefinition(
            """
            SELECT CAST(n.id AS SIGNED) AS Id, n.title AS Title, n.body AS Body, n.entity_type AS EntityType, CAST(n.entity_id AS SIGNED) AS EntityId
            FROM notifications n
            WHERE n.user_id = @UserId AND (n.business_id = @BusinessId OR n.business_id IS NULL)
              AND n.id > @LastNotificationId AND n.read_at IS NULL AND n.archived_at IS NULL
            ORDER BY n.id LIMIT @limit
            """, new { t.UserId, t.BusinessId, t.LastNotificationId, limit }, cancellationToken: ct))).AsList();
    }

    public async Task AdvanceAsync(Guid sessionId, long notificationId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE mobile_push_tokens SET last_notification_id = GREATEST(last_notification_id, @notificationId) WHERE session_id = @sid",
            new { sid = sessionId.ToString(), notificationId }, cancellationToken: ct));
    }
}
