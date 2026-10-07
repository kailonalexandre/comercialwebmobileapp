using System.Net;
using System.Net.Http.Headers;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Tests.Identity;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Catalog;

public sealed class StockFixture : ApiFixture
{
    public FakeComercialWebAuth ComercialWeb { get; } = new();

    // ana: Vendedor com products.view em A; bruno: membro de A sem permissão. Produto 100 é de A, 200 de B.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (20, 1, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'products.view', 'web');
        INSERT INTO roles (id, business_id, name, guard_name) VALUES (1, 10, 'Vendedor', 'web');
        INSERT INTO role_has_permissions (permission_id, role_id) VALUES (1, 1);
        INSERT INTO model_has_roles (role_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 20);
        INSERT INTO products (id, business_id, code, name, sku, barcode, description, cost_price, sale_price, is_active, deleted_at) VALUES
          (100, 10, 1, 'Camiseta Azul', 'CAM-AZ', NULL, NULL, 20.00, 59.90, 1, NULL),
          (200, 20, 1, 'Produto da empresa B', NULL, NULL, NULL, 1.00, 9.99, 1, NULL);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Auth:PasswordLogin", "false");
        builder.ConfigureTestServices(services => services.AddSingleton<IComercialWebAuth>(ComercialWeb));
    }
}

public sealed class StockApiTests(StockFixture api) : IClassFixture<StockFixture>
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
    public async Task Devolve_o_saldo_que_o_comercialweb_calcula_para_o_aparelho()
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        api.ComercialWeb.Calls.Clear();

        var response = await client.GetAsync("/api/v1/products/100/stock", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(Ct);
        Assert.Equal(100, body.GetProperty("productId").GetInt64());
        Assert.Equal(7, body.GetProperty("unitId").GetInt64());
        Assert.Equal(12_500, body.GetProperty("totalMilli").GetInt64());
        Assert.Contains("stock:cw-access-1:100", api.ComercialWeb.Calls);
    }

    [Fact]
    public async Task Depois_de_trocar_de_empresa_o_saldo_do_aparelho_nao_e_servido_para_a_outra()
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        var switched = await client.PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 20 }, Ct);
        Assert.Equal(HttpStatusCode.OK, switched.StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await switched.Content.ReadFromJsonAsync<SessionDto>(Ct))!.AccessToken);
        api.ComercialWeb.Calls.Clear();

        // O token do aparelho é da empresa A: servir o saldo dele para a B misturaria dados das duas.
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync("/api/v1/products/200/stock", Ct)).StatusCode);
        Assert.DoesNotContain(api.ComercialWeb.Calls, c => c.StartsWith("stock:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Produto_de_outra_empresa_e_404_sem_consultar_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        api.ComercialWeb.Calls.Clear();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/products/200/stock", Ct)).StatusCode);
        Assert.DoesNotContain(api.ComercialWeb.Calls, c => c.StartsWith("stock:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Comercialweb_fora_e_503_e_recusa_dele_e_403()
    {
        TestDatabase.RequireMySql();
        var client = await PairedAsync();
        var original = api.ComercialWeb.Stock;
        try
        {
            api.ComercialWeb.Stock = (_, _) => new(CwStatus.Unavailable);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/v1/products/100/stock", Ct)).StatusCode);
            api.ComercialWeb.Stock = (_, _) => new(CwStatus.Rejected);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/products/100/stock", Ct)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.Stock = original;
        }
    }

    [Fact]
    public async Task Sem_token_e_401()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync("/api/v1/products/100/stock", Ct)).StatusCode);
    }
}
