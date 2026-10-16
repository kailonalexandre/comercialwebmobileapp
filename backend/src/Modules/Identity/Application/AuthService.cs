using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace ComercialWeb.Mobile.Identity.Application;

public enum AuthFailure { InvalidCredentials, LockedOut, InvalidToken, InvalidPairingCode, Unavailable }

public sealed record AuthResult(IssuedSession? Session, AuthFailure? Failure, TimeSpan? RetryAfter = null)
{
    public static AuthResult Ok(IssuedSession session) => new(session, null);
    public static AuthResult Fail(AuthFailure failure, TimeSpan? retryAfter = null) => new(null, failure, retryAfter);
}

/// <summary>Login num aparelho vinculado. Recusa: `Error` é o código do ComercialWeb (o app decide a tela por ele).</summary>
public sealed record TerminalLoginResult(IssuedSession? Session, CwLogin? Login, SessionPolicy? Policy, CwStatus Status, string? Error = null, int? RetryAfter = null);

public sealed class AuthService(
    IIdentityStore store, TokenIssuer tokens, LoginThrottle throttle, TimeProvider clock, IComercialWebAuth cw, DeviceLink link,
    IConfiguration? config = null, AuditTrail? audit = null)
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
        var (refresh, record) = NewRefresh(session.Id, now, session.ExpiresAt);
        await store.CreateSessionAsync(session, record, ct);
        return AuthResult.Ok(Issue(session.Id, user.Id, businessId.Value, refresh, now));
    }

    /// <summary>
    /// QR antigo: o ComercialWeb valida o código (uso único, 2 min), cria o aparelho no painel e diz quem é o usuário
    /// e a empresa. O app nunca informa usuário nem empresa. Código inválido/expirado/sem acesso: mesma resposta.
    /// </summary>
    public async Task<AuthResult> PairAsync(string code, string? deviceName, string? clientIp, CancellationToken ct, DeviceInfo? info = null)
    {
        var paired = await cw.PairAsync(code, deviceName, clientIp, ct, info);
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
        var (refresh, record) = NewRefresh(session.Id, now, session.ExpiresAt);
        await store.CreateSessionAsync(session, record, ct);
        return AuthResult.Ok(Issue(session.Id, session.UserId, session.BusinessId, refresh, now, identity.MinAppVersion));

        static AuthResult Failed(CwStatus status) =>
            AuthResult.Fail(status is CwStatus.Unavailable or CwStatus.Ok ? AuthFailure.Unavailable : AuthFailure.InvalidPairingCode);
    }

    /// <summary>QR de vínculo: o aparelho ganha um segredo próprio, nenhuma sessão. Nada é guardado aqui (o aparelho é do ComercialWeb).</summary>
    public Task<CwResult<CwBinding>> BindTerminalAsync(string code, string installationId, string deviceName, string? clientIp, DeviceInfo info, CancellationToken ct) =>
        cw.BindTerminalAsync(code, installationId, deviceName, clientIp, info, ct);

    public Task<CwResult<CwTerminalState>> TerminalStateAsync(TerminalCredentials terminal, string? clientIp, CancellationToken ct) =>
        cw.TerminalStateAsync(terminal, clientIp, ct);

    /// <summary>
    /// Login individual no aparelho vinculado. Quem confere aparelho, credencial, bloqueio e permissão é o ComercialWeb;
    /// aqui nasce a sessão do app com a validade do modo do aparelho (pessoal ou compartilhado).
    /// </summary>
    public async Task<TerminalLoginResult> TerminalLoginAsync(TerminalCredentials terminal, TerminalLoginInput input, string? clientIp, DeviceInfo info, CancellationToken ct)
    {
        var login = await cw.TerminalLoginAsync(terminal, input, clientIp, info, ct);
        if (login is not { Status: CwStatus.Ok, Value: { } granted }) return new(null, null, null, login.Status, login.Error, login.RetryAfter);

        var who = await cw.BootstrapAsync(granted.Tokens.AccessToken, ct);
        if (who is not { Status: CwStatus.Ok, Value: { } identity })
        {
            await cw.LogoutAsync(granted.Tokens.AccessToken, ct);
            return new(null, null, null, who.Status == CwStatus.Unavailable ? CwStatus.Unavailable : CwStatus.Rejected);
        }

        var policy = SessionPolicy.For(granted.Terminal.Mode, config);
        var now = clock.GetUtcNow();
        var session = new NewSession(Guid.NewGuid(), identity.UserId, identity.BusinessId, granted.Terminal.Name, now, now + policy.Lifetime,
            granted.DeviceId, link.Protect(granted.Tokens), granted.Terminal.Id, policy.Mode);
        var (refresh, record) = NewRefresh(session.Id, now, session.ExpiresAt);
        await store.CreateSessionAsync(session, record, ct);
        return new(Issue(session.Id, session.UserId, session.BusinessId, refresh, now, identity.MinAppVersion), granted, policy, CwStatus.Ok);
    }

    /// <summary>
    /// Rotação obrigatória: cada refresh token vale uma vez. Reuso revoga a sessão inteira. Sessão de aparelho vinculado
    /// também cai por inatividade (nenhum refresh dentro de `Idle` do modo) e nunca passa da expiração absoluta.
    /// </summary>
    public async Task<AuthResult> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        if (!TokenIssuer.TryHashRefreshToken(refreshToken, out var hash)) return AuthResult.Fail(AuthFailure.InvalidToken);

        var state = await store.FindRefreshTokenAsync(hash, ct);
        if (state is null) return AuthResult.Fail(AuthFailure.InvalidToken);

        var now = clock.GetUtcNow();
        if (state.UsedAt is not null)
        {
            await store.RevokeSessionAsync(state.SessionId, "refresh_reuse", now, ct);
            await Audit("session.refresh_reuse", state, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }
        if (state.RevokedAt is not null || state.TokenExpiresAt <= now || state.SessionExpiresAt <= now)
            return AuthResult.Fail(AuthFailure.InvalidToken);

        if (state.Mode is not null && state.LastUsedAt is { } lastUsed && lastUsed + SessionPolicy.For(state.Mode, config).Idle <= now)
        {
            await store.RevokeSessionAsync(state.SessionId, "idle_timeout", now, ct);
            await Audit("session.expired", state, ct, ("reason", "idle"));
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }

        if (!await store.IsSessionActiveAsync(state.SessionId, state.UserId, state.BusinessId, now, ct))
        {
            await store.RevokeSessionAsync(state.SessionId, "account_inactive", now, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }

        var (refresh, record) = NewRefresh(state.SessionId, now, state.SessionExpiresAt);
        if (!await store.RotateRefreshTokenAsync(hash, record, now, ct))
        {
            await store.RevokeSessionAsync(state.SessionId, "refresh_reuse", now, ct);
            await Audit("session.refresh_reuse", state, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }

        // Só quem ganhou a rotação fala com o ComercialWeb: dois refresh simultâneos não disputam o mesmo par de tokens dele.
        var check = await link.IsStillPairedAsync(state.SessionId, state.UserId, state.BusinessId, ct);
        if (!check.Paired)
        {
            await store.RevokeSessionAsync(state.SessionId, "device_revoked", now, ct);
            return AuthResult.Fail(AuthFailure.InvalidToken);
        }
        // ponytail: uma linha a cada 10 min por aparelho; trocar por amostragem/expurgo se a trilha crescer demais.
        await Audit("session.refreshed", state, ct);
        return AuthResult.Ok(Issue(state.SessionId, state.UserId, state.BusinessId, refresh, now, check.MinAppVersion));
    }

    /// <summary>
    /// Troca a empresa ativa da sessão sem novo login. Só empresas com vínculo ativo do usuário; o tenant continua vindo do
    /// servidor (o app só escolhe entre as suas). O access token antigo (outra empresa) deixa de valer na hora.
    /// Aparelho compartilhado não troca (a sessão é da empresa que o vinculou).
    /// </summary>
    public async Task<SwitchedBusiness?> SwitchBusinessAsync(Guid sessionId, long userId, long businessId, CancellationToken ct)
    {
        if (!await store.SwitchBusinessAsync(sessionId, userId, businessId, ct)) return null;
        var profile = await store.GetProfileAsync(userId, businessId, ct);
        if (profile is null) return null;
        var (access, expiresAt) = tokens.CreateAccessToken(userId, sessionId, businessId, clock.GetUtcNow());
        await AuditAsync(new AuditEvent("business.switched", businessId, userId), ct);
        return new SwitchedBusiness(access, expiresAt, profile.BusinessId, profile.BusinessName);
    }

    public Task<IReadOnlyList<BusinessRef>> BusinessesAsync(long userId, CancellationToken ct) => store.ListBusinessesAsync(userId, ct);

    /// <param name="reason">operator_switch | idle | user: só para a trilha (troca de operador no aparelho compartilhado).</param>
    public async Task LogoutAsync(Guid sessionId, CancellationToken ct, long? userId = null, long? businessId = null, string? reason = null)
    {
        await link.LogoutAsync(sessionId, ct);
        await store.RevokeSessionAsync(sessionId, reason is "operator_switch" or "idle" ? reason : "logout", clock.GetUtcNow(), ct);
        if (reason == "operator_switch") await AuditAsync(new AuditEvent("operator.switched", businessId, userId), ct);
    }

    /// <summary>PIN do aparelho compartilhado: o ComercialWeb confere a senha atual e guarda o PIN (hash).</summary>
    public Task<CwResult<bool>> SetPinAsync(Guid sessionId, long businessId, string password, string pin, CancellationToken ct) =>
        link.CallAsync(sessionId, businessId, (access, c) => cw.SetPinAsync(access, password, pin, c), ct);

    // Mesmo critério do PHP (FILTER_VALIDATE_EMAIL) de forma simplificada: username nunca contém '@'.
    internal static bool IsEmail(string login) => login.Contains('@', StringComparison.Ordinal);

    // O refresh nunca passa da expiração absoluta da sessão (no compartilhado ela é de horas, não de 30 dias).
    private static (string Plain, NewRefreshToken Record) NewRefresh(Guid sessionId, DateTimeOffset now, DateTimeOffset sessionExpiresAt)
    {
        var (plain, hash) = TokenIssuer.NewRefreshToken();
        var expires = now + RefreshLifetime < sessionExpiresAt ? now + RefreshLifetime : sessionExpiresAt;
        return (plain, new NewRefreshToken(hash, sessionId, now, expires));
    }

    private IssuedSession Issue(Guid sessionId, long userId, long businessId, string refresh, DateTimeOffset now, string? minAppVersion = null)
    {
        var (access, expiresAt) = tokens.CreateAccessToken(userId, sessionId, businessId, now);
        return new IssuedSession(access, refresh, expiresAt, minAppVersion);
    }

    private Task Audit(string name, RefreshTokenState state, CancellationToken ct, params (string Key, string? Value)[] meta) =>
        AuditAsync(new AuditEvent(name, state.BusinessId, state.UserId, state.TerminalId,
            Meta: meta.Length == 0 ? null : meta.ToDictionary(m => m.Key, m => m.Value)), ct);

    private Task AuditAsync(AuditEvent entry, CancellationToken ct) => audit?.RecordAsync(entry, ct) ?? Task.CompletedTask;
}
