using System.Net;
using System.Text;
using System.Text.Json;
using ComercialWeb.Mobile.Sales.PreSales;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Sales;

/// <summary>ComercialWeb falso: registra o que recebeu e devolve a resposta programada.</summary>
public sealed class FakeComercialWeb : HttpMessageHandler
{
    public List<(HttpRequestMessage Request, byte[] Body)> Received { get; } = [];
    public Func<HttpResponseMessage> Reply { get; set; } = () => Json(HttpStatusCode.Created, """{"success":true,"sale_id":55,"number":"PV000055","status":"pre_venda","total_cents":3000,"client_sale_uuid":"x","already_existed":false}""");

    public static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Received.Add((request, await request.Content!.ReadAsByteArrayAsync(cancellationToken)));
        return Reply();
    }
}

public sealed class PreSaleFixture : ApiFixture
{
    public const string Secret = "segredo-compartilhado-de-teste";
    public FakeComercialWeb ComercialWeb { get; } = new();

    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'sales.create', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ComercialWeb:BaseUrl", "https://comercialweb.test");
        builder.UseSetting("ComercialWeb:MobileApiSecret", Secret);
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<ComercialWebClient>().ConfigurePrimaryHttpMessageHandler(() => ComercialWeb));
    }
}

public sealed class PreSaleApiTests(PreSaleFixture api) : IClassFixture<PreSaleFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly object ValidBody = new { customerId = 7, observation = " Entregar cedo ", items = new[] { new { productId = 100, quantity = 2.5m } } };

    private async Task<HttpResponseMessage> Post(string login, object body, string? key = null)
    {
        var client = await api.SignedInAsync(login);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/pre-sales") { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Encaminha_assinado_com_usuario_e_empresa_da_sessao_ignorando_o_que_o_app_manda()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        var key = Guid.NewGuid().ToString();
        // App tenta forjar outro usuário/empresa: campos desconhecidos no contrato, ignorados.
        var forged = new { userId = 999, businessId = 999, customerId = 7, observation = " Entregar cedo ", items = new[] { new { productId = 100, quantity = 2.5m } } };

        var response = await Post("ana", forged, key);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/pre-sales", request.RequestUri!.ToString());

        using var json = JsonDocument.Parse(body);
        Assert.Equal(1, json.RootElement.GetProperty("user_id").GetInt64());
        Assert.Equal(10, json.RootElement.GetProperty("business_id").GetInt64());
        Assert.Equal(key, json.RootElement.GetProperty("client_sale_uuid").GetString());
        Assert.Equal("Entregar cedo", json.RootElement.GetProperty("observation").GetString());
        Assert.Equal(2.5m, json.RootElement.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        Assert.False(json.RootElement.TryGetProperty("seller_person_id", out _)); // nulo não é enviado

        // Mesma fórmula que o middleware PHP confere.
        var timestamp = request.Headers.GetValues("X-Mobile-Timestamp").Single();
        Assert.Equal(ComercialWebClient.Sign(PreSaleFixture.Secret, timestamp, "POST", ComercialWebClient.PreSalesPath, body),
            request.Headers.GetValues("X-Mobile-Signature").Single());
        Assert.InRange(long.Parse(timestamp, System.Globalization.CultureInfo.InvariantCulture), DateTimeOffset.UtcNow.ToUnixTimeSeconds() - 60, DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 60);

        var created = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("PV000055", created.GetProperty("number").GetString());
        Assert.Equal(3000, created.GetProperty("totalCents").GetInt64());
    }

    [Fact]
    public async Task Reenvio_ja_existente_responde_200()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, """{"success":true,"sale_id":55,"number":"PV000055","status":"pre_venda","total_cents":3000,"client_sale_uuid":"x","already_existed":true}""");
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await Post("ana", ValidBody)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.Reply = new FakeComercialWeb().Reply;
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("nao-e-uuid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task Sem_idempotency_key_valida_e_422_sem_chamar_o_comercialweb(string? key)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        var client = await api.SignedInAsync("ana");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/pre-sales") { Content = JsonContent.Create(ValidBody) };
        if (key is not null) request.Headers.Add("Idempotency-Key", key);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.SendAsync(request, Ct)).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    public static TheoryData<object> InvalidBodies => new()
    {
        new { items = Array.Empty<object>() },
        new { items = new[] { new { productId = 100, quantity = 0m } } },
        new { items = new[] { new { productId = 100, quantity = 1.2345m } } },
        new { items = new[] { new { productId = 0, quantity = 1m } } },
        new { items = Enumerable.Range(1, 201).Select(i => new { productId = i, quantity = 1m }).ToArray() },
        new { observation = new string('x', 1001), items = new[] { new { productId = 100, quantity = 1m } } },
    };

    [Theory]
    [MemberData(nameof(InvalidBodies))]
    public async Task Pedido_invalido_e_422_sem_chamar_o_comercialweb(object body)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", body)).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Sem_sales_create_e_403_sem_chamar_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        Assert.Equal(HttpStatusCode.Forbidden, (await Post("bruno", ValidBody)).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Theory]
    [InlineData(HttpStatusCode.UnprocessableEntity, """{"success":false,"error":{"code":"business_rule","message":"Cliente bloqueado."}}""", HttpStatusCode.UnprocessableEntity, "Cliente bloqueado.")]
    [InlineData(HttpStatusCode.UnprocessableEntity, """{"message":"The items field is required."}""", HttpStatusCode.UnprocessableEntity, null)]
    [InlineData(HttpStatusCode.Forbidden, """{"success":false,"error":{"code":"forbidden"}}""", HttpStatusCode.Forbidden, null)]
    [InlineData(HttpStatusCode.Unauthorized, """{"success":false}""", HttpStatusCode.ServiceUnavailable, null)]
    [InlineData(HttpStatusCode.InternalServerError, "<html>erro</html>", HttpStatusCode.ServiceUnavailable, null)]
    public async Task Respostas_do_comercialweb_sao_traduzidas(HttpStatusCode upstream, string json, HttpStatusCode expected, string? message)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(upstream, json);
        try
        {
            var response = await Post("ana", ValidBody);
            Assert.Equal(expected, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
            Assert.Equal(message, problem.TryGetProperty("message", out var m) ? m.GetString() : null);
            Assert.DoesNotContain("<html", await response.Content.ReadAsStringAsync(Ct), StringComparison.OrdinalIgnoreCase); // página de erro do upstream nunca vaza
        }
        finally
        {
            api.ComercialWeb.Reply = new FakeComercialWeb().Reply;
        }
    }

    [Fact]
    public async Task ComercialWeb_fora_do_ar_e_503_para_o_app_reenviar_com_a_mesma_chave()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => throw new HttpRequestException("connection refused");
        try
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Post("ana", ValidBody)).StatusCode);
        }
        finally
        {
            api.ComercialWeb.Reply = new FakeComercialWeb().Reply;
        }
    }
}
