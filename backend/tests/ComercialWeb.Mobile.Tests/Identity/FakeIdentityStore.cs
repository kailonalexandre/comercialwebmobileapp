using ComercialWeb.Mobile.Identity.Application;

namespace ComercialWeb.Mobile.Tests.Identity;

internal sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

/// <summary>Store em memória com as mesmas regras de tenant do MySqlIdentityStore (coberto nos testes de integração).</summary>
internal sealed class FakeIdentityStore : IIdentityStore
{
    public sealed record User(long Id, string Email, string Username, string PasswordHash, bool Active = true);

    public List<User> Users { get; } = [];
    public HashSet<(long UserId, long BusinessId)> ActiveMemberships { get; } = [];
    public Dictionary<long, long> Preferences { get; } = [];
    public Dictionary<Guid, (NewSession Session, DateTimeOffset? RevokedAt, string? Reason)> Sessions { get; } = [];
    public Dictionary<string, (NewRefreshToken Token, DateTimeOffset? UsedAt)> Tokens { get; } = [];

    public Task<UserCredentials?> FindActiveUserAsync(string login, bool byEmail, CancellationToken ct) =>
        Task.FromResult(Users.Where(u => u.Active && (byEmail ? u.Email : u.Username) == login)
            .Select(u => new UserCredentials(u.Id, u.PasswordHash)).FirstOrDefault());

    public Task<long?> ResolveActiveBusinessAsync(long userId, CancellationToken ct)
    {
        var active = ActiveMemberships.Where(m => m.UserId == userId).Select(m => m.BusinessId).Order().ToList();
        long? chosen = Preferences.TryGetValue(userId, out var p) && active.Contains(p) ? p : active.Count > 0 ? active[0] : null;
        return Task.FromResult(chosen);
    }

    public Task CreateSessionAsync(NewSession session, NewRefreshToken token, CancellationToken ct)
    {
        Sessions[session.Id] = (session, null, null);
        if (session.CwTokens is not null) CwTokens[session.Id] = session.CwTokens;
        Tokens[Convert.ToHexString(token.Hash)] = (token, null);
        return Task.CompletedTask;
    }

    public Task<RefreshTokenState?> FindRefreshTokenAsync(byte[] hash, CancellationToken ct)
    {
        if (!Tokens.TryGetValue(Convert.ToHexString(hash), out var t)) return Task.FromResult<RefreshTokenState?>(null);
        var s = Sessions[t.Token.SessionId];
        return Task.FromResult<RefreshTokenState?>(new RefreshTokenState(
            s.Session.Id, s.Session.UserId, s.Session.BusinessId, t.Token.ExpiresAt, t.UsedAt, s.Session.ExpiresAt, s.RevokedAt));
    }

    public Task<bool> RotateRefreshTokenAsync(byte[] usedHash, NewRefreshToken replacement, DateTimeOffset now, CancellationToken ct)
    {
        var key = Convert.ToHexString(usedHash);
        if (Tokens[key].UsedAt is not null) return Task.FromResult(false);
        Tokens[key] = (Tokens[key].Token, now);
        Tokens[Convert.ToHexString(replacement.Hash)] = (replacement, null);
        return Task.FromResult(true);
    }

    public Task RevokeSessionAsync(Guid sessionId, string reason, DateTimeOffset now, CancellationToken ct)
    {
        var s = Sessions[sessionId];
        if (s.RevokedAt is null) Sessions[sessionId] = (s.Session, now, reason);
        return Task.CompletedTask;
    }

    public Task<bool> IsSessionActiveAsync(Guid sessionId, long userId, long businessId, DateTimeOffset now, CancellationToken ct) =>
        Task.FromResult(Sessions.TryGetValue(sessionId, out var s)
            && s.RevokedAt is null && s.Session.ExpiresAt > now
            && s.Session.UserId == userId && s.Session.BusinessId == businessId
            && Users.Any(u => u.Id == userId && u.Active)
            && ActiveMemberships.Contains((userId, businessId)));

    public Dictionary<Guid, string> CwTokens { get; } = [];

    public Task<string?> GetCwTokensAsync(Guid sessionId, CancellationToken ct) =>
        Task.FromResult(CwTokens.TryGetValue(sessionId, out var t) ? t : null);

    public Task SaveCwTokensAsync(Guid sessionId, string protectedTokens, CancellationToken ct)
    {
        if (CwTokens.ContainsKey(sessionId)) CwTokens[sessionId] = protectedTokens;
        return Task.CompletedTask;
    }

    public Task<Profile?> GetProfileAsync(long userId, long businessId, CancellationToken ct) => Task.FromResult<Profile?>(new Profile("Usuário", businessId, $"Empresa {businessId}"));

    public Task<IReadOnlyList<BusinessRef>> ListBusinessesAsync(long userId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<BusinessRef>>([.. ActiveMemberships.Where(m => m.UserId == userId).Select(m => new BusinessRef(m.BusinessId, $"Empresa {m.BusinessId}")).OrderBy(b => b.Name)]);

    public Dictionary<Guid, long> PairedBusiness { get; } = [];

    public Task<bool> SwitchBusinessAsync(Guid sessionId, long userId, long businessId, CancellationToken ct)
    {
        if (!Sessions.TryGetValue(sessionId, out var s) || s.RevokedAt is not null || s.Session.UserId != userId || !ActiveMemberships.Contains((userId, businessId)))
            return Task.FromResult(false);
        PairedBusiness.TryAdd(sessionId, s.Session.BusinessId);
        Sessions[sessionId] = (s.Session with { BusinessId = businessId }, s.RevokedAt, s.Reason);
        return Task.FromResult(true);
    }

    public Task<long> GetPairedBusinessIdAsync(Guid sessionId, long current, CancellationToken ct) =>
        Task.FromResult(PairedBusiness.TryGetValue(sessionId, out var b) ? b : current);
}
