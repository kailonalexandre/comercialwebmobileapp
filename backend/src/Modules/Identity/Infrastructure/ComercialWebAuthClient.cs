using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComercialWeb.Mobile.Identity.Infrastructure;

/// <summary>Par de tokens opacos do ComercialWeb. Nunca vai para o app.</summary>
public sealed record CwTokens(string AccessToken, string RefreshToken);

public sealed record CwPairing(CwTokens Tokens, string DeviceId);

/// <summary>Plataforma e versão informadas pelo app no pareamento, só para o painel do ComercialWeb (diagnóstico). Valores fora do formato viram o padrão.</summary>
public sealed record DeviceInfo(string Platform, string AppVersion)
{
    public static readonly DeviceInfo Unknown = new("other", "0.0.0");

    public static DeviceInfo From(string? platform, string? appVersion) => new(
        platform is "android" or "ios" ? platform : Unknown.Platform,
        appVersion is { Length: <= 20 } v && System.Text.RegularExpressions.Regex.IsMatch(v, @"^\d{1,4}(\.\d{1,4}){0,2}$") ? v : Unknown.AppVersion);
}

/// <summary>Quem o ComercialWeb diz que é o dono do aparelho (fonte da verdade de usuário, empresa e permissão mobile.access).</summary>
public sealed record CwBootstrap(long UserId, long BusinessId, string? MinAppVersion = null);

/// <summary>Saldo do produto na unidade do aparelho (a regra de saldo é do ComercialWeb, não daqui).</summary>
public sealed record CwStock(long? UnitId, long TotalMilli);

public sealed record CwPageMeta(int Page, int PerPage, long Total, int LastPage);

public sealed record CwOrderItem(
    string Id, string Number, string Customer, long TotalCents, string Status, string? Payment, string? Delivery,
    bool RequiresAttention, string CreatedAt, string UpdatedAt);

/// <summary>Uma seção do Monitor de Pedidos (um canal, paginação própria). `Failure` preenchido = a fonte externa estava fora.</summary>
public sealed record CwOrderSection(string Channel, string? Failure, CwPageMeta? Meta, IReadOnlyList<CwOrderItem> Items);

public sealed record CwOrdersQuery(string Source, string? Status, string? Search, int Page, int PageSize);

public sealed record CwMarketplaceOrderItem(string Title, string? SellerSku, long? ProductId, decimal Quantity, long UnitPriceCents);

public sealed record CwMarketplaceOrder(
    long Id, string Channel, string? ExternalOrderId, string Status, string? ExternalStatus, long TotalCents, string? BuyerName,
    string? PlacedAt, IReadOnlyList<CwMarketplaceOrderItem> Items);

// NotPaired: a sessão já trocou de empresa e o aparelho do ComercialWeb continua o da empresa do QR (não serve para a atual).
public enum CwStatus { Ok, TokenExpired, Rejected, Unavailable, NotPaired }

/// <param name="Error">`error.code` da recusa (4xx) do ComercialWeb, quando veio; decide a tela no app.</param>
/// <param name="RetryAfter">Segundos de espera pedidos num 429 (bloqueio por tentativas ou limite de taxa).</param>
public sealed record CwResult<T>(CwStatus Status, T? Value = default, string? Error = null, int? RetryAfter = null);

/// <summary>Aparelho vinculado à empresa pelo QR de vínculo (não é sessão nem usuário).</summary>
public sealed record CwTerminal(string Id, string Name, string Mode, long BusinessId, string? BusinessName, long? AssignedUserId);

/// <summary>Resultado do vínculo: o segredo do aparelho vai para o app (SecureStore) e só serve para pedir login.</summary>
public sealed record CwBinding(CwTerminal Terminal, string Secret);

public sealed record CwOperator(long Id, string Name, bool HasPin);

public sealed record CwTerminalState(CwTerminal Terminal, IReadOnlyList<CwOperator> Operators);

/// <summary>Credencial do aparelho vinculado, apresentada pelo app a cada pedido de login/estado.</summary>
public sealed record TerminalCredentials(string Id, string Secret);

/// <summary>Login individual no aparelho: senha (login+password), PIN (userId+pin, só compartilhado) ou convite (inviteCode+newPassword).</summary>
public sealed record TerminalLoginInput(string Method, string? Login, string? Password, long? UserId, string? Pin, string? InviteCode, string? NewPassword);

public sealed record CwLogin(CwTokens Tokens, string DeviceId, long UserId, string? UserName, CwTerminal Terminal);

/// <summary>Contrato com /api/mobile/v1 do ComercialWeb usado no pareamento e na revalidação do aparelho.</summary>
public interface IComercialWebAuth
{
    /// <summary>Troca o código do QR de vínculo por um aparelho vinculado (assinado; IP do aparelho para o limite).</summary>
    Task<CwResult<CwBinding>> BindTerminalAsync(string code, string installationId, string deviceName, string? clientIp, DeviceInfo device, CancellationToken ct);

    /// <summary>O aparelho segue vinculado? Quem pode entrar nele? `Rejected` + `terminal_revoked` = desvinculado.</summary>
    Task<CwResult<CwTerminalState>> TerminalStateAsync(TerminalCredentials terminal, string? clientIp, CancellationToken ct);

    Task<CwResult<CwLogin>> TerminalLoginAsync(TerminalCredentials terminal, TerminalLoginInput input, string? clientIp, DeviceInfo device, CancellationToken ct);

    /// <summary>PUT /me/pin com o token do aparelho (usar via DeviceLink.CallAsync).</summary>
    Task<CwResult<bool>> SetPinAsync(string accessToken, string password, string pin, CancellationToken ct);

    /// <param name="clientIp">IP do aparelho que chamou este servidor: define o balde do rate limit do /pair no ComercialWeb.</param>
    Task<CwResult<CwPairing>> PairAsync(string code, string? deviceName, string? clientIp, CancellationToken ct, DeviceInfo? device = null);

    Task<CwResult<CwBootstrap>> BootstrapAsync(string accessToken, CancellationToken ct);

    Task<CwResult<CwTokens>> RefreshAsync(string refreshToken, CancellationToken ct);

    Task<CwStatus> LogoutAsync(string accessToken, CancellationToken ct);

    /// <summary>GET /products/{id}/stock com o token do aparelho (usar via DeviceLink.CallAsync, que renova o token).</summary>
    Task<CwResult<CwStock>> ProductStockAsync(string accessToken, long productId, CancellationToken ct);

    /// <summary>GET /orders (Monitor de Pedidos, uma seção por canal). Mesmo uso do estoque: via DeviceLink.CallAsync.</summary>
    Task<CwResult<IReadOnlyList<CwOrderSection>>> OrdersAsync(string accessToken, CwOrdersQuery query, CancellationToken ct);

    Task<CwResult<CwMarketplaceOrder>> MarketplaceOrderAsync(string accessToken, long orderId, CancellationToken ct);
}

/// <summary>
/// HttpClient para o ComercialWeb. O servidor vem só da configuração (ComercialWeb:BaseUrl), nunca do QR:
/// um QR forjado não pode apontar a API para outro host (SSRF). Sem retry automático.
/// O /pair é assinado (HMAC, ver <see cref="MobileSignature"/>): sem ele o ComercialWeb responde 401.
/// </summary>
public sealed partial class ComercialWebAuthClient(HttpClient http, IConfiguration config, TimeProvider clock, ILogger<ComercialWebAuthClient> logger) : IComercialWebAuth
{
    private const string Prefix = "/api/mobile/v1";

    public async Task<CwResult<CwPairing>> PairAsync(string code, string? deviceName, string? clientIp, CancellationToken ct, DeviceInfo? device = null)
    {
        device ??= DeviceInfo.Unknown;
        var (status, body) = await SendAsync<PairDto>(HttpMethod.Post, "/pair", null,
            new { code, device_name = deviceName ?? "Aplicativo", platform = device.Platform, app_version = device.AppVersion }, ct, sign: true, clientIp);
        return body is { Device: not null } ? new(status, new CwPairing(new CwTokens(body.AccessToken, body.RefreshToken), body.Device.Id)) : new CwResult<CwPairing>(status);
    }

    public async Task<CwResult<CwBinding>> BindTerminalAsync(string code, string installationId, string deviceName, string? clientIp, DeviceInfo device, CancellationToken ct)
    {
        var reply = await SendDetailedAsync<BindingDto>(HttpMethod.Post, "/terminals/bind", null,
            new { code, installation_id = installationId, device_name = deviceName, platform = device.Platform, app_version = device.AppVersion }, ct, sign: true, clientIp);
        return reply.Body is { Terminal: { } t, TerminalSecret: { } secret }
            ? new(reply.Status, new CwBinding(Terminal(t), secret))
            : new CwResult<CwBinding>(reply.Status, Error: reply.Error, RetryAfter: reply.RetryAfter);
    }

    public async Task<CwResult<CwTerminalState>> TerminalStateAsync(TerminalCredentials terminal, string? clientIp, CancellationToken ct)
    {
        var reply = await SendDetailedAsync<StateDto>(HttpMethod.Post, "/terminals/state", null,
            new { terminal_id = terminal.Id, terminal_secret = terminal.Secret }, ct, sign: true, clientIp);
        return reply.Body is { Terminal: { } t }
            ? new(reply.Status, new CwTerminalState(Terminal(t), [.. (reply.Body.Operators ?? []).Select(o => new CwOperator(o.Id, o.Name, o.HasPin))]))
            : new CwResult<CwTerminalState>(reply.Status, Error: reply.Error, RetryAfter: reply.RetryAfter);
    }

    public async Task<CwResult<CwLogin>> TerminalLoginAsync(TerminalCredentials terminal, TerminalLoginInput input, string? clientIp, DeviceInfo device, CancellationToken ct)
    {
        var reply = await SendDetailedAsync<LoginDto>(HttpMethod.Post, "/terminals/login", null, new
        {
            terminal_id = terminal.Id,
            terminal_secret = terminal.Secret,
            method = input.Method,
            login = input.Login,
            password = input.Password,
            user_id = input.UserId,
            pin = input.Pin,
            invite_code = input.InviteCode,
            new_password = input.NewPassword,
            platform = device.Platform,
            app_version = device.AppVersion,
        }, ct, sign: true, clientIp);
        return reply.Body is { Device: not null, User: not null, Terminal: not null } b
            ? new(reply.Status, new CwLogin(new CwTokens(b.AccessToken, b.RefreshToken), b.Device.Id, b.User.Id, b.User.Name, Terminal(b.Terminal)))
            : new CwResult<CwLogin>(reply.Status, Error: reply.Error, RetryAfter: reply.RetryAfter);
    }

    public async Task<CwResult<bool>> SetPinAsync(string accessToken, string password, string pin, CancellationToken ct)
    {
        var reply = await SendDetailedAsync<object>(HttpMethod.Put, "/me/pin", accessToken, new { password, pin }, ct);
        return new(reply.Status, reply.Status == CwStatus.Ok, reply.Error, reply.RetryAfter);
    }

    private static CwTerminal Terminal(TerminalDto t) => new(t.Id, t.Name, t.Mode, t.Business?.Id ?? 0, t.Business?.Name, t.AssignedUserId);

    public async Task<CwResult<CwBootstrap>> BootstrapAsync(string accessToken, CancellationToken ct)
    {
        var (status, body) = await SendAsync<BootstrapDto>(HttpMethod.Get, "/bootstrap", accessToken, null, ct);
        return body is null ? new CwResult<CwBootstrap>(status) : new(status, new CwBootstrap(body.User.Id, body.Business.Id, body.Api?.MinAppVersion));
    }

    public async Task<CwResult<CwTokens>> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        var (status, body) = await SendAsync<PairDto>(HttpMethod.Post, "/auth/refresh", null, new { refresh_token = refreshToken }, ct);
        return body is null ? new CwResult<CwTokens>(status) : new(status, new CwTokens(body.AccessToken, body.RefreshToken));
    }

    public async Task<CwStatus> LogoutAsync(string accessToken, CancellationToken ct) =>
        (await SendAsync<object>(HttpMethod.Post, "/auth/logout", accessToken, null, ct)).Item1;

    public async Task<CwResult<CwStock>> ProductStockAsync(string accessToken, long productId, CancellationToken ct)
    {
        var (status, body) = await SendAsync<StockDto>(HttpMethod.Get, $"/products/{productId}/stock", accessToken, null, ct);
        return body?.Data is { } d ? new(status, new CwStock(d.UnitId, d.TotalMilli)) : new CwResult<CwStock>(status);
    }

    public async Task<CwResult<IReadOnlyList<CwOrderSection>>> OrdersAsync(string accessToken, CwOrdersQuery query, CancellationToken ct)
    {
        var qs = $"?source={Uri.EscapeDataString(query.Source)}&page={query.Page}&per_page={query.PageSize}"
            + (string.IsNullOrEmpty(query.Status) ? "" : $"&status={Uri.EscapeDataString(query.Status)}")
            + (string.IsNullOrEmpty(query.Search) ? "" : $"&search={Uri.EscapeDataString(query.Search)}");
        var (status, body) = await SendAsync<OrdersDto>(HttpMethod.Get, "/orders" + qs, accessToken, null, ct);
        if (body?.Data is not { } sections) return new CwResult<IReadOnlyList<CwOrderSection>>(status);
        return new(status, [.. sections.Select(s => new CwOrderSection(
            s.Channel, s.Failure, s.Meta is { } m ? new CwPageMeta(m.Page, m.PerPage, m.Total, m.LastPage) : null,
            [.. (s.Items ?? []).Select(i => new CwOrderItem(i.Id, i.Number, i.Customer, i.TotalCents, i.Status, i.Payment, i.Delivery, i.RequiresAttention, i.CreatedAt, i.UpdatedAt))]))]);
    }

    public async Task<CwResult<CwMarketplaceOrder>> MarketplaceOrderAsync(string accessToken, long orderId, CancellationToken ct)
    {
        var (status, body) = await SendAsync<MarketplaceOrderDto>(HttpMethod.Get, $"/orders/marketplace/{orderId}", accessToken, null, ct);
        return body?.Data is not { } o
            ? new CwResult<CwMarketplaceOrder>(status)
            : new(status, new CwMarketplaceOrder(o.Id, o.Channel, o.ExternalOrderId, o.Status, o.ExternalStatus, o.TotalCents, o.BuyerName, o.PlacedAt,
                [.. (o.Items ?? []).Select(i => new CwMarketplaceOrderItem(i.Title, i.SellerSku, i.ProductId, i.Quantity, i.UnitPriceCents))]));
    }

    private async Task<(CwStatus, T?)> SendAsync<T>(
        HttpMethod method, string path, string? bearer, object? body, CancellationToken ct, bool sign = false, string? clientIp = null)
    {
        var reply = await SendDetailedAsync<T>(method, path, bearer, body, ct, sign, clientIp);
        return (reply.Status, reply.Body);
    }

    /// <summary>Resposta com o `error.code` das recusas 4xx e o Retry-After do 429 (o status continua o mesmo de antes).</summary>
    private sealed record Reply<T>(CwStatus Status, T? Body = default, string? Error = null, int? RetryAfter = null);

    private async Task<Reply<T>> SendDetailedAsync<T>(
        HttpMethod method, string path, string? bearer, object? body, CancellationToken ct, bool sign = false, string? clientIp = null)
    {
        var secret = config["ComercialWeb:MobileApiSecret"];
        if (http.BaseAddress is null || (sign && string.IsNullOrEmpty(secret)))
        {
            LogNotConfigured(logger);
            return new(CwStatus.Unavailable);
        }
        using var request = new HttpRequestMessage(method, Prefix + path);
        request.Headers.Accept.Add(new("application/json"));
        if (bearer is not null) request.Headers.Authorization = new("Bearer", bearer);
        var bytes = body is null ? [] : JsonSerializer.SerializeToUtf8Bytes(body);
        if (body is not null)
        {
            request.Content = new ByteArrayContent(bytes);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        }
        if (sign)
        {
            var timestamp = clock.GetUtcNow().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
            request.Headers.Add("X-Mobile-Timestamp", timestamp);
            request.Headers.Add("X-Mobile-Signature", MobileSignature.Sign(secret!, timestamp, method.Method, Prefix + path, bytes));
            if (clientIp is not null) request.Headers.Add("X-Mobile-Client-Ip", clientIp);
        }
        try
        {
            using var response = await http.SendAsync(request, ct);
            switch (response.StatusCode)
            {
                case HttpStatusCode.OK or HttpStatusCode.Created:
                    // Corpo ausente/ilegível não é sucesso: sem ele não há como saber quem é o aparelho.
                    return await response.Content.ReadFromJsonAsync<T>(ct) is { } ok ? new(CwStatus.Ok, ok) : new(CwStatus.Unavailable);
                case HttpStatusCode.NoContent:
                    return new(CwStatus.Ok);
                case HttpStatusCode.Unauthorized when sign:
                    // Assinatura recusada = segredo divergente ou relógio fora da janela de 5 min: falha nossa, não do código do QR.
                    LogUnexpectedStatus(logger, (int)response.StatusCode);
                    return new(CwStatus.Unavailable);
                case HttpStatusCode.Unauthorized:
                    var error = await ReadErrorAsync(response, ct);
                    return new(error == "mobile_token_expired" ? CwStatus.TokenExpired : CwStatus.Rejected, Error: error);
                case HttpStatusCode.TooManyRequests:
                    // Segue Unavailable (o refresh é fail-open nele); quem precisa distinguir bloqueio olha Error/RetryAfter.
                    LogUnexpectedStatus(logger, (int)response.StatusCode);
                    return new(CwStatus.Unavailable, Error: await ReadErrorAsync(response, ct) ?? "rate_limited",
                        RetryAfter: (int?)response.Headers.RetryAfter?.Delta?.TotalSeconds ?? 60);
                case >= HttpStatusCode.BadRequest and < HttpStatusCode.InternalServerError:
                    // Qualquer outro 4xx (403, 404, 422…): o ComercialWeb não reconhece o pedido/aparelho.
                    return new(CwStatus.Rejected, Error: await ReadErrorAsync(response, ct));
                default:
                    LogUnexpectedStatus(logger, (int)response.StatusCode);
                    return new(CwStatus.Unavailable);
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException && !ct.IsCancellationRequested)
        {
            LogUnreachable(logger, e.GetType().Name);
            return new(CwStatus.Unavailable);
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
    private sealed record NamedDto(long Id, string? Name);
    private sealed record TerminalDto(string Id, string Name, string Mode, NamedDto? Business, [property: JsonPropertyName("assigned_user_id")] long? AssignedUserId);
    private sealed record BindingDto(TerminalDto? Terminal, [property: JsonPropertyName("terminal_secret")] string? TerminalSecret);
    private sealed record OperatorDto(long Id, string Name, [property: JsonPropertyName("has_pin")] bool HasPin);
    private sealed record StateDto(TerminalDto? Terminal, List<OperatorDto>? Operators);
    private sealed record LoginDto(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("refresh_token")] string RefreshToken,
        DeviceDto? Device, NamedDto? User, TerminalDto? Terminal);
    private sealed record PairDto(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("refresh_token")] string RefreshToken,
        DeviceDto? Device);
    private sealed record StockData([property: JsonPropertyName("unit_id")] long? UnitId, [property: JsonPropertyName("total_milli")] long TotalMilli);
    private sealed record StockDto(StockData? Data);
    private sealed record MetaDto(int Page, [property: JsonPropertyName("per_page")] int PerPage, long Total, [property: JsonPropertyName("last_page")] int LastPage);
    private sealed record OrderItemDto(
        string Id, string Number, string Customer, [property: JsonPropertyName("total_cents")] long TotalCents, string Status, string? Payment, string? Delivery,
        [property: JsonPropertyName("requires_attention")] bool RequiresAttention, [property: JsonPropertyName("created_at")] string CreatedAt,
        [property: JsonPropertyName("updated_at")] string UpdatedAt);
    private sealed record SectionDto(string Channel, string? Failure, MetaDto? Meta, List<OrderItemDto>? Items);
    private sealed record OrdersDto(List<SectionDto>? Data);
    private sealed record MpItemDto(string Title, [property: JsonPropertyName("seller_sku")] string? SellerSku, [property: JsonPropertyName("product_id")] long? ProductId,
        decimal Quantity, [property: JsonPropertyName("unit_price_cents")] long UnitPriceCents);
    private sealed record MpOrderData(
        long Id, string Channel, [property: JsonPropertyName("external_order_id")] string? ExternalOrderId, string Status,
        [property: JsonPropertyName("external_status")] string? ExternalStatus, [property: JsonPropertyName("total_cents")] long TotalCents,
        [property: JsonPropertyName("buyer_name")] string? BuyerName, [property: JsonPropertyName("placed_at")] string? PlacedAt, List<MpItemDto>? Items);
    private sealed record MarketplaceOrderDto(MpOrderData? Data);
    private sealed record IdDto(long Id);
    private sealed record ApiDto([property: JsonPropertyName("min_app_version")] string? MinAppVersion);
    private sealed record BootstrapDto(IdDto User, IdDto Business, ApiDto? Api);
    private sealed record ErrorBody(string? Code);
    private sealed record ErrorDto(ErrorBody? Error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb:BaseUrl (ou ComercialWeb:MobileApiSecret, no pareamento) não configurada; pareamento indisponível.")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "ComercialWeb indisponível ({Error}).")]
    private static partial void LogUnreachable(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Error, Message = "ComercialWeb respondeu {Status} inesperado (401 no pareamento indica segredo ou relógio divergente).")]
    private static partial void LogUnexpectedStatus(ILogger logger, int status);
}
