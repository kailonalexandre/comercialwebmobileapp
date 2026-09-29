namespace ComercialWeb.Mobile.Identity.Application;

public sealed record UserCredentials(long Id, string PasswordHash);

/// <summary>CwDeviceId/CwTokens só existem em sessão pareada por QR; CwTokens já chega cifrado.</summary>
public sealed record NewSession(
    Guid Id, long UserId, long BusinessId, string? DeviceName, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt,
    string? CwDeviceId = null, string? CwTokens = null);

public sealed record NewRefreshToken(byte[] Hash, Guid SessionId, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

public sealed record RefreshTokenState(
    Guid SessionId,
    long UserId,
    long BusinessId,
    DateTimeOffset TokenExpiresAt,
    DateTimeOffset? UsedAt,
    DateTimeOffset SessionExpiresAt,
    DateTimeOffset? RevokedAt);

public sealed record Profile(string UserName, long BusinessId, string BusinessName);

public sealed record IssuedSession(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt);

/// <summary>Persistência do módulo. Consultas às tabelas do ComercialWeb são somente leitura.</summary>
public interface IIdentityStore
{
    /// <summary>Usuário ativo (não desativado, não excluído) por e-mail ou username.</summary>
    Task<UserCredentials?> FindActiveUserAsync(string login, bool byEmail, CancellationToken ct);

    /// <summary>Empresa preferida do usuário se o vínculo estiver ativo; senão a primeira empresa ativa.</summary>
    Task<long?> ResolveActiveBusinessAsync(long userId, CancellationToken ct);

    Task CreateSessionAsync(NewSession session, NewRefreshToken token, CancellationToken ct);

    Task<RefreshTokenState?> FindRefreshTokenAsync(byte[] hash, CancellationToken ct);

    /// <summary>Marca o token como usado e grava o novo. False se outro pedido já o usou (corrida ou reuso).</summary>
    Task<bool> RotateRefreshTokenAsync(byte[] usedHash, NewRefreshToken replacement, DateTimeOffset now, CancellationToken ct);

    Task RevokeSessionAsync(Guid sessionId, string reason, DateTimeOffset now, CancellationToken ct);

    /// <summary>Sessão válida, usuário ativo e vínculo ativo com a empresa da sessão.</summary>
    Task<bool> IsSessionActiveAsync(Guid sessionId, long userId, long businessId, DateTimeOffset now, CancellationToken ct);

    Task<Profile?> GetProfileAsync(long userId, long businessId, CancellationToken ct);

    /// <summary>Par de tokens do ComercialWeb (cifrado) da sessão; null se a sessão não foi pareada por QR.</summary>
    Task<string?> GetCwTokensAsync(Guid sessionId, CancellationToken ct);

    Task SaveCwTokensAsync(Guid sessionId, string protectedTokens, CancellationToken ct);
}
