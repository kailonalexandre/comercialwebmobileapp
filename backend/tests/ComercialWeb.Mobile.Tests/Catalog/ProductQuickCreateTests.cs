using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Customers;
using ComercialWeb.Mobile.Tests.Sales;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Catalog;

public sealed class ProductQuickFixture : ApiFixture
{
    public const string Secret = "segredo-compartilhado-de-teste";
    public FakeComercialWeb ComercialWeb { get; } = new();

    // ana (1) pode cadastrar; bruno (2) não.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'products.create', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ComercialWeb:BaseUrl", "https://comercialweb.test");
        builder.UseSetting("ComercialWeb:MobileApiSecret", Secret);
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<CustomerWebClient>().ConfigurePrimaryHttpMessageHandler(() => ComercialWeb));
    }
}

public sealed class ProductQuickCreateTests(ProductQuickFixture api) : IClassFixture<ProductQuickFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly object Valid = new { name = " Camiseta Azul ", salePriceCents = 1990 };

    private async Task<HttpResponseMessage> Post(string login, object body, string? key = null)
    {
        var client = await api.SignedInAsync(login);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products") { Content = JsonContent.Create(body) };
        if (key != "none") request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Encaminha_assinado_com_usuario_empresa_e_chave_da_sessao()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.Created, """{"data":{"id":5,"created":true}}""");
        var key = Guid.NewGuid().ToString();

        var response = await Post("ana", new { name = " Camiseta Azul ", salePriceCents = 1990, costPriceCents = 500, barcode = "7891234567895" }, key);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/products/quick", request.RequestUri!.ToString());
        using var json = JsonDocument.Parse(body);
        Assert.Equal(1, json.RootElement.GetProperty("user_id").GetInt64());
        Assert.Equal(10, json.RootElement.GetProperty("business_id").GetInt64());
        Assert.Equal(key, json.RootElement.GetProperty("client_uuid").GetString());
        Assert.Equal("Camiseta Azul", json.RootElement.GetProperty("name").GetString());
        Assert.Equal(1990, json.RootElement.GetProperty("sale_price_cents").GetInt64());
        var timestamp = request.Headers.GetValues("X-Mobile-Timestamp").Single();
        Assert.Equal(ComercialWeb.Mobile.Identity.Infrastructure.MobileSignature.Sign(ProductQuickFixture.Secret, timestamp, "POST", "/api/mobile/v1/products/quick", body),
            request.Headers.GetValues("X-Mobile-Signature").Single());
    }

    [Fact]
    public async Task Exige_permissao_chave_e_corpo_valido()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().PostAsJsonAsync("/api/v1/products", Valid, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post("bruno", Valid)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", Valid, "none")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", Valid, "nao-e-guid")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { name = "", salePriceCents = 100 })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { name = "Sem preço" })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { name = "Negativo", salePriceCents = -1 })).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Repassa_422_do_comercialweb_e_vira_503_quando_ele_cai()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.UnprocessableEntity, """{"errors":{"barcode":["já em uso"]}}""");
        var invalid = await Post("ana", Valid);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        Assert.Contains("já em uso", await invalid.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);

        api.ComercialWeb.Reply = () => new HttpResponseMessage(HttpStatusCode.InternalServerError);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Post("ana", Valid)).StatusCode);
    }
}
