using System.Net;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Identity.Infrastructure;

/// <summary>Par de tokens opacos do ComercialWeb. Nunca vai para o app.</summary>
public sealed record CwTokens(string AccessToken, string RefreshToken);

public sealed record CwPairing(CwTokens Tokens, string DeviceId);

/// <summary>Quem o ComercialWeb diz que é o dono do aparelho (fonte da verdade de usuário, empresa e permissão mobile.access).</summary>
public sealed record CwBootstrap(long UserId, long BusinessId);

public enum CwStatus { Ok, TokenExpired, Rejected, Unavailable }

public sealed record CwResult<T>(CwStatus Status, T? Value = default);

/// <summary>Contrato com /api/mobile/v1 do ComercialWeb usado no pareamento e na revalidação do aparelho.</summary>
public interface IComercialWebAuth
{
    Task<CwResult<CwPairing>> PairAsync(string code, string? deviceName, CancellationToken ct);

    Task<CwResult<CwBootstrap>> BootstrapAsync(string accessToken, CancellationToken ct);

    Task<CwResult<CwTokens>> RefreshAsync(string refreshToken, CancellationToken ct);

    Task<CwStatus> LogoutAsync(string accessToken, CancellationToken ct);
}

/// <summary>
/// HttpClient para o ComercialWeb. O servidor vem só da configuração (ComercialWeb:BaseUrl), nunca do QR:
/// um QR forjado não pode apontar a API para outro host (SSRF). Sem retry automático.
/// </summary>
public sealed partial class ComercialWebAuthClient(HttpClient http, ILogger<ComercialWebAuthClient> logger) : IComercialWebAuth
{
    private const string Prefix = "/api/mobile/v1";

    public async Task<CwResult<CwPairing>> PairAsync(string code, string? deviceName, CancellationToken ct)
    {
        var (status, body) = await SendAsync<PairDto>(HttpMethod.Post, "/pair", null,
            new { code, device_name = deviceName ?? "Aplicativo", platform = "other", app_version = "1.0.0" }, ct);
        return body is { Device: not null } ? new(status, new CwPairing(new CwTokens(body.AccessToken, body.RefreshToken), body.Device.Id)) : new CwResult<CwPairing>(status);
    }

    public async Task<CwResult<CwBootstrap>> BootstrapAsync(string accessToken, CancellationToken ct)
    {
        var (status, body) = await SendAsync<BootstrapDto>(HttpMethod.Get, "/bootstrap", accessToken, null, ct);
        return body is null ? new CwResult<CwBootstrap>(status) : new(status, new CwBootstrap(body.User.Id, body.Business.Id));
    }

    public async Task<CwResult<CwTokens>> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        var (status, body) = await SendAsync<PairDto>(HttpMethod.Post, "/auth/refresh", null, new { refresh_token = refreshToken }, ct);
        return body is null ? new CwResult<CwTokens>(status) : new(status, new CwTokens(body.AccessToken, body.RefreshToken));
    }

    public async Task<CwStatus> LogoutAsync(string accessToken, CancellationToken ct) =>
        (await SendAsync<object>(HttpMethod.Post, "/auth/logout", accessToken, null, ct)).Item1;

    private async Task<(CwStatus, T?)> SendAsync<T>(HttpMethod method, string path, string? bearer, object? body, CancellationToken ct)
    {
        if (http.BaseAddress is null)
        {
            LogNotConfigured(logger);
            return (CwStatus.Unavailable, default);
        }
        using var request = new HttpRequestMessage(method, Prefix + path);
        request.Headers.Accept.Add(new("application/json"));
        if (bearer is not null) request.Headers.Authorization = new("Bearer", bearer);
        if (body is not null) request.Content = JsonContent.Create(body);
        try
        {
            using var response = await http.SendAsync(request, ct);
            switch (response.StatusCode)
            {
                case HttpStatusCode.OK or HttpStatusCode.Created:
                    // Corpo ausente/ilegível não é sucesso: sem ele não há como saber quem é o aparelho.
                    return await response.Content.ReadFromJsonAsync<T>(ct) is { } ok ? (CwStatus.Ok, ok) : (CwStatus.Unavailable, default);
                case HttpStatusCode.NoContent:
                    return (CwStatus.Ok, default);
                case HttpStatusCode.Unauthorized:
                    var error = await ReadErrorAsync(response, ct);
                    return (error == "mobile_token_expired" ? CwStatus.TokenExpired : CwStatus.Rejected, default);
                case HttpStatusCode.TooManyRequests:
                    LogUnexpectedStatus(logger, (int)response.StatusCode);
                    return (CwStatus.Unavailable, default);
                case >= HttpStatusCode.BadRequest and < HttpStatusCode.InternalServerError:
                    // Qualquer outro 4xx (403, 404, 422…): o ComercialWeb não reconhece o pedido/aparelho.
                    return (CwStatus.Rejected, default);
                default:
                    LogUnexpectedStatus(logger, (int)response.StatusCode);
                    return (CwStatus.Unavailable, default);
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return (CwStatus.Unavailable, default);
        }
    }

    // 401 com corpo que não é JSON (proxy/WAF) continua sendo 401.
    private static async Task<string?> ReadErrorAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            return (await response.Content.ReadFromJsonAsync<ErrorDto>(ct))?.Error?.Code;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private sealed record DeviceDto(string Id);
    private sealed record PairDto(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("refresh_token")] string RefreshToken,
        DeviceDto? Device);
    private sealed record IdDto(long Id);
    private sealed record BootstrapDto(IdDto User, IdDto Business);
    private sealed record ErrorBody(string? Code);
    private sealed record ErrorDto(ErrorBody? Error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb:BaseUrl não configurada; pareamento indisponível.")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} inesperado.")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);
}
