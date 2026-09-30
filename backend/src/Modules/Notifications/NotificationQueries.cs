using ComercialWeb.Mobile.Common;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Notifications;

public sealed record NotificationItem(
    long Id, Guid Uuid, string TypeKey, string Domain, string Severity, string Title, string Body,
    string? EntityType, long? EntityId, DateTime? CreatedAt, DateTime? ReadAt, DateTime? ArchivedAt);

public sealed record UnreadCounts(long Count, long CriticalCount);

public sealed record NotificationFilter(bool Archived, bool? Read, string? Domain, string? Severity, string? Search);

/// <summary>
/// Notificações do usuário da sessão (tabela `notifications` do ComercialWeb), com os mesmos recortes da web:
/// do usuário, da empresa atual ou sem empresa, ativas por padrão. Não expõe `url` (é rota da web) nem `context`.
/// Única escrita do app em tabela do ComercialWeb: read_at/archived_at/updated_at, só de linhas do próprio
/// usuário, com a mesma semântica de NotificationRepository (sem regra nem efeito colateral na web).
/// Recomenda-se conceder ao usuário MySQL da API apenas UPDATE (read_at, archived_at, updated_at) nessa tabela.
/// </summary>
public sealed class NotificationQueries(MySqlDataSource db)
{
    public static readonly IReadOnlySet<string> Severities = new HashSet<string>(StringComparer.Ordinal) { "info", "success", "warning", "critical" };

    private const string Scope = "n.user_id = @userId AND (n.business_id = @businessId OR n.business_id IS NULL)";

    public async Task<PagedResult<NotificationItem>> SearchAsync(long userId, long businessId, NotificationFilter filter, Paging paging, CancellationToken ct)
    {
        var term = SqlText.NormalizeSearch(filter.Search);
        var args = new
        {
            userId,
            businessId,
            archived = filter.Archived,
            read = filter.Read,
            domain = filter.Domain,
            severity = filter.Severity,
            like = term is null ? null : SqlText.ContainsPattern(term),
            offset = paging.Offset,
            pageSize = paging.PageSize,
        };
        const string where = $"""
            FROM notifications n
            WHERE {Scope}
              AND ((@archived = 1 AND n.archived_at IS NOT NULL) OR (@archived = 0 AND n.archived_at IS NULL))
              AND (@read IS NULL OR (@read = 1 AND n.read_at IS NOT NULL) OR (@read = 0 AND n.read_at IS NULL))
              AND (@domain IS NULL OR n.domain = @domain)
              AND (@severity IS NULL OR n.severity = @severity)
              AND (@like IS NULL OR n.title LIKE @like OR n.body LIKE @like)
            """;

        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<NotificationItem>(new CommandDefinition(
            $"""
            SELECT CAST(n.id AS SIGNED) AS Id, n.uuid AS Uuid, n.type_key AS TypeKey, n.domain AS Domain, n.severity AS Severity,
                   n.title AS Title, n.body AS Body, n.entity_type AS EntityType, CAST(n.entity_id AS SIGNED) AS EntityId,
                   n.created_at AS CreatedAt, n.read_at AS ReadAt, n.archived_at AS ArchivedAt
            {where}
            ORDER BY n.created_at DESC, n.id DESC LIMIT @pageSize OFFSET @offset
            """, args, cancellationToken: ct))).AsList();
        return new PagedResult<NotificationItem>(items, paging.Page, paging.PageSize, total);
    }

    /// <summary>Contador do sino: ativas e não lidas (as críticas à parte), como NotificationRepository::unreadCount.</summary>
    public async Task<UnreadCounts> UnreadCountsAsync(long userId, long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleAsync<UnreadCounts>(new CommandDefinition(
            $"""
            SELECT COUNT(*) AS Count, CAST(COALESCE(SUM(n.severity = 'critical'), 0) AS SIGNED) AS CriticalCount
            FROM notifications n WHERE {Scope} AND n.archived_at IS NULL AND n.read_at IS NULL
            """,
            new { userId, businessId }, cancellationToken: ct));
    }

    /// <summary>Idempotente: lida continua com o horário original. False = não existe ou é de outro usuário (404).</summary>
    public async Task<bool> MarkReadAsync(long userId, long businessId, long id, DateTime localNow, CancellationToken ct)
    {
        // Atribuições do UPDATE avaliam da esquerda para a direita: updated_at antes de read_at.
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(
            $"UPDATE notifications n SET n.updated_at = IF(n.read_at IS NULL, @now, n.updated_at), n.read_at = COALESCE(n.read_at, @now) WHERE n.id = @id AND {Scope}",
            new { userId, businessId, id, now = localNow }, cancellationToken: ct)) > 0;
    }

    /// <summary>Arquivar também marca como lida (NotificationRepository::archive).</summary>
    public async Task<bool> ArchiveAsync(long userId, long businessId, long id, DateTime localNow, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(
            $"UPDATE notifications n SET n.updated_at = @now, n.archived_at = @now, n.read_at = COALESCE(n.read_at, @now) WHERE n.id = @id AND {Scope}",
            new { userId, businessId, id, now = localNow }, cancellationToken: ct)) > 0;
    }

    /// <summary>Mesmo escopo da listagem: aviso de outra empresa nunca é marcado sem o usuário ter visto.</summary>
    public async Task<int> MarkAllReadAsync(long userId, long businessId, DateTime localNow, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(
            $"UPDATE notifications n SET n.updated_at = @now, n.read_at = @now WHERE {Scope} AND n.archived_at IS NULL AND n.read_at IS NULL",
            new { userId, businessId, now = localNow }, cancellationToken: ct));
    }
}
