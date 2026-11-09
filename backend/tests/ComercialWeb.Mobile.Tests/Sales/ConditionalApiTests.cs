using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Sales.PreSales;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Sales;

public sealed class ConditionalFixture : ApiFixture
{
    public const string Secret = "segredo-compartilhado-de-teste";
    public FakeComercialWeb ComercialWeb { get; } = new();

    // ana: sales.access. bruno: só sales.create (sem acesso ao condicional).
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'sales.access', 'web'), (2, 'sales.create', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10), (2, 'App\\Models\\User', 2, 10);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ComercialWeb:BaseUrl", "https://comercialweb.test");
        builder.UseSetting("ComercialWeb:MobileApiSecret", Secret);
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<ComercialWebClient>().ConfigurePrimaryHttpMessageHandler(() => ComercialWeb));
    }
}

public sealed class ConditionalApiTests(ConditionalFixture api) : IClassFixture<ConditionalFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string Created = """{"success":true,"conditional_id":31,"number":"C000031","status":"aberto","total_cents":3000,"client_uuid":"x","price_mode":"varejo","already_existed":false}""";

    private static readonly object ValidBody = new { customerId = 7, observation = " Levar na quinta ", items = new[] { new { productId = 100, quantity = 2m } } };

    private async Task<HttpResponseMessage> Post(string login, object body, string? key = null)
    {
        var client = await api.SignedInAsync(login);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/conditionals") { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Encaminha_assinado_com_usuario_e_empresa_da_sessao_e_a_chave_vira_client_uuid()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.Created, Created);
        var key = Guid.NewGuid().ToString();
        var forged = new { userId = 999, businessId = 999, customerId = 7, observation = " Levar na quinta ", items = new[] { new { productId = 100, quantity = 2m } } };

        var response = await Post("ana", forged, key);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/conditionals", request.RequestUri!.ToString());
        using var json = JsonDocument.Parse(body);
        Assert.Equal(1, json.RootElement.GetProperty("user_id").GetInt64());
        Assert.Equal(10, json.RootElement.GetProperty("business_id").GetInt64());
        Assert.Equal(key, json.RootElement.GetProperty("client_uuid").GetString());
        Assert.Equal(7, json.RootElement.GetProperty("customer_id").GetInt64());
        Assert.Equal("Levar na quinta", json.RootElement.GetProperty("observation").GetString());
        var timestamp = request.Headers.GetValues("X-Mobile-Timestamp").Single();
        Assert.Equal(ComercialWeb.Mobile.Identity.Infrastructure.MobileSignature.Sign(ConditionalFixture.Secret, timestamp, "POST", ComercialWebClient.ConditionalsPath, body),
            request.Headers.GetValues("X-Mobile-Signature").Single());

        var created = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("C000031", created.GetProperty("number").GetString());
        Assert.Equal(31, created.GetProperty("conditionalId").GetInt64());
    }

    [Fact]
    public async Task Reenvio_ja_existente_responde_200()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, Created.Replace("false", "true", StringComparison.Ordinal));
        Assert.Equal(HttpStatusCode.OK, (await Post("ana", ValidBody)).StatusCode);
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
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/conditionals") { Content = JsonContent.Create(ValidBody) };
        if (key is not null) request.Headers.Add("Idempotency-Key", key);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.SendAsync(request, Ct)).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Cliente_e_obrigatorio_e_itens_invalidos_sao_recusados_sem_chamar_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        var items = new[] { new { productId = 100, quantity = 1m } };
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { items })).StatusCode); // sem cliente
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { customerId = 7, items = Array.Empty<object>() })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { customerId = 7, items = new[] { new { productId = 100, quantity = 0m } } })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", new { customerId = 7, priceTable = "x; y", items })).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Sem_a_permissao_e_403_e_regra_de_negocio_leva_a_mensagem_do_comercialweb()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();
        Assert.Equal(HttpStatusCode.Forbidden, (await Post("bruno", ValidBody)).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);

        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.UnprocessableEntity, """{"success":false,"error":{"code":"business_rule","message":"Selecione um vendedor ativo antes de salvar o condicional."}}""");
        var response = await Post("ana", ValidBody);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("Selecione um vendedor ativo antes de salvar o condicional.", problem.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ComercialWeb_fora_do_ar_e_503()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => throw new HttpRequestException("connection refused");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Post("ana", ValidBody)).StatusCode);
    }
}
