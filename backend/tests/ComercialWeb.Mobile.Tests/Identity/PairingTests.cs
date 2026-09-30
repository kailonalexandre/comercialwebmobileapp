using System.Net;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ComercialWeb.Mobile.Tests.Identity;

/// <summary>ComercialWeb falso: programa o que cada rota de /api/mobile/v1 responde e registra as chamadas.</summary>
public sealed class FakeComercialWebAuth : IComercialWebAuth
{
    public CwResult<CwPairing> Pair { get; set; } = new(CwStatus.Ok, new CwPairing(new CwTokens("cw-access-1", "cw-refresh-1"), "3f2b8c1e-0000-4000-8000-000000000001"));
    public Func<string, CwResult<CwBootstrap>> Bootstrap { get; set; } = _ => new(CwStatus.Ok, new CwBootstrap(1, 10));
    public CwResult<CwTokens> Refresh { get; set; } = new(CwStatus.Ok, new CwTokens("cw-access-2", "cw-refresh-2"));
    public List<string> Calls { get; } = [];

    public Task<CwResult<CwPairing>> PairAsync(string code, string? deviceName, string? clientIp, CancellationToken ct)
    {
        Calls.Add($"pair:{code}");
        return Task.FromResult(Pair);
    }

    public Task<CwResult<CwBootstrap>> BootstrapAsync(string accessToken, CancellationToken ct)
    {
        Calls.Add($"bootstrap:{accessToken}");
        return Task.FromResult(Bootstrap(accessToken));
    }

    public Task<CwResult<CwTokens>> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        Calls.Add($"refresh:{refreshToken}");
        return Task.FromResult(Refresh);
    }

    public Task<CwStatus> LogoutAsync(string accessToken, CancellationToken ct)
    {
        Calls.Add($"logout:{accessToken}");
        return Task.FromResult(CwStatus.Ok);
    }
}

public sealed class PairingTests
{
    private const string Code = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567";
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly FakeIdentityStore _store = new();
    private readonly ManualClock _clock = new(new DateTimeOffset(2026, 9, 29, 12, 0, 0, TimeSpan.Zero));
    private readonly FakeComercialWebAuth _cw = new();
    private readonly DeviceLink _link;
    private readonly AuthService _auth;

    public PairingTests()
    {
        var jwt = new JwtSettings("i", "a", new ECDsaSecurityKey(ECDsa.Create(ECCurve.NamedCurves.nistP256)));
        _store.Users.Add(new(1, "ana@a.com", "ana", "x"));
        _store.ActiveMemberships.Add((1, 10));
        _link = new DeviceLink(_store, _cw, DataProtectionProvider.Create("teste"));
        _auth = new AuthService(_store, new TokenIssuer(jwt), new LoginThrottle(_clock), _clock, _cw, _link);
    }

    [Fact]
    public async Task Pareamento_cria_sessao_do_usuario_e_empresa_que_o_comercialweb_informou()
    {
        var result = await _auth.PairAsync(Code, "Galaxy", null, Ct);

        var jwt = new JsonWebToken(result.Session!.AccessToken);
        Assert.Equal("1", jwt.Subject);
        Assert.Equal("10", jwt.GetClaim(TokenIssuer.BusinessClaim).Value);
        var session = Assert.Single(_store.Sessions.Values).Session;
        Assert.Equal("3f2b8c1e-0000-4000-8000-000000000001", session.CwDeviceId);
        Assert.Equal("Galaxy", session.DeviceName);
    }

    [Fact]
    public async Task Tokens_do_comercialweb_ficam_cifrados_e_nunca_vao_ao_app()
    {
        var result = await _auth.PairAsync(Code, null, null, Ct);

        var stored = Assert.Single(_store.CwTokens.Values);
        Assert.DoesNotContain("cw-access-1", stored, StringComparison.Ordinal);
        Assert.DoesNotContain("cw-refresh-1", stored, StringComparison.Ordinal);
        Assert.DoesNotContain("cw-", result.Session!.AccessToken + result.Session.RefreshToken, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(CwStatus.Rejected, AuthFailure.InvalidPairingCode)]
    [InlineData(CwStatus.TokenExpired, AuthFailure.InvalidPairingCode)]
    [InlineData(CwStatus.Unavailable, AuthFailure.Unavailable)]
    public async Task Falha_no_pair_nao_cria_sessao(CwStatus status, AuthFailure expected)
    {
        _cw.Pair = new(status);

        var result = await _auth.PairAsync(Code, null, null, Ct);

        Assert.Equal(expected, result.Failure);
        Assert.Empty(_store.Sessions);
    }

    [Fact]
    public async Task Bootstrap_recusado_depois_do_pair_nao_cria_sessao()
    {
        _cw.Bootstrap = _ => new(CwStatus.Rejected);

        Assert.Equal(AuthFailure.InvalidPairingCode, (await _auth.PairAsync(Code, null, null, Ct)).Failure);
        Assert.Empty(_store.Sessions);
    }

    [Fact]
    public async Task Bootstrap_que_falha_desfaz_o_aparelho_criado_no_comercialweb()
    {
        _cw.Bootstrap = _ => new(CwStatus.Unavailable);
        _cw.Calls.Clear();

        Assert.Equal(AuthFailure.Unavailable, (await _auth.PairAsync(Code, null, null, Ct)).Failure);
        Assert.Contains("logout:cw-access-1", _cw.Calls);
    }

    [Fact]
    public async Task Resposta_ok_sem_corpo_nao_e_sucesso()
    {
        _cw.Pair = new(CwStatus.Ok);

        Assert.Equal(AuthFailure.Unavailable, (await _auth.PairAsync(Code, null, null, Ct)).Failure);
        Assert.Empty(_store.Sessions);
    }

    [Fact]
    public async Task Refresh_confere_o_aparelho_no_comercialweb()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Calls.Clear();

        Assert.NotNull((await _auth.RefreshAsync(refresh, Ct)).Session);
        Assert.Equal(["bootstrap:cw-access-1"], _cw.Calls);
    }

    [Fact]
    public async Task Aparelho_revogado_no_painel_derruba_o_refresh_e_a_sessao()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Bootstrap = _ => new(CwStatus.Rejected);

        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(refresh, Ct)).Failure);
        Assert.Equal("device_revoked", Assert.Single(_store.Sessions.Values).Reason);
    }

    [Fact]
    public async Task Versao_minima_do_app_vai_no_pareamento_e_em_cada_refresh_quando_o_comercialweb_informa()
    {
        _cw.Bootstrap = _ => new(CwStatus.Ok, new CwBootstrap(1, 10, "1.2.0"));
        var paired = (await _auth.PairAsync(Code, null, null, Ct)).Session!;
        Assert.Equal("1.2.0", paired.MinAppVersion);

        _cw.Bootstrap = _ => new(CwStatus.Ok, new CwBootstrap(1, 10, "1.3.0"));
        Assert.Equal("1.3.0", (await _auth.RefreshAsync(paired.RefreshToken, Ct)).Session!.MinAppVersion);
    }

    [Fact]
    public async Task Sem_resposta_do_comercialweb_o_refresh_nao_inventa_versao_minima()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Bootstrap = _ => new(CwStatus.Unavailable);

        var session = (await _auth.RefreshAsync(refresh, Ct)).Session!;

        Assert.Null(session.MinAppVersion);
    }

    [Fact]
    public async Task Access_do_comercialweb_expirado_renova_com_o_refresh_dele_e_guarda_o_novo_par()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Bootstrap = access => access == "cw-access-1" ? new(CwStatus.TokenExpired) : new(CwStatus.Ok, new CwBootstrap(1, 10));
        _cw.Calls.Clear();

        Assert.NotNull((await _auth.RefreshAsync(refresh, Ct)).Session);
        Assert.Equal(["bootstrap:cw-access-1", "refresh:cw-refresh-1", "bootstrap:cw-access-2"], _cw.Calls);

        // Na próxima checagem já usa o par novo.
        _cw.Calls.Clear();
        _cw.Bootstrap = _ => new(CwStatus.Ok, new CwBootstrap(1, 10));
        Assert.True((await _link.IsStillPairedAsync(_store.Sessions.Keys.Single(), 1, 10, Ct)).Paired);
        Assert.Equal(["bootstrap:cw-access-2"], _cw.Calls);
    }

    [Fact]
    public async Task Refresh_do_comercialweb_recusado_revoga()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Bootstrap = _ => new(CwStatus.TokenExpired);
        _cw.Refresh = new(CwStatus.Rejected);

        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(refresh, Ct)).Failure);
    }

    [Fact]
    public async Task Comercialweb_fora_do_ar_nao_derruba_o_app()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Bootstrap = _ => new(CwStatus.Unavailable);

        Assert.NotNull((await _auth.RefreshAsync(refresh, Ct)).Session);
    }

    [Fact]
    public async Task Bootstrap_de_outro_usuario_ou_empresa_revoga()
    {
        var refresh = (await _auth.PairAsync(Code, null, null, Ct)).Session!.RefreshToken;
        _cw.Bootstrap = _ => new(CwStatus.Ok, new CwBootstrap(1, 99));

        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(refresh, Ct)).Failure);
    }

    [Fact]
    public async Task Sessao_sem_vinculo_nao_consulta_o_comercialweb()
    {
        var id = Guid.NewGuid();
        await _store.CreateSessionAsync(new NewSession(id, 1, 10, null, _clock.Now, _clock.Now.AddDays(1)), new NewRefreshToken(new byte[32], id, _clock.Now, _clock.Now.AddDays(1)), Ct);

        Assert.True((await _link.IsStillPairedAsync(id, 1, 10, Ct)).Paired);
        Assert.Empty(_cw.Calls);
    }

    [Fact]
    public async Task Logout_remove_o_aparelho_no_comercialweb_e_revoga_a_sessao()
    {
        await _auth.PairAsync(Code, null, null, Ct);
        _cw.Calls.Clear();
        var id = _store.Sessions.Keys.Single();

        await _auth.LogoutAsync(id, Ct);

        Assert.Equal(["logout:cw-access-1"], _cw.Calls);
        Assert.Equal("logout", _store.Sessions[id].Reason);
    }
}

public sealed class ComercialWebAuthClientTests
{
    private const string Secret = "segredo-de-teste-com-mais-de-32-caracteres";
    private const string PairJson = """{"access_token":"a","refresh_token":"r","device":{"id":"d"}}""";
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class Stub(Func<HttpResponseMessage> reply) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Received { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Received.Add((request, request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct)));
            return reply();
        }
    }

    private static ComercialWebAuthClient Client(Func<HttpResponseMessage> reply, string? secret = Secret) => Client(new Stub(reply), secret);

    private static ComercialWebAuthClient Client(Stub stub, string? secret = Secret) =>
        new(new HttpClient(stub) { BaseAddress = new Uri("https://cw.test") },
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["ComercialWeb:MobileApiSecret"] = secret }).Build(),
            new ManualClock(new DateTimeOffset(2026, 9, 29, 12, 0, 0, TimeSpan.Zero)),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ComercialWebAuthClient>.Instance);

    private static HttpResponseMessage Json(HttpStatusCode code, string json) =>
        new(code) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };

    [Theory]
    [InlineData(HttpStatusCode.NotFound, CwStatus.Rejected)]
    [InlineData(HttpStatusCode.BadRequest, CwStatus.Rejected)]
    [InlineData(HttpStatusCode.Forbidden, CwStatus.Rejected)]
    [InlineData(HttpStatusCode.TooManyRequests, CwStatus.Unavailable)]
    [InlineData(HttpStatusCode.BadGateway, CwStatus.Unavailable)]
    public async Task Status_http_vira_resultado_sem_afrouxar_a_revogacao(HttpStatusCode code, CwStatus expected)
    {
        var result = await Client(() => new HttpResponseMessage(code)).BootstrapAsync("t", Ct);

        Assert.Equal(expected, result.Status);
    }

    [Fact]
    public async Task Distingue_token_expirado_de_401_qualquer_inclusive_com_corpo_nao_json()
    {
        var expired = new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("""{"error":{"code":"mobile_token_expired"}}""", System.Text.Encoding.UTF8, "application/json") };
        var html = new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("<html>", System.Text.Encoding.UTF8, "text/html") };

        Assert.Equal(CwStatus.TokenExpired, (await Client(() => expired).BootstrapAsync("t", Ct)).Status);
        Assert.Equal(CwStatus.Rejected, (await Client(() => html).BootstrapAsync("t", Ct)).Status);
    }

    [Fact]
    public async Task Pair_vai_assinado_sobre_os_bytes_enviados_e_com_o_ip_do_aparelho()
    {
        var stub = new Stub(() => Json(HttpStatusCode.Created, PairJson));

        var result = await Client(stub).PairAsync("c", "Galaxy", "203.0.113.7", Ct);

        Assert.Equal(CwStatus.Ok, result.Status);
        var (request, body) = Assert.Single(stub.Received);
        Assert.Equal("https://cw.test/api/mobile/v1/pair", request.RequestUri!.ToString());
        var timestamp = request.Headers.GetValues("X-Mobile-Timestamp").Single();
        Assert.Equal("1790683200", timestamp);
        Assert.Equal(ComercialWeb.Mobile.Identity.Infrastructure.MobileSignature.Sign(Secret, timestamp, "POST", "/api/mobile/v1/pair", System.Text.Encoding.UTF8.GetBytes(body)),
            request.Headers.GetValues("X-Mobile-Signature").Single());
        Assert.Equal("203.0.113.7", request.Headers.GetValues("X-Mobile-Client-Ip").Single());
    }

    [Fact]
    public async Task Pair_sem_ip_nao_envia_o_cabecalho()
    {
        var stub = new Stub(() => Json(HttpStatusCode.Created, PairJson));
        await Client(stub).PairAsync("c", null, null, Ct);
        Assert.False(Assert.Single(stub.Received).Request.Headers.Contains("X-Mobile-Client-Ip"));
    }

    [Fact]
    public async Task Pair_sem_segredo_nao_chama_o_comercialweb()
    {
        var stub = new Stub(() => Json(HttpStatusCode.Created, PairJson));
        Assert.Equal(CwStatus.Unavailable, (await Client(stub, secret: null).PairAsync("c", null, "203.0.113.7", Ct)).Status);
        Assert.Empty(stub.Received);
    }

    [Fact]
    public async Task Pair_com_401_e_falha_de_configuracao_nao_codigo_invalido()
    {
        var client = Client(() => Json(HttpStatusCode.Unauthorized, """{"success":false,"error":{"code":"unauthenticated"}}"""));
        Assert.Equal(CwStatus.Unavailable, (await client.PairAsync("c", null, null, Ct)).Status);
    }

    [Fact]
    public async Task Refresh_nao_e_assinado()
    {
        var stub = new Stub(() => Json(HttpStatusCode.OK, PairJson));
        await Client(stub).RefreshAsync("r", Ct);
        Assert.False(Assert.Single(stub.Received).Request.Headers.Contains("X-Mobile-Signature"));
    }
}
