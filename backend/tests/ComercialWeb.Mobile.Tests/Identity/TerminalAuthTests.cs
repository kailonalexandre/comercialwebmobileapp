using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

namespace ComercialWeb.Mobile.Tests.Identity;

/// <summary>Sessão aberta por login no aparelho vinculado: validade por modo, inatividade, reuso e trilha.</summary>
public sealed class TerminalAuthTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly TerminalCredentials Terminal = new(FakeComercialWebAuth.SharedTerminal.Id, new string('s', 60));
    private static readonly TerminalLoginInput Pin = new("pin", null, null, 1, "482913", null, null);

    private readonly FakeIdentityStore _store = new();
    private readonly ManualClock _clock = new(new DateTimeOffset(2026, 10, 15, 12, 0, 0, TimeSpan.Zero));
    private readonly FakeComercialWebAuth _cw = new();
    private readonly AuthService _auth;

    public TerminalAuthTests()
    {
        var jwt = new JwtSettings("i", "a", new ECDsaSecurityKey(ECDsa.Create(ECCurve.NamedCurves.nistP256)));
        _store.Users.Add(new(1, "ana@a.com", "ana", "x"));
        _store.ActiveMemberships.Add((1, 10));
        _store.ActiveMemberships.Add((1, 20));
        var link = new DeviceLink(_store, _cw, DataProtectionProvider.Create("teste"));
        _auth = new AuthService(_store, new TokenIssuer(jwt), new LoginThrottle(_clock), _clock, _cw, link, null, new AuditTrail(_store, NullLogger<AuditTrail>.Instance));
    }

    [Fact]
    public async Task Login_no_aparelho_compartilhado_abre_sessao_curta_presa_ao_aparelho()
    {
        var result = await _auth.TerminalLoginAsync(Terminal, Pin, "203.0.113.7", DeviceInfo.Unknown, Ct);

        var session = Assert.Single(_store.Sessions.Values).Session;
        Assert.Equal("shared", session.Mode);
        Assert.Equal(Terminal.Id, session.TerminalId);
        Assert.Equal(_clock.Now.AddHours(12), session.ExpiresAt);
        Assert.Equal(120, result.Policy!.IdleLockSeconds);
        // O refresh não sobrevive à sessão: 12 h, não os 30 dias do refresh comum.
        Assert.All(_store.Tokens.Values, t => Assert.True(t.Token.ExpiresAt <= session.ExpiresAt));
    }

    [Fact]
    public async Task Sessao_compartilhada_parada_alem_da_inatividade_cai_no_servidor()
    {
        var login = await _auth.TerminalLoginAsync(Terminal, Pin, null, DeviceInfo.Unknown, Ct);
        _clock.Now += TimeSpan.FromMinutes(31);

        var refresh = await _auth.RefreshAsync(login.Session!.RefreshToken, Ct);

        Assert.Equal(AuthFailure.InvalidToken, refresh.Failure);
        Assert.Equal("idle_timeout", Assert.Single(_store.Sessions.Values).Reason);
        Assert.Contains(_store.Audit, a => a.Event == "session.expired" && a.TerminalId == Terminal.Id);
    }

    [Fact]
    public async Task Sessao_pessoal_renova_dentro_da_inatividade_e_nunca_passa_de_30_dias()
    {
        _cw.Login = _ => new(CwStatus.Ok, new CwLogin(new CwTokens("a", "r"), "3f2b8c1e-0000-4000-8000-000000000003", 1, "Ana",
            FakeComercialWebAuth.SharedTerminal with { Mode = "personal" }));
        var token = (await _auth.TerminalLoginAsync(Terminal, Pin, null, DeviceInfo.Unknown, Ct)).Session!.RefreshToken;

        for (var day = 0; day < 29; day++)
        {
            _clock.Now += TimeSpan.FromDays(1);
            token = (await _auth.RefreshAsync(token, Ct)).Session!.RefreshToken;
        }
        _clock.Now += TimeSpan.FromDays(1) + TimeSpan.FromSeconds(1);

        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(token, Ct)).Failure);
    }

    [Fact]
    public async Task Reuso_de_refresh_derruba_a_sessao_e_fica_na_trilha()
    {
        var first = (await _auth.TerminalLoginAsync(Terminal, Pin, null, DeviceInfo.Unknown, Ct)).Session!.RefreshToken;
        Assert.NotNull((await _auth.RefreshAsync(first, Ct)).Session);

        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(first, Ct)).Failure);
        Assert.Equal("refresh_reuse", Assert.Single(_store.Sessions.Values).Reason);
        Assert.Contains(_store.Audit, a => a.Event == "session.refresh_reuse");
    }

    [Fact]
    public async Task Aparelho_compartilhado_nao_troca_de_empresa()
    {
        await _auth.TerminalLoginAsync(Terminal, Pin, null, DeviceInfo.Unknown, Ct);
        var id = Assert.Single(_store.Sessions.Keys);

        Assert.Null(await _auth.SwitchBusinessAsync(id, 1, 20, Ct));
    }

    [Fact]
    public async Task Troca_de_operador_encerra_a_sessao_e_registra_quem_saiu()
    {
        await _auth.TerminalLoginAsync(Terminal, Pin, null, DeviceInfo.Unknown, Ct);
        var id = Assert.Single(_store.Sessions.Keys);

        await _auth.LogoutAsync(id, Ct, 1, 10, "operator_switch");

        Assert.Equal("operator_switch", _store.Sessions[id].Reason);
        Assert.Contains(_store.Audit, a => a.Event == "operator.switched" && a.UserId == 1 && a.BusinessId == 10);
        Assert.Contains("logout:cw-access-1", _cw.Calls);
    }

    [Fact]
    public async Task Recusa_do_comercialweb_nao_cria_sessao_e_devolve_o_codigo()
    {
        _cw.Login = _ => new(CwStatus.Unavailable, Error: "account_locked", RetryAfter: 900);

        var result = await _auth.TerminalLoginAsync(Terminal, Pin, null, DeviceInfo.Unknown, Ct);

        Assert.Null(result.Session);
        Assert.Equal(("account_locked", 900), (result.Error, result.RetryAfter));
        Assert.Empty(_store.Sessions);
    }
}

public sealed class TerminalFixture : ApiFixture
{
    public FakeComercialWebAuth ComercialWeb { get; } = new();

    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (20, 1, 'active');
        INSERT INTO mobile_terminals (id, uuid, business_id) VALUES (5, '6a1f0c2e-0000-4000-8000-0000000000aa', 10);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Auth:PasswordLogin", "false");
        builder.ConfigureTestServices(services => services.AddSingleton<IComercialWebAuth>(ComercialWeb));
    }
}

public sealed class TerminalApiTests(TerminalFixture api) : IClassFixture<TerminalFixture>
{
    private const string Code = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567";
    private static readonly string TerminalId = FakeComercialWebAuth.SharedTerminal.Id;
    private static readonly string Secret = new('s', 60);
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record LoginDto(string AccessToken, string RefreshToken, PolicyDto Policy, UserDto User);
    private sealed record PolicyDto(string Mode, int IdleLockSeconds, int OfflineHours, bool Biometric);
    private sealed record UserDto(long Id, string Name);
    private sealed record CodeDto(string Code);

    [Fact]
    public async Task Vinculo_devolve_segredo_do_aparelho_e_nenhuma_sessao()
    {
        TestDatabase.RequireMySql();

        var response = await api.Anonymous().PostAsJsonAsync("/api/v1/terminal/bind",
            new { code = Code, installationId = Guid.NewGuid(), deviceName = "Galaxy A55", platform = "android", appVersion = "1.4.0" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.Contains(Secret, body, StringComparison.Ordinal);
        Assert.DoesNotContain("accessToken", body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("curto", "8f6c1e2a-0000-4000-8000-000000000001")]
    [InlineData(Code, "nao-e-uuid")]
    public async Task Vinculo_com_formato_errado_nem_chega_ao_comercialweb(string code, string installation)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Calls.Clear();

        var response = await api.Anonymous().PostAsJsonAsync("/api/v1/terminal/bind", new { code, installationId = installation }, Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.DoesNotContain(api.ComercialWeb.Calls, c => c.StartsWith("bind:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Login_no_aparelho_abre_a_sessao_do_funcionario_com_a_politica_do_modo()
    {
        TestDatabase.RequireMySql();
        var (client, login) = await LoginAsync();

        Assert.Equal(("shared", 120, false), (login.Policy.Mode, login.Policy.IdleLockSeconds, login.Policy.Biometric));
        Assert.Equal(1, login.User.Id);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);
        // Aparelho compartilhado não troca de empresa.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 20 }, Ct)).StatusCode);
    }

    [Theory]
    [InlineData(CwStatus.Rejected, "invalid_credentials", null, HttpStatusCode.Unauthorized, "invalid_credentials")]
    [InlineData(CwStatus.Rejected, "terminal_revoked", null, HttpStatusCode.Forbidden, "terminal_revoked")]
    [InlineData(CwStatus.Rejected, "terminal_assigned", null, HttpStatusCode.Forbidden, "terminal_assigned")]
    [InlineData(CwStatus.Unavailable, "account_locked", 900, HttpStatusCode.TooManyRequests, "account_locked")]
    public async Task Recusa_do_login_chega_ao_app_com_codigo_estavel(CwStatus status, string error, int? retry, HttpStatusCode expected, string code)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Login = _ => new(status, Error: error, RetryAfter: retry);
        try
        {
            var response = await api.Anonymous().PostAsJsonAsync("/api/v1/auth/terminal-login",
                new { terminalId = TerminalId, terminalSecret = Secret, method = "password", login = "ana", password = "x" }, Ct);

            Assert.Equal(expected, response.StatusCode);
            Assert.Equal(code, (await response.Content.ReadFromJsonAsync<CodeDto>(Ct))!.Code);
            if (retry is not null) Assert.Equal("900", response.Headers.RetryAfter!.ToString());
        }
        finally
        {
            api.ComercialWeb.Login = new FakeComercialWebAuth().Login;
        }
    }

    [Fact]
    public async Task Sessao_revogada_no_painel_cai_na_hora_sem_esperar_o_refresh()
    {
        TestDatabase.RequireMySql();
        const string device = "3f2b8c1e-0000-4000-8000-0000000000d1";
        api.ComercialWeb.Login = _ => new(CwStatus.Ok, new CwLogin(new CwTokens("a", "r"), device, 1, "Ana", FakeComercialWebAuth.SharedTerminal));
        try
        {
            var (client, _) = await LoginAsync();
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);

            await api.Db.ExecuteAsync("INSERT INTO mobile_devices (uuid, business_id, user_id, terminal_id, revoked_at) VALUES (@device, 10, 1, 5, NOW())", new { device });

            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.Login = new FakeComercialWebAuth().Login;
        }
    }

    [Fact]
    public async Task Pin_errado_volta_422_e_nao_derruba_a_sessao()
    {
        TestDatabase.RequireMySql();
        var (client, _) = await LoginAsync();
        api.ComercialWeb.Pin = new(CwStatus.Rejected, false, "invalid_credentials");
        try
        {
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PutAsJsonAsync("/api/v1/me/pin", new { password = "x", pin = "48291" }, Ct)).StatusCode);
            var refused = await client.PutAsJsonAsync("/api/v1/me/pin", new { password = "x", pin = "482913" }, Ct);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, refused.StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.Pin = new(CwStatus.Ok, true);
        }
    }

    [Fact]
    public async Task Operacao_da_fila_fica_na_trilha_com_quem_e_quando_foi_criada()
    {
        TestDatabase.RequireMySql();
        var (client, _) = await LoginAsync();
        var key = Guid.NewGuid().ToString();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/pre-sales") { Content = JsonContent.Create(new { }) };
        request.Headers.Add("Idempotency-Key", key);
        request.Headers.Add("X-Client-Created-At", "2026-10-15T08:30:00-03:00");

        var response = await client.SendAsync(request, Ct);

        Assert.InRange((int)response.StatusCode, 400, 499);
        // key é um Guid gerado aqui: pode ir no texto da consulta.
        await using var cmd = api.Db.DataSource!.CreateCommand(
            $"SELECT CONCAT(event, '|', user_id, '|', business_id, '|', meta) FROM mobile_audit_events WHERE JSON_UNQUOTE(JSON_EXTRACT(meta, '$.key')) = '{key}'");
        var row = (string?)await cmd.ExecuteScalarAsync(Ct);
        Assert.StartsWith("sync.rejected|1|10|", row, StringComparison.Ordinal);
        Assert.Contains("2026-10-15T08:30:00.0000000-03:00", row!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Qr_antigo_desligado_nem_chama_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Calls.Clear();
        await using var factory = new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:ComercialWeb", api.Db.ConnectionString);
            b.UseSetting("Auth:LegacyPairing", "false");
            b.ConfigureTestServices(s => s.AddSingleton<IComercialWebAuth>(api.ComercialWeb));
        });

        var response = await factory.CreateClient().PostAsJsonAsync("/api/v1/auth/pair", new { code = Code }, Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(api.ComercialWeb.Calls);
    }

    private async Task<(HttpClient Client, LoginDto Login)> LoginAsync()
    {
        var client = api.Anonymous();
        var response = await client.PostAsJsonAsync("/api/v1/auth/terminal-login",
            new { terminalId = TerminalId, terminalSecret = Secret, method = "pin", userId = 1, pin = "482913" }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var login = (await response.Content.ReadFromJsonAsync<LoginDto>(Ct))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        return (client, login);
    }
}
