using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Tests.Identity;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Catalog;

public sealed class OrdersFixture : ApiFixture
{
    public FakeComercialWebAuth ComercialWeb { get; } = new();

    // ana (sessão do pareamento falso) tem só loja-virtual.access; marketplaces.view (id 2) é concedida e retirada nos testes.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'loja-virtual.access', 'web'), (2, 'marketplaces.view', 'web');
        INSERT INTO roles (id, business_id, name, guard_name) VALUES (1, 10, 'Lojista', 'web');
        INSERT INTO role_has_permissions (permission_id, role_id) VALUES (1, 1);
        INSERT INTO model_has_roles (role_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Auth:PasswordLogin", "false");
        builder.ConfigureTestServices(services => services.AddSingleton<IComercialWebAuth>(ComercialWeb));
    }
}

public sealed class OrdersApiTests(OrdersFixture api) : IClassFixture<OrdersFixture>
{
    private const string Code = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567";
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record SessionDto(string AccessToken);

    private async Task<HttpClient> PairedAsync()
    {
        var client = api.Anonymous();
        var session = (await (await client.PostAsJsonAsync("/api/v1/auth/pair", new { code = Code }, Ct)).Content.ReadFromJsonAsync<SessionDto>(Ct))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return client;
    }

    [Fact]
    public async Task Lista_repassa_secoes_e_filtros_com_uma_das_duas_permissoes()
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        api.ComercialWeb.Calls.Clear();

        var response = await client.GetAsync("/api/v1/orders?source=store&status=paid&search=maria&page=2&pageSize=10", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var section = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("sections")[0];
        Assert.Equal("store", section.GetProperty("channel").GetString());
        Assert.Equal(15_990, section.GetProperty("items")[0].GetProperty("totalCents").GetInt64());
        Assert.Equal(2, section.GetProperty("meta").GetProperty("page").GetInt32());
        Assert.Contains("orders:store:paid:maria:2:10", api.ComercialWeb.Calls);
    }

    [Theory]
    [InlineData("?source=mercadolivre")]
    [InlineData("?source=all")]
    [InlineData("")]
    public async Task Canal_sem_a_permissao_dele_e_403_sem_consultar_o_comercialweb(string query)
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync(); // ana só tem loja-virtual.access
        api.ComercialWeb.Calls.Clear();

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/orders{query}", Ct)).StatusCode);
        Assert.DoesNotContain(api.ComercialWeb.Calls, c => c.StartsWith("orders:", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("?source=shopee")]
    [InlineData("?pageSize=51")]
    [InlineData("?page=0")]
    public async Task Parametro_invalido_e_422_sem_consultar_o_comercialweb(string query)
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        api.ComercialWeb.Calls.Clear();

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.GetAsync($"/api/v1/orders{query}", Ct)).StatusCode);
        Assert.DoesNotContain(api.ComercialWeb.Calls, c => c.StartsWith("orders:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Detalhe_de_marketplace_exige_marketplaces_view_e_mapeia_404()
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        var original = api.ComercialWeb.MarketplaceOrder;
        try
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/orders/marketplace/9", Ct)).StatusCode);

            await api.Db.ExecuteAsync("INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (2, 'App\\\\Models\\\\User', 1, 10)");
            var ok = await client.GetAsync("/api/v1/orders/marketplace/9", Ct);
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
            Assert.Equal("2000001", (await ok.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("externalOrderId").GetString());

            api.ComercialWeb.MarketplaceOrder = (_, _) => new(CwStatus.Rejected);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/orders/marketplace/9", Ct)).StatusCode);
            api.ComercialWeb.MarketplaceOrder = (_, _) => new(CwStatus.Unavailable);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/v1/orders/marketplace/9", Ct)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.MarketplaceOrder = original;
            await api.Db.ExecuteAsync("DELETE FROM model_has_permissions WHERE permission_id = 2 AND model_id = 1");
        }
    }

    [Fact]
    public async Task Sem_token_e_401()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync("/api/v1/orders", Ct)).StatusCode);
    }
}
