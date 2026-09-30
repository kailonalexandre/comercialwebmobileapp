using System.Net;
using System.Net.Http.Headers;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Identity;

public sealed class PairingFixture : ApiFixture
{
    public FakeComercialWebAuth ComercialWeb { get; } = new();

    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active');
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Auth:PasswordLogin", "false"); // esta suíte é só QR
        builder.ConfigureTestServices(services => services.AddSingleton<IComercialWebAuth>(ComercialWeb));
    }
}

public sealed class PairingApiTests(PairingFixture api) : IClassFixture<PairingFixture>
{
    private const string Code = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567";
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record SessionDto(string AccessToken, string RefreshToken);

    [Fact]
    public async Task Pair_devolve_tokens_do_app_e_o_acesso_funciona_sem_senha()
    {
        TestDatabase.RequireMySql();
        var client = api.Anonymous();

        var response = await client.PostAsJsonAsync("/api/v1/auth/pair", new { code = Code, deviceName = "Galaxy" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = (await response.Content.ReadFromJsonAsync<SessionDto>(Ct))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);
        Assert.Equal(Guid.Parse("3f2b8c1e-0000-4000-8000-000000000001"), await api.Db.DataSource!.CreateCommand("SELECT cw_device_id FROM mobile_sessions LIMIT 1").ExecuteScalarAsync(Ct));
    }

    [Theory]
    [InlineData("curto")]
    [InlineData("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456!")]
    [InlineData(null)]
    public async Task Codigo_fora_do_formato_e_recusado_sem_chamar_o_comercialweb(string? code)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Calls.Clear();

        var response = await api.Anonymous().PostAsJsonAsync("/api/v1/auth/pair", new { code }, Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(api.ComercialWeb.Calls);
    }

    [Fact]
    public async Task Codigo_recusado_pelo_comercialweb_e_422_e_comercialweb_fora_e_503()
    {
        TestDatabase.RequireMySql();
        var original = api.ComercialWeb.Pair;
        try
        {
            api.ComercialWeb.Pair = new(CwStatus.Rejected);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await api.Anonymous().PostAsJsonAsync("/api/v1/auth/pair", new { code = Code }, Ct)).StatusCode);
            api.ComercialWeb.Pair = new(CwStatus.Unavailable);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await api.Anonymous().PostAsJsonAsync("/api/v1/auth/pair", new { code = Code }, Ct)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.Pair = original;
        }
    }

    [Fact]
    public async Task Login_por_senha_fica_desligado_por_padrao()
    {
        TestDatabase.RequireMySql();

        var response = await api.Anonymous().PostAsJsonAsync("/api/v1/auth/login", new { login = "ana", password = ApiFixture.Password }, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}

/// <summary>Fixture própria: o limite é por IP e não pode consumir a cota das outras suítes.</summary>
