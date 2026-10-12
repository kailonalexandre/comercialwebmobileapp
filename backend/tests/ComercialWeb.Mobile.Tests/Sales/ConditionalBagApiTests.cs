using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Sales.Pdv;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Sales;

public sealed class BagFixture : ApiFixture
{
    public const string Secret = "segredo-compartilhado-de-teste";
    public FakeComercialWeb ComercialWeb { get; } = new();

    // ana: sales.access. bruno: sem permissão.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'sales.access', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        """, new { hash = PasswordHash });

    protected override void ConfigureHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ComercialWeb:BaseUrl", "https://comercialweb.test");
        builder.UseSetting("ComercialWeb:MobileApiSecret", Secret);
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<PdvClient>().ConfigurePrimaryHttpMessageHandler(() => ComercialWeb));
    }
}

public sealed class ConditionalBagApiTests(BagFixture api) : IClassFixture<BagFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string Bag = """{"id":31,"number":"C000031","status":"aberto","customer_id":7,"customer_name":"Maria","total_cents":7500,"created_at":null,"items":[{"id":5,"product_id":100,"description":"Blusa","sku":"B1","unit_price_cents":1500,"quantity":5,"sold":2,"returned":0,"pending":3}]}""";

    private async Task<HttpResponseMessage> Send(string login, HttpMethod method, string path, object? body = null, string? key = null)
    {
        api.ComercialWeb.Received.Clear();
        var client = await api.SignedInAsync(login);
        var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (key is not null) request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request, Ct);
    }

    private void Reply(HttpStatusCode status, string json) => api.ComercialWeb.Reply = () => FakeComercialWeb.Json(status, json);

    [Fact]
    public async Task Lista_a_sacola_aberta_com_usuario_e_empresa_da_sessao()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.OK, $$"""{"success":true,"conditionals":[{{Bag}}]}""");

        var response = await Send("ana", HttpMethod.Get, "/api/v1/conditionals/open");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/conditionals/open", request.RequestUri!.ToString());
        using var sent = JsonDocument.Parse(body);
        Assert.Equal(1, sent.RootElement.GetProperty("user_id").GetInt64());
        Assert.Equal(10, sent.RootElement.GetProperty("business_id").GetInt64());
        var data = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.Equal(3m, data[0].GetProperty("items")[0].GetProperty("pending").GetDecimal());
    }

    [Fact]
    public async Task Baixa_leva_a_chave_como_client_uuid_e_devolve_a_sacola()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.Created, $$"""{"success":true,"conditional":{{Bag}},"already_existed":false}""");
        var key = Guid.NewGuid().ToString();

        var response = await Send("ana", HttpMethod.Post, "/api/v1/conditionals/31/movements", new { itemId = 5, kind = "sold", quantity = 2 }, key);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/conditionals/31/movements", request.RequestUri!.ToString());
        using var sent = JsonDocument.Parse(body);
        Assert.Equal(key, sent.RootElement.GetProperty("client_uuid").GetString());
        Assert.Equal("sold", sent.RootElement.GetProperty("kind").GetString());
        Assert.Equal(5, sent.RootElement.GetProperty("item_id").GetInt64());
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(31, result.GetProperty("conditional").GetProperty("id").GetInt64());
    }

    [Theory]
    [InlineData("sold", 0)]
    [InlineData("gift", 1)]
    [InlineData("returned", 1.0005)]
    public async Task Baixa_invalida_e_recusada_sem_chamar_o_comercialweb(string kind, double quantity)
    {
        TestDatabase.RequireMySql();

        var response = await Send("ana", HttpMethod.Post, "/api/v1/conditionals/31/movements", new { itemId = 5, kind, quantity }, Guid.NewGuid().ToString());

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Baixa_sem_chave_e_recusada()
    {
        TestDatabase.RequireMySql();

        var response = await Send("ana", HttpMethod.Post, "/api/v1/conditionals/31/movements", new { itemId = 5, kind = "sold", quantity = 1 });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Regra_do_condicional_chega_ao_operador_como_422_com_mensagem()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.UnprocessableEntity, """{"success":false,"error":{"code":"business_rule","message":"Ainda há peças com o vendedor."}}""");

        var response = await Send("ana", HttpMethod.Post, "/api/v1/conditionals/31/finalize", new { payments = new[] { new { method = "cash", amountCents = 7500L } } });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("Ainda há peças com o vendedor.", problem.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Finalizar_encaminha_os_pagamentos()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.Created, $$"""{"success":true,"conditional":{{Bag}},"already_existed":false}""");

        var response = await Send("ana", HttpMethod.Post, "/api/v1/conditionals/31/finalize", new { payments = new[] { new { method = "cash", amountCents = 7500L } } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var sent = JsonDocument.Parse(Assert.Single(api.ComercialWeb.Received).Body);
        Assert.Equal(7500, sent.RootElement.GetProperty("payments")[0].GetProperty("amount_cents").GetInt64());
    }

    [Fact]
    public async Task Sem_permissao_de_vendas_nada_e_chamado()
    {
        TestDatabase.RequireMySql();

        var response = await Send("bruno", HttpMethod.Get, "/api/v1/conditionals/open");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }
}
