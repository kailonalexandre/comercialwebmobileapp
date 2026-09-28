using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ComercialWeb.Mobile.Identity.Infrastructure;

public sealed record JwtSettings(string Issuer, string Audience, ECDsaSecurityKey SigningKey);

/// <summary>Access token JWT curto (ES256) e refresh token opaco aleatório.</summary>
public sealed class TokenIssuer(JwtSettings settings)
{
    public static readonly TimeSpan AccessLifetime = TimeSpan.FromMinutes(10);

    public const string SessionClaim = "sid";
    public const string BusinessClaim = "bid";

    private const int RefreshBytes = 32;
    private static readonly JsonWebTokenHandler Handler = new();

    public (string Token, DateTimeOffset ExpiresAt) CreateAccessToken(long userId, Guid sessionId, long businessId, DateTimeOffset now)
    {
        var expiresAt = now + AccessLifetime;
        var token = Handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.Issuer,
            Audience = settings.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString(System.Globalization.CultureInfo.InvariantCulture)),
                new Claim(SessionClaim, sessionId.ToString()),
                new Claim(BusinessClaim, businessId.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            ]),
            SigningCredentials = new SigningCredentials(settings.SigningKey, SecurityAlgorithms.EcdsaSha256),
        });
        return (token, expiresAt);
    }

    public static (string Plain, byte[] Hash) NewRefreshToken()
    {
        var plain = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(RefreshBytes));
        return (plain, SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(plain)));
    }

    /// <summary>Rejeita entrada fora do formato antes de tocar no banco.</summary>
    public static bool TryHashRefreshToken(string? plain, out byte[] hash)
    {
        hash = [];
        if (plain is null || plain.Length != 43 || !plain.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_')) return false;
        hash = SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(plain));
        return true;
    }

    /// <summary>Chave PEM (EC P-256) do arquivo configurado. Sem arquivo: chave efêmera, só em desenvolvimento.</summary>
    public static ECDsaSecurityKey LoadSigningKey(string? pemPath, bool allowEphemeral)
    {
        var ecdsa = ECDsa.Create();
        if (!string.IsNullOrWhiteSpace(pemPath)) ecdsa.ImportFromPem(File.ReadAllText(pemPath));
        else if (allowEphemeral) ecdsa.GenerateKey(ECCurve.NamedCurves.nistP256);
        else throw new InvalidOperationException("Jwt:SigningKeyPath é obrigatório fora de desenvolvimento.");
        return new ECDsaSecurityKey(ecdsa);
    }
}
