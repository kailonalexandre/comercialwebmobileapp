using ComercialWeb.Mobile.Identity.Application;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Identity.Infrastructure;

/// <summary>
/// Lê users/businesses/business_user/user_preferences do ComercialWeb (somente leitura)
/// e escreve apenas em mobile_sessions/mobile_refresh_tokens.
/// </summary>
public sealed class MySqlIdentityStore(MySqlDataSource db) : IIdentityStore
{
    // Mesmo critério de User::activeBusinesses() + soft delete: empresa ativa e vínculo ativo.
    private const string ActiveMembership = """
        FROM business_user bu
        JOIN businesses b ON b.id = bu.business_id AND b.status = 'active' AND b.deleted_at IS NULL
        WHERE bu.user_id = @userId AND bu.status = 'active'
        """;

    public async Task<UserCredentials?> FindActiveUserAsync(string login, bool byEmail, CancellationToken ct)
    {
        var column = byEmail ? "email" : "username";
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<UserCredentials>(new CommandDefinition(
            $"SELECT CAST(id AS SIGNED) AS Id, password AS PasswordHash FROM users WHERE {column} = @login AND deactivated_at IS NULL AND deleted_at IS NULL LIMIT 1",
            new { login }, cancellationToken: ct));
    }

    public async Task<long?> ResolveActiveBusinessAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QueryFirstOrDefaultAsync<long?>(new CommandDefinition(
            $"""
            SELECT CAST(bu.business_id AS SIGNED) {ActiveMembership}
            ORDER BY bu.business_id = (SELECT current_business_id FROM user_preferences WHERE user_id = @userId LIMIT 1) DESC, bu.business_id
            LIMIT 1
            """,
            new { userId }, cancellationToken: ct));
    }

    public async Task CreateSessionAsync(NewSession session, NewRefreshToken token, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO mobile_sessions (id, user_id, business_id, device_name, cw_device_id, cw_tokens, created_at, last_used_at, expires_at)
            VALUES (@Id, @UserId, @BusinessId, @DeviceName, @CwDeviceId, @CwTokens, @CreatedAt, @CreatedAt, @ExpiresAt)
            """,
            new { Id = session.Id.ToString(), session.UserId, session.BusinessId, session.DeviceName, session.CwDeviceId, session.CwTokens, CreatedAt = session.CreatedAt.UtcDateTime, ExpiresAt = session.ExpiresAt.UtcDateTime },
            tx, cancellationToken: ct));
        await InsertTokenAsync(conn, tx, token, ct);
        await tx.CommitAsync(ct);
    }

    public async Task<RefreshTokenState?> FindRefreshTokenAsync(byte[] hash, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var row = await conn.QuerySingleOrDefaultAsync<RefreshRow>(new CommandDefinition(
            """
            SELECT s.id AS SessionId, CAST(s.user_id AS SIGNED) AS UserId, CAST(s.business_id AS SIGNED) AS BusinessId, t.expires_at AS TokenExpiresAt,
                   t.used_at AS UsedAt, s.expires_at AS SessionExpiresAt, s.revoked_at AS RevokedAt
            FROM mobile_refresh_tokens t JOIN mobile_sessions s ON s.id = t.session_id
            WHERE t.token_hash = @hash
            """,
            new { hash }, cancellationToken: ct));
        return row is null ? null : new RefreshTokenState(
            row.SessionId, row.UserId, row.BusinessId, Utc(row.TokenExpiresAt), UtcOrNull(row.UsedAt), Utc(row.SessionExpiresAt), UtcOrNull(row.RevokedAt));
    }

    public async Task<bool> RotateRefreshTokenAsync(byte[] usedHash, NewRefreshToken replacement, DateTimeOffset now, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        // O UPDATE condicional é o que garante uso único mesmo com dois refresh simultâneos.
        var marked = await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE mobile_refresh_tokens SET used_at = @now WHERE token_hash = @usedHash AND used_at IS NULL",
            new { now = now.UtcDateTime, usedHash }, tx, cancellationToken: ct));
        if (marked != 1) return false;
        await InsertTokenAsync(conn, tx, replacement, ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE mobile_sessions SET last_used_at = @now WHERE id = @id",
            new { now = now.UtcDateTime, id = replacement.SessionId.ToString() }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task RevokeSessionAsync(Guid sessionId, string reason, DateTimeOffset now, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE mobile_sessions SET revoked_at = @now, revoked_reason = @reason WHERE id = @id AND revoked_at IS NULL",
            new { now = now.UtcDateTime, reason, id = sessionId.ToString() }, cancellationToken: ct));
    }

    public async Task<bool> IsSessionActiveAsync(Guid sessionId, long userId, long businessId, DateTimeOffset now, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<bool>(new CommandDefinition(
            $"""
            SELECT EXISTS (
                SELECT 1 FROM mobile_sessions s
                JOIN users u ON u.id = s.user_id AND u.deactivated_at IS NULL AND u.deleted_at IS NULL
                WHERE s.id = @sessionId AND s.user_id = @userId AND s.business_id = @businessId
                  AND s.revoked_at IS NULL AND s.expires_at > @now
                  AND EXISTS (SELECT 1 {ActiveMembership} AND bu.business_id = @businessId)
            )
            """,
            new { sessionId = sessionId.ToString(), userId, businessId, now = now.UtcDateTime }, cancellationToken: ct));
    }

    public async Task<Profile?> GetProfileAsync(long userId, long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<Profile>(new CommandDefinition(
            """
            SELECT u.name AS UserName, CAST(b.id AS SIGNED) AS BusinessId, b.name AS BusinessName
            FROM users u JOIN businesses b ON b.id = @businessId
            WHERE u.id = @userId
            """,
            new { userId, businessId }, cancellationToken: ct));
    }

    public async Task<string?> GetCwTokensAsync(Guid sessionId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<string?>(new CommandDefinition(
            "SELECT cw_tokens FROM mobile_sessions WHERE id = @id", new { id = sessionId.ToString() }, cancellationToken: ct));
    }

    public async Task SaveCwTokensAsync(Guid sessionId, string protectedTokens, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE mobile_sessions SET cw_tokens = @protectedTokens WHERE id = @id AND cw_tokens IS NOT NULL",
            new { protectedTokens, id = sessionId.ToString() }, cancellationToken: ct));
    }

    private static Task<int> InsertTokenAsync(MySqlConnection conn, MySqlTransaction tx, NewRefreshToken t, CancellationToken ct) =>
        conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO mobile_refresh_tokens (token_hash, session_id, created_at, expires_at) VALUES (@Hash, @SessionId, @CreatedAt, @ExpiresAt)",
            new { t.Hash, SessionId = t.SessionId.ToString(), CreatedAt = t.CreatedAt.UtcDateTime, ExpiresAt = t.ExpiresAt.UtcDateTime },
            tx, cancellationToken: ct));

    private static DateTimeOffset Utc(DateTime value) => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));

    private static DateTimeOffset? UtcOrNull(DateTime? value) => value is null ? null : Utc(value.Value);

    // Classe com setters: o Dapper converte tipos por propriedade (MySqlConnector entrega CHAR(36) como Guid).
    private sealed class RefreshRow
    {
        public Guid SessionId { get; set; }
        public long UserId { get; set; }
        public long BusinessId { get; set; }
        public DateTime TokenExpiresAt { get; set; }
        public DateTime? UsedAt { get; set; }
        public DateTime SessionExpiresAt { get; set; }
        public DateTime? RevokedAt { get; set; }
    }
}
