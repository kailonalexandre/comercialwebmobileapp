using System.Security.Cryptography;
using System.Text.Json;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;

namespace ComercialWeb.Mobile.Identity.Application;

/// <summary>
/// Vínculo da sessão do app com o aparelho pareado no ComercialWeb. O par de tokens do ComercialWeb fica só aqui
/// (cifrado com Data Protection) e é renovado com o refresh dele quando o access expira.
/// Aparelho revogado no painel web derruba o refresh do app; ComercialWeb fora do ar não derruba (fail-open,
/// o access token do app vale só 10 min e o JWT continua revalidado contra usuário/empresa a cada chamada).
/// </summary>
public sealed class DeviceLink(IIdentityStore store, IComercialWebAuth cw, IDataProtectionProvider protection)
{
    private IDataProtector Protector => protection.CreateProtector("comercialweb-tokens.v1");

    public string Protect(CwTokens tokens) => Protector.Protect(JsonSerializer.Serialize(tokens));

    /// <summary>Paired=false: o ComercialWeb não reconhece mais este aparelho/usuário/empresa e a sessão deve ser revogada.</summary>
    public sealed record PairingCheck(bool Paired, string? MinAppVersion = null);

    public async Task<PairingCheck> IsStillPairedAsync(Guid sessionId, long userId, long businessId, CancellationToken ct)
    {
        var (linked, tokens) = await Load(sessionId, ct);
        if (!linked) return new(true); // sessão sem vínculo (login antigo)
        if (tokens is null) return new(false); // dado ilegível (chave de proteção trocada): sem como validar, revoga
        var result = await Call(sessionId, tokens, (a, c) => cw.BootstrapAsync(a, c), ct);
        return result.Status switch
        {
            CwStatus.Ok => new(result.Value!.UserId == userId && result.Value.BusinessId == businessId, result.Value.MinAppVersion),
            CwStatus.Unavailable => new(true),
            _ => new(false),
        };
    }

    /// <summary>Melhor esforço: remove o aparelho do painel do ComercialWeb. Falha não impede o logout local.</summary>
    public async Task LogoutAsync(Guid sessionId, CancellationToken ct)
    {
        if (await Load(sessionId, ct) is (true, { } tokens))
            await Call<object>(sessionId, tokens, async (a, c) => new CwResult<object>(await cw.LogoutAsync(a, c)), ct);
    }

    private async Task<(bool Linked, CwTokens? Tokens)> Load(Guid sessionId, CancellationToken ct)
    {
        if (await store.GetCwTokensAsync(sessionId, ct) is not { } raw) return (false, null);
        try
        {
            return (true, JsonSerializer.Deserialize<CwTokens>(Protector.Unprotect(raw)));
        }
        catch (Exception e) when (e is CryptographicException or JsonException)
        {
            return (true, null);
        }
    }

    private async Task<CwResult<T>> Call<T>(Guid sessionId, CwTokens tokens, Func<string, CancellationToken, Task<CwResult<T>>> op, CancellationToken ct)
    {
        var result = await op(tokens.AccessToken, ct);
        if (result.Status != CwStatus.TokenExpired) return result;

        var renewed = await cw.RefreshAsync(tokens.RefreshToken, ct);
        if (renewed.Status != CwStatus.Ok) return new CwResult<T>(renewed.Status == CwStatus.Unavailable ? CwStatus.Unavailable : CwStatus.Rejected);
        await store.SaveCwTokensAsync(sessionId, Protect(renewed.Value!), ct);
        return await op(renewed.Value!.AccessToken, ct);
    }
}
