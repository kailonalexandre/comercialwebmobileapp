using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Catalog;
using ComercialWeb.Mobile.Tests.Sales;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Catalog;

public sealed class PriceFixture : ApiFixture
{
    public const string Secret = "segredo-compartilhado-de-teste";
    public FakeComercialWeb ComercialWeb { get; } = new();

    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'products.view', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        INSERT INTO products (id, business_id, code, name, cost_price, sale_price, is_active) VALUES
          (100, 10, 1, 'Camiseta', 20.00, 59.90, 1), (101, 10, 2, 'Calça', 50.00, 149.00, 1);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ComercialWeb:BaseUrl", "https://comercialweb.test");
        builder.UseSetting("ComercialWeb:MobileApiSecret", Secret);
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<PriceWebClient>().ConfigurePrimaryHttpMessageHandler(() => ComercialWeb));
    }
}

public sealed class PriceTablesApiTests(PriceFixture api) : IClassFixture<PriceFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string Prices = """{"data":{"prices":{"100":{"varejo":5990,"atacado":4500},"101":{"varejo":14900}}}}""";

    private async Task<HttpResponseMessage> Get(string path)
    {
        api.ComercialWeb.Received.Clear();
        return await (await api.SignedInAsync("ana")).GetAsync(path, Ct);
    }

    [Fact]
    public async Task Lista_em_varejo_nao_consulta_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        var response = await Get("/api/v1/products?priceTable=varejo");
        var page = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(14900, page.GetProperty("items")[0].GetProperty("priceCents").GetInt64()); // ordenado por nome: Calça, Camiseta
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Lista_em_outra_tabela_usa_o_preco_do_comercialweb_e_marca_produto_sem_preco()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, Prices);
        var page = await (await Get("/api/v1/products?priceTable=atacado")).Content.ReadFromJsonAsync<JsonElement>(Ct);
        var items = page.GetProperty("items");
        Assert.Equal(JsonValueKind.Null, items[0].GetProperty("priceCents").ValueKind); // Calça não tem atacado: não se inventa preço
        Assert.Equal(14900, items[0].GetProperty("salePriceCents").GetInt64());      // cadastro intacto
        Assert.Equal(4500, items[1].GetProperty("priceCents").GetInt64());          // Camiseta tem atacado
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/products/prices", request.RequestUri!.ToString());
        using var json = JsonDocument.Parse(body);
        Assert.Equal(1, json.RootElement.GetProperty("user_id").GetInt64());
        Assert.Equal(10, json.RootElement.GetProperty("business_id").GetInt64());
        Assert.Equal([101, 100], json.RootElement.GetProperty("product_ids").EnumerateArray().Select(e => e.GetInt64()));
    }

    [Fact]
    public async Task Sem_resposta_do_comercialweb_nao_mostra_preco_errado()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => new HttpResponseMessage(HttpStatusCode.InternalServerError);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Get("/api/v1/products?priceTable=atacado")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Get("/api/v1/products?priceTable=Atacado!")).StatusCode);
    }

    [Fact]
    public async Task Detalhe_traz_preco_de_todas_as_tabelas_e_degrada_para_o_varejo_se_ele_cair()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, Prices);
        var detail = await (await Get("/api/v1/products/100")).Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(4500, detail.GetProperty("prices").GetProperty("atacado").GetInt64());
        Assert.Equal(5990, detail.GetProperty("prices").GetProperty("varejo").GetInt64());

        api.ComercialWeb.Reply = () => new HttpResponseMessage(HttpStatusCode.InternalServerError);
        var degraded = await Get("/api/v1/products/100");
        Assert.Equal(HttpStatusCode.OK, degraded.StatusCode);
        Assert.Equal(5990, (await degraded.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("salePriceCents").GetInt64());
    }

    [Fact]
    public async Task Precos_do_carrinho_e_lista_de_tabelas_passam_pelo_comercialweb()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, Prices);
        var client = await api.SignedInAsync("ana");
        var response = await client.PostAsJsonAsync("/api/v1/products/prices", new { productIds = new List<long> { 100, 101 }, priceTable = "atacado" }, Ct);
        var prices = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("prices");
        Assert.Equal(4500, prices.GetProperty("100").GetInt64());
        Assert.Equal(JsonValueKind.Null, prices.GetProperty("101").ValueKind);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync("/api/v1/products/prices", new { productIds = Array.Empty<long>(), priceTable = "atacado" }, Ct)).StatusCode);

        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, """{"data":{"tables":[{"key":"varejo","label":"Balcão"},{"key":"atacado","label":"Atacado"}]}}""");
        var tables = (await (await client.GetAsync("/api/v1/price-tables", Ct)).Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("tables");
        Assert.Equal("Balcão", tables[0].GetProperty("label").GetString());
    }
}
