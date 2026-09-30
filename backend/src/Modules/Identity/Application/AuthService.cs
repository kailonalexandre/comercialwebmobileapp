using ComercialWeb.Mobile.Identity.Infrastructure;

namespace ComercialWeb.Mobile.Identity.Application;

public enum AuthFailure { InvalidCredentials, LockedOut, InvalidToken, InvalidPairingCode, Unavailable }

public sealed record AuthResult(IssuedSession? Session, AuthFailure? Failure, TimeSpan? RetryAfter = null)
{
    public static AuthResult Ok(IssuedSession session) => new(session, null);
    public static AuthResult Fail(AuthFailure failure, TimeSpan? retryAfter = null) => new(null, failure, retryAfter);
}

public sealed class AuthService(IIdentityStore store, TokenIssuer tokens, LoginThrottle throttle, TimeProvider clock, IComercialWebAuth cw, DeviceLink link)
{
    public static readonly TimeSpan RefreshLifetime = TimeSpan.FromDays(30);
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(90);

    // Hash de referência para gastar o mesmo tempo quando o usuário não existe (evita enumeração por tempo).
    private static readonly Lazy<string> DummyHash = new(() => BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString(), 12));

    /// <summary>
    /// Espelha LoginRequest do ComercialWeb: e-mail ou username, senha conferida antes do estado da conta,
    /// e a mesma resposta para senha errada, conta desativada ou sem empresa ativa.
    /// Diferença deliberada: contas de plataforma sem empresa não entram no app (o app opera sempre num tenant).
    /// </summary>
    public async Task<AuthResult> LoginAsync(string login, string password, string? ip, string? deviceName, CancellationToken ct)
    {
        var identity = LoginThrottle.Identity(login, ip);
        if (throttle.RetryAfter(identity) is { } wait) return AuthResult.Fail(AuthFailure.LockedOut, wait);

        var user = await store.FindActiveUserAsync(login.Trim(), IsEmail(login), ct);
        var passwordOk = BCrypt.Net.BCrypt.Verify(password, user?.PasswordHash ?? DummyHash.Value);
        var businessId = user is not null && passwordOk ? await store.ResolveActiveBusinessAsync(user.Id, ct) : null;

        if (user is null || businessId is null)
        {
            throttle.RecordFailure(identity);
            return AuthResult.Fail(AuthFailure.InvalidCredentials);
        }

        throttle.Clear(identity);
        var now = clock.GetUtcNow();
        var session = new NewSession(Guid.NewGuid(), user.Id, businessId.Value, deviceName, now, now + SessionLifetime);
        var (refresh, record) = NewRefresh(session.Id, now);
        await store.CreateSessionAsync(session, record, ct);
        return AuthResult.Ok(Issue(session.Id, user.Id, businessId.Value, refresh, now));
    }

    /// <summary>
    /// Login por QR: o ComercialWeb valida o código (uso único, 2 min), cria o aparelho no painel e diz quem é o usuário
    /// e a empresa. O app nunca informa usuário nem empresa. Código inválido/expirado/sem acesso: mesma resposta.
    /// </summary>
    public async Task<AuthResult> PairAsync(string code, string? deviceName, string? clientIp, CancellationToken ct)
    {
        var paired = await cw.PairAsync(code, deviceName, clientIp, ct);
        if (paired is not { Status: CwStatus.Ok, Value: { } device }) return Failed(paired.Status);

        var who = await cw.BootstrapAsync(device.Tokens.AccessToken, ct);
        if (who is not { Status: CwStatus.Ok, Value: { } identity })
        {
            // O aparelho já foi criado lá: desfaz para não deixar aparelho órfão no painel do ComercialWeb.
            await cw.LogoutAsync(device.Tokens.AccessToken, ct);
            return Failed(who.Status);
        }

        var now = clock.GetUtcNow();
        var session = new NewSession(Guid.NewGuid(), identity.UserId, identity.BusinessId, deviceName, now, now + SessionLifetime,
            device.DeviceId, link.Protect(device.Tokens));
        var (refresh, record) = NewRefresh(session.Id, now);
        await store.CreateSessionAsync(session, record, ct);
        return AuthResult.Ok(Issue(session.Id, session.UserId, session.BusinessId, refresh, now, identity.MinAppVersion));

        static AuthResult Failed(CwStatus status) =>
            AuthResult.Fail(status is CwStatus.Unavailable or CwStatus.Ok ? AuthFailure.Unavailable : AuthFailure.InvalidPairingCode);
    }

    /// <summary>Rotação obrigatória: cada refresh token vale uma vez. Reuso revoga a sessão inteira.</summary>
    public async Task<AuthResult> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        if (!TokenIssuer.TryHashRefreshToken(refreshToken, out var hash)) return AuthResult.Fail(AuthFailure.InvalidToken);

        var state = await store.FindRefreshTokenAsync(hash, ct);
        if (state is null) return AuthResult.Fail(AuthFailure.InvalidToken);

        var now = clock.GetUtcNow();
        if (state.UsedAt is not null)
        {
            await store.RevokeSessionAsync(state.SessionId, "refresh_reuse", now, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }
        if (state.RevokedAt is not null || state.TokenExpiresAt <= now || state.SessionExpiresAt <= now)
            return AuthResult.Fail(AuthFailure.InvalidToken);

        if (!await store.IsSessionActiveAsync(state.SessionId, state.UserId, state.BusinessId, now, ct))
        {
            await store.RevokeSessionAsync(state.SessionId, "account_inactive", now, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }

        var (refresh, record) = NewRefresh(state.SessionId, now);
        if (!await store.RotateRefreshTokenAsync(hash, record, now, ct))
        {
            await store.RevokeSessionAsync(state.SessionId, "refresh_reuse", now, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }

        // Só quem ganhou a rotação fala com o ComercialWeb: dois refresh simultâneos não disputam o mesmo par de tokens dele.
        var check = await link.IsStillPairedAsync(state.SessionId, state.UserId, state.BusinessId, ct);
        if (!check.Paired)
        {
            await store.RevokeSessionAsync(state.SessionId, "device_revoked", now, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }
        return AuthResult.Ok(Issue(state.SessionId, state.UserId, state.BusinessId, refresh, now, check.MinAppVersion));
    }

    public async Task LogoutAsync(Guid sessionId, CancellationToken ct)
    {
        await link.LogoutAsync(sessionId, ct);
        await store.RevokeSessionAsync(sessionId, "logout", clock.GetUtcNow(), ct);
    }

    // Mesmo critério do PHP (FILTER_VALIDATE_EMAIL) de forma simplificada: username nunca contém '@'.
    internal static bool IsEmail(string login) => login.Contains('@', StringComparison.Ordinal);

    private static (string Plain, NewRefreshToken Record) NewRefresh(Guid sessionId, DateTimeOffset now)
    {
        var (plain, hash) = TokenIssuer.NewRefreshToken();
        return (plain, new NewRefreshToken(hash, sessionId, now, now + RefreshLifetime));
    }

    private IssuedSession Issue(Guid sessionId, long userId, long businessId, string refresh, DateTimeOffset now, string? minAppVersion = null)
    {
        var (access, expiresAt) = tokens.CreateAccessToken(userId, sessionId, businessId, now);
        return new IssuedSession(access, refresh, expiresAt, minAppVersion);
    }
}
