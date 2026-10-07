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
    public Func<string, long, CwResult<CwStock>> Stock { get; set; } = (_, _) => new(CwStatus.Ok, new CwStock(7, 12_500));
    public Func<string, CwOrdersQuery, CwResult<IReadOnlyList<CwOrderSection>>> Orders { get; set; } = (_, q) => new(CwStatus.Ok,
        [new CwOrderSection("store", null, new CwPageMeta(q.Page, q.PageSize, 1, 1),
            [new CwOrderItem("77", "LV-77", "Maria", 15_990, "Pago", "Pix", "Correios", false, "2026-09-29T10:00:00-03:00", "2026-09-29T10:05:00-03:00")])]);
    public Func<string, long, CwResult<CwMarketplaceOrder>> MarketplaceOrder { get; set; } = (_, id) => new(CwStatus.Ok,
        new CwMarketplaceOrder(id, "mercadolivre", "2000001", "Pago", "paid", 9_990, "João", "2026-09-29T09:00:00-03:00", [new CwMarketplaceOrderItem("Camiseta", "CAM-01", 100, 2, 4_995)]));
    public List<string> Calls { get; } = [];

    public Task<CwResult<CwPairing>> PairAsync(string code, string? deviceName, string? clientIp, CancellationToken ct, DeviceInfo? device = null)
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

    public async Task<CwResult<CwStock>> ProductStockAsync(string accessToken, long productId, CancellationToken ct)
    {
        Calls.Add($"stock:{accessToken}:{productId}");
        await Task.Yield(); // deixa chamadas concorrentes se intercalarem
        return Stock(accessToken, productId);
    }

    public Task<CwResult<IReadOnlyList<CwOrderSection>>> OrdersAsync(string accessToken, CwOrdersQuery query, CancellationToken ct)
    {
        Calls.Add($"orders:{query.Source}:{query.Status}:{query.Search}:{query.Page}:{query.PageSize}");
        return Task.FromResult(Orders(accessToken, query));
    }

    public Task<CwResult<CwMarketplaceOrder>> MarketplaceOrderAsync(string accessToken, long orderId, CancellationToken ct)
    {
        Calls.Add($"marketplace-order:{orderId}");
        return Task.FromResult(MarketplaceOrder(accessToken, orderId));
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
    public async Task Trocar_de_empresa_nao_derruba_o_refresh_e_bloqueia_chamadas_do_aparelho_na_outra_empresa()
    {
        _store.ActiveMemberships.Add((1, 20));
        var paired = (await _auth.PairAsync(Code, null, null, Ct)).Session!;
        var id = _store.Sessions.Keys.Single();

        Assert.NotNull(await _auth.SwitchBusinessAsync(id, 1, 20, Ct));
        // O aparelho segue pareado na empresa do QR (10), mesmo com a sessão na 20: o refresh não pode revogar.
        Assert.NotNull((await _auth.RefreshAsync(paired.RefreshToken, Ct)).Session);
        Assert.Null(_store.Sessions[id].Reason);

        // E o token do aparelho não serve para a empresa 20.
        _cw.Calls.Clear();
        Assert.Equal(CwStatus.NotPaired, (await _link.CallAsync(id, 20, (a, c) => _cw.ProductStockAsync(a, 1, c), Ct)).Status);
        Assert.DoesNotContain(_cw.Calls, c => c.StartsWith("stock:", StringComparison.Ordinal));
        Assert.Equal(CwStatus.Ok, (await _link.CallAsync(id, 10, (a, c) => _cw.ProductStockAsync(a, 1, c), Ct)).Status);
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
    public async Task Duas_chamadas_com_token_expirado_ao_mesmo_tempo_renovam_o_par_uma_so_vez()
    {
        await _auth.PairAsync(Code, null, null, Ct);
        var id = _store.Sessions.Keys.Single();
        _cw.Stock = (access, _) => access == "cw-access-1" ? new(CwStatus.TokenExpired) : new(CwStatus.Ok, new CwStock(7, 1_000));
        _cw.Calls.Clear();

        var results = await Task.WhenAll(
            _link.CallAsync(id, 10, (a, c) => _cw.ProductStockAsync(a, 1, c), Ct),
            _link.CallAsync(id, 10, (a, c) => _cw.ProductStockAsync(a, 2, c), Ct));

        Assert.All(results, r => Assert.Equal(CwStatus.Ok, r.Status));
        Assert.Single(_cw.Calls, c => c.StartsWith("refresh:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Token_ainda_expirado_depois_de_renovar_vira_recusa_e_nao_expirado()
    {
        await _auth.PairAsync(Code, null, null, Ct);
        var id = _store.Sessions.Keys.Single();
        _cw.Stock = (_, _) => new(CwStatus.TokenExpired);

        var result = await _link.CallAsync(id, 10, (a, c) => _cw.ProductStockAsync(a, 1, c), Ct);

        Assert.Equal(CwStatus.Rejected, result.Status);
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
    public async Task Saldo_do_produto_le_o_data_do_comercialweb_com_bearer_do_aparelho()
    {
        var stub = new Stub(() => Json(HttpStatusCode.OK, """{"data":{"product_id":5,"unit_id":7,"total_milli":12500,"balances":[]}}"""));

        var result = await Client(stub).ProductStockAsync("tok", 5, Ct);

        Assert.Equal(new CwStock(7, 12_500), result.Value);
        var (request, _) = Assert.Single(stub.Received);
        Assert.Equal("https://cw.test/api/mobile/v1/products/5/stock", request.RequestUri!.ToString());
        Assert.Equal("Bearer tok", request.Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task Pedidos_le_secoes_por_canal_com_filtros_na_query_e_paginacao_propria()
    {
        var stub = new Stub(() => Json(HttpStatusCode.OK, """
            {"data":[{"channel":"store","failure":null,"meta":{"page":2,"per_page":20,"total":41,"last_page":3},
              "items":[{"id":"77","number":"LV-77","customer":"Maria","total_cents":15990,"status":"Pago","payment":"Pix","delivery":null,
                        "requires_attention":true,"created_at":"2026-09-29T10:00:00-03:00","updated_at":"2026-09-29T10:05:00-03:00"}]},
             {"channel":"mercadolivre","failure":"Fonte indisponível","meta":null,"items":[]}]}
            """));

        var result = await Client(stub).OrdersAsync("tok", new CwOrdersQuery("all", "paid", "joão silva", 2, 20), Ct);

        var (store, ml) = (result.Value![0], result.Value[1]);
        Assert.Equal(new CwPageMeta(2, 20, 41, 3), store.Meta);
        Assert.Equal(new CwOrderItem("77", "LV-77", "Maria", 15_990, "Pago", "Pix", null, true, "2026-09-29T10:00:00-03:00", "2026-09-29T10:05:00-03:00"), Assert.Single(store.Items));
        Assert.Equal(("Fonte indisponível", null), (ml.Failure, ml.Meta));
        Assert.Equal("https://cw.test/api/mobile/v1/orders?source=all&page=2&per_page=20&status=paid&search=jo%C3%A3o%20silva", Assert.Single(stub.Received).Request.RequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task Pedido_de_marketplace_le_itens_e_datas()
    {
        var stub = new Stub(() => Json(HttpStatusCode.OK, """
            {"data":{"id":9,"channel":"mercadolivre","external_order_id":"2000009","status":"Pago","external_status":"paid","total_cents":9990,
                     "buyer_name":"João","placed_at":"2026-09-29T09:00:00-03:00",
                     "items":[{"title":"Camiseta","seller_sku":null,"product_id":null,"quantity":2,"unit_price_cents":4995}]}}
            """));

        var order = (await Client(stub).MarketplaceOrderAsync("tok", 9, Ct)).Value!;

        Assert.Equal(("mercadolivre", "2000009", 9_990), (order.Channel, order.ExternalOrderId, order.TotalCents));
        Assert.Equal(new CwMarketplaceOrderItem("Camiseta", null, null, 2, 4_995), Assert.Single(order.Items));
    }

    [Fact]
    public async Task Pair_envia_plataforma_e_versao_validas_e_troca_lixo_pelo_padrao()
    {
        var stub = new Stub(() => Json(HttpStatusCode.Created, PairJson));
        var client = Client(stub);

        await client.PairAsync("c", null, null, Ct, DeviceInfo.From("ios", "1.4.2"));
        await client.PairAsync("c", null, null, Ct, DeviceInfo.From("<script>", "1.0.0'; DROP"));
        await client.PairAsync("c", null, null, Ct);

        var bodies = stub.Received.Select(r => System.Text.Json.JsonElement.Parse(r.Body)).ToList();
        Assert.Equal(("ios", "1.4.2"), (bodies[0].GetProperty("platform").GetString(), bodies[0].GetProperty("app_version").GetString()));
        Assert.All(bodies.Skip(1), b => Assert.Equal(("other", "0.0.0"), (b.GetProperty("platform").GetString(), b.GetProperty("app_version").GetString())));
    }

    [Fact]
    public async Task Refresh_nao_e_assinado()
    {
        var stub = new Stub(() => Json(HttpStatusCode.OK, PairJson));
        await Client(stub).RefreshAsync("r", Ct);
        Assert.False(Assert.Single(stub.Received).Request.Headers.Contains("X-Mobile-Signature"));
    }
}
