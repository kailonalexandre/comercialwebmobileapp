using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Sales.Pdv;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Sales;

public sealed class PdvFixture : ApiFixture
{
    public const string Secret = "segredo-compartilhado-de-teste";
    public FakeComercialWeb ComercialWeb { get; } = new();

    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'pdv.access', 'web');
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

public sealed class PdvApiTests(PdvFixture api) : IClassFixture<PdvFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string SaleReply = """{"success":true,"sale_id":77,"number":"V000077","status":"finalizada","total_cents":3000,"change_cents":500,"client_sale_uuid":"x","already_existed":false}""";

    private static readonly object Sale = new
    {
        customerId = 7,
        observation = " Balcão ",
        items = new[] { new { productId = 100, quantity = 2 } },
        payments = new[] { new { method = "cash", amountCents = 3500L } },
    };

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
    public async Task Cotacao_e_venda_levam_a_tabela_de_preco_como_price_mode()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.OK, """{"subtotal_cents":3000,"discount_cents":0,"total_cents":3000,"items":[]}""");
        await Send("ana", HttpMethod.Post, "/api/v1/pdv/quote", new { priceTable = "atacado", items = new[] { new { productId = 100, quantity = 1 } } });
        using var json = JsonDocument.Parse(Assert.Single(api.ComercialWeb.Received).Body);
        Assert.Equal("atacado", json.RootElement.GetProperty("price_mode").GetString());
        var invalid = await Send("ana", HttpMethod.Post, "/api/v1/pdv/quote", new { priceTable = "x y", items = new[] { new { productId = 100, quantity = 1 } } });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
    }

    [Fact]
    public async Task Venda_e_encaminhada_assinada_com_usuario_empresa_e_chave_da_sessao_sem_preco()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.Created, SaleReply);
        var key = Guid.NewGuid().ToString();
        // O app tenta forjar usuário, empresa e preço: campos fora do contrato, ignorados.
        var forged = new { userId = 999, businessId = 999, totalCents = 1, customerId = 7, items = new[] { new { productId = 100, quantity = 2, unitPriceCents = 1 } }, payments = new[] { new { method = "cash", amountCents = 3500L } } };

        var response = await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", forged, key);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/pdv/sales", request.RequestUri!.ToString());
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        Assert.Equal(1, root.GetProperty("user_id").GetInt64());
        Assert.Equal(10, root.GetProperty("business_id").GetInt64());
        Assert.Equal(key, root.GetProperty("client_sale_uuid").GetString());
        Assert.Equal(2, root.GetProperty("items")[0].GetProperty("quantity").GetInt32());
        Assert.False(root.GetProperty("items")[0].TryGetProperty("unit_price_cents", out _));
        Assert.False(root.TryGetProperty("total_cents", out _));
        Assert.Equal("cash", root.GetProperty("payments")[0].GetProperty("method").GetString());
        Assert.Equal(3500, root.GetProperty("payments")[0].GetProperty("amount_cents").GetInt64());

        var timestamp = request.Headers.GetValues("X-Mobile-Timestamp").Single();
        Assert.Equal(ComercialWeb.Mobile.Identity.Infrastructure.MobileSignature.Sign(PdvFixture.Secret, timestamp, "POST", PdvClient.SalesPath, body),
            request.Headers.GetValues("X-Mobile-Signature").Single());

        var created = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("V000077", created.GetProperty("number").GetString());
        Assert.Equal(500, created.GetProperty("changeCents").GetInt64());
    }

    [Fact]
    public async Task Reenvio_ja_existente_responde_200()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.OK, SaleReply.Replace("\"already_existed\":false", "\"already_existed\":true", StringComparison.Ordinal));

        Assert.Equal(HttpStatusCode.OK, (await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", Sale, Guid.NewGuid().ToString())).StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("nao-e-uuid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task Sem_chave_valida_e_422_sem_chamar_o_comercialweb(string? key)
    {
        TestDatabase.RequireMySql();

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", Sale, key)).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    public static TheoryData<object> InvalidSales => new()
    {
        new { items = Array.Empty<object>(), payments = new[] { new { method = "cash", amountCents = 100L } } },
        new { items = new[] { new { productId = 100, quantity = 0 } }, payments = new[] { new { method = "cash", amountCents = 100L } } },
        new { items = new[] { new { productId = 100, quantity = 1 } }, payments = Array.Empty<object>() },
        new { items = new[] { new { productId = 100, quantity = 1 } }, payments = new[] { new { method = "", amountCents = 100L } } },
        new { items = new[] { new { productId = 100, quantity = 1 } }, payments = new[] { new { method = "cash", amountCents = 0L } } },
    };

    [Theory]
    [MemberData(nameof(InvalidSales))]
    public async Task Corpo_invalido_e_422_sem_chamar_o_comercialweb(object body)
    {
        TestDatabase.RequireMySql();

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", body, Guid.NewGuid().ToString())).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Sem_permissao_pdv_e_403_sem_chamar_o_comercialweb()
    {
        TestDatabase.RequireMySql();

        Assert.Equal(HttpStatusCode.Forbidden, (await Send("bruno", HttpMethod.Post, "/api/v1/pdv/sales", Sale, Guid.NewGuid().ToString())).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Caixa_fechado_e_pagamento_incompleto_chegam_ao_app_com_codigo_e_totais()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.UnprocessableEntity, """{"success":false,"error":{"code":"cash_register_closed","message":"Abra um caixa no ComercialWeb."}}""");
        var closed = await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", Sale, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, closed.StatusCode);
        var closedBody = await closed.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("cash_register_closed", closedBody.GetProperty("code").GetString());
        Assert.Equal("Abra um caixa no ComercialWeb.", closedBody.GetProperty("message").GetString());

        Reply(HttpStatusCode.UnprocessableEntity, """{"success":false,"error":{"code":"payment_incomplete","message":"Não completa.","total_cents":3000,"remaining_cents":2000}}""");
        var incomplete = await (await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", Sale, Guid.NewGuid().ToString())).Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(3000, incomplete.GetProperty("totalCents").GetInt64());
        Assert.Equal(2000, incomplete.GetProperty("remainingCents").GetInt64());
    }

    [Fact]
    public async Task Erro_estrutural_do_comercialweb_nao_vaza_mensagem_e_fora_do_ar_e_503()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.UnprocessableEntity, """{"message":"The items.0.quantity field must be...","errors":{}}""");
        var invalid = await (await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", Sale, Guid.NewGuid().ToString())).Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.False(invalid.TryGetProperty("message", out _));

        api.ComercialWeb.Reply = () => throw new HttpRequestException("connection refused");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Send("ana", HttpMethod.Post, "/api/v1/pdv/sales", Sale, Guid.NewGuid().ToString())).StatusCode);
    }

    [Fact]
    public async Task Cotacao_devolve_o_total_do_servidor_e_formas_de_pagamento_vem_do_comercialweb()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.OK, """{"success":true,"subtotal_cents":3000,"discount_cents":0,"total_cents":3000,"items":[{"product_id":100,"name":"Camiseta","quantity":2,"unit_price_cents":1500,"total_cents":3000}]}""");
        var quote = await (await Send("ana", HttpMethod.Post, "/api/v1/pdv/quote", new { items = new[] { new { productId = 100, quantity = 2 } } })).Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(3000, quote.GetProperty("totalCents").GetInt64());
        Assert.Equal(1500, quote.GetProperty("items")[0].GetProperty("unitPriceCents").GetInt64());

        Reply(HttpStatusCode.OK, """{"success":true,"methods":[{"code":"cash","name":"Dinheiro"},{"code":"pix_transfer","name":"Pix"}]}""");
        var methods = await (await Send("ana", HttpMethod.Get, "/api/v1/pdv/payment-methods")).Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("Pix", methods.GetProperty("methods")[1].GetProperty("name").GetString());
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.EndsWith(PdvClient.PaymentMethodsPath, request.RequestUri!.AbsolutePath, StringComparison.Ordinal);
        using var json = JsonDocument.Parse(body);
        Assert.Equal(1, json.RootElement.GetProperty("user_id").GetInt64());
    }
}

public sealed class SaleOriginApiTests(PdvFixture api) : IClassFixture<PdvFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Venda_do_pdv_criada_pelo_app_fica_marcada_para_nao_avisar_o_proprio_celular()
    {
        TestDatabase.RequireMySql();
        await api.Db.ExecuteAsync("DELETE FROM mobile_sale_origins");
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.Created, """{"success":true,"sale_id":77,"number":"V000077","status":"finalizada","total_cents":3000,"change_cents":0,"client_sale_uuid":"x","already_existed":false}""");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/pdv/sales") { Content = JsonContent.Create(new { items = new[] { new { productId = 100, quantity = 1 } }, payments = new[] { new { method = "cash", amountCents = 3000L } } }) };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());

        Assert.Equal(HttpStatusCode.Created, (await (await api.SignedInAsync("ana")).SendAsync(request, Ct)).StatusCode);

        Assert.Equal(1, await api.Db.DataSource!.CreateCommand("SELECT COUNT(*) FROM mobile_sale_origins WHERE business_id = 10 AND sale_id = 77").ExecuteScalarAsync(Ct) is long n ? n : 0);
    }
}

public sealed class PdvDiscountApiTests(PdvFixture api) : IClassFixture<PdvFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpResponseMessage> Quote(object body)
    {
        api.ComercialWeb.Received.Clear();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.OK, """{"success":true,"subtotal_cents":5000,"discount_cents":700,"total_cents":4300,"items":[{"product_id":100,"name":"Camiseta","quantity":2,"unit_price_cents":2500,"total_cents":4500,"discount_cents":500}]}""");
        return await (await api.SignedInAsync("ana")).PostAsJsonAsync("/api/v1/pdv/quote", body, Ct);
    }

    [Fact]
    public async Task Desconto_por_item_e_na_venda_vai_ao_comercialweb_e_o_total_devolvido_e_o_dele()
    {
        TestDatabase.RequireMySql();

        var response = await Quote(new { items = new object[] { new { productId = 100, quantity = 2, discountPercent = 10.5m }, new { productId = 101, quantity = 1, discountCents = 300L } }, saleDiscountCents = 200L });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var sent = JsonDocument.Parse(Assert.Single(api.ComercialWeb.Received).Body);
        var items = sent.RootElement.GetProperty("items");
        Assert.Equal(10.5m, items[0].GetProperty("discount_percent").GetDecimal());
        Assert.False(items[0].TryGetProperty("discount_cents", out _));
        Assert.Equal(300, items[1].GetProperty("discount_cents").GetInt64());
        Assert.Equal(200, sent.RootElement.GetProperty("sale_discount_cents").GetInt64());
        Assert.False(sent.RootElement.TryGetProperty("sale_discount_percent", out _));
        var quote = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal((4300, 700, 500), (quote.GetProperty("totalCents").GetInt64(), quote.GetProperty("discountCents").GetInt64(), quote.GetProperty("items")[0].GetProperty("discountCents").GetInt64()));
    }

    [Theory]
    [InlineData("""{"items":[{"productId":100,"quantity":1,"discountPercent":10,"discountCents":100}]}""")]
    [InlineData("""{"items":[{"productId":100,"quantity":1}],"saleDiscountPercent":5,"saleDiscountCents":100}""")]
    [InlineData("""{"items":[{"productId":100,"quantity":1,"discountPercent":100}]}""")]
    [InlineData("""{"items":[{"productId":100,"quantity":1,"discountPercent":1.234}]}""")]
    [InlineData("""{"items":[{"productId":100,"quantity":1,"discountCents":-1}]}""")]
    [InlineData("""{"items":[{"productId":100,"quantity":1}],"saleDiscountPercent":-5}""")]
    public async Task Desconto_malformado_e_422_sem_chamar_o_comercialweb(string json)
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Received.Clear();

        var response = await (await api.SignedInAsync("ana")).PostAsync("/api/v1/pdv/quote", new StringContent(json, System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Limite_de_desconto_do_cliente_chega_ao_app_com_codigo_e_mensagem()
    {
        TestDatabase.RequireMySql();
        api.ComercialWeb.Reply = () => FakeComercialWeb.Json(HttpStatusCode.UnprocessableEntity, """{"success":false,"error":{"code":"discount_limit_exceeded","message":"Desconto acima do limite do cliente (5%)."}}""");

        var response = await (await api.SignedInAsync("ana")).PostAsJsonAsync("/api/v1/pdv/quote", new { customerId = 7, items = new[] { new { productId = 100, quantity = 1, discountPercent = 30 } } }, Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(("discount_limit_exceeded", "Desconto acima do limite do cliente (5%)."), (body.GetProperty("code").GetString(), body.GetProperty("message").GetString()));
    }
}
