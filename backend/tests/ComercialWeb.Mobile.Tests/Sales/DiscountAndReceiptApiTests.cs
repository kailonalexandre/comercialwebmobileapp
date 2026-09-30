using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using ComercialWeb.Mobile.Identity.Infrastructure;
using ComercialWeb.Mobile.Sales.Receipts;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Sales;

public sealed class ReceiptFixture : ApiFixture
{
    public FakeComercialWeb ComercialWeb { get; } = new();

    // ana: pdv.access (basta para o comprovante); bruno: membro sem nenhuma permissão de venda.
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
        builder.UseSetting("ComercialWeb:MobileApiSecret", PdvFixture.Secret);
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<ReceiptClient>().ConfigurePrimaryHttpMessageHandler(() => ComercialWeb));
    }
}

public sealed class ReceiptApiTests(ReceiptFixture api) : IClassFixture<ReceiptFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private void Reply(HttpStatusCode status, string json) => api.ComercialWeb.Reply = () => FakeComercialWeb.Json(status, json);

    private async Task<HttpResponseMessage> Post(string login, string path, object? body = null)
    {
        api.ComercialWeb.Received.Clear();
        var client = await api.SignedInAsync(login);
        return await client.PostAsJsonAsync(path, body ?? new { }, Ct);
    }

    [Fact]
    public async Task Whatsapp_vai_assinado_com_usuario_e_empresa_da_sessao_e_responde_202()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.Accepted, """{"success":true,"message":"fila"}""");

        var response = await Post("ana", "/api/v1/sales/77/receipt/whatsapp", new { phone = " (11) 91234-5678 ", userId = 999, businessId = 999 });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var (request, body) = Assert.Single(api.ComercialWeb.Received);
        Assert.Equal("https://comercialweb.test/api/mobile/v1/sales/77/receipt/whatsapp", request.RequestUri!.ToString());
        using var json = JsonDocument.Parse(body);
        Assert.Equal((1, 10, "(11) 91234-5678"), (json.RootElement.GetProperty("user_id").GetInt64(), json.RootElement.GetProperty("business_id").GetInt64(), json.RootElement.GetProperty("phone").GetString()));
        var timestamp = request.Headers.GetValues("X-Mobile-Timestamp").Single();
        Assert.Equal(MobileSignature.Sign(PdvFixture.Secret, timestamp, "POST", "/api/mobile/v1/sales/77/receipt/whatsapp", body), request.Headers.GetValues("X-Mobile-Signature").Single());
    }

    [Fact]
    public async Task Sem_telefone_o_campo_nao_e_enviado_e_lixo_e_422_sem_chamar_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.Accepted, """{"success":true}""");

        Assert.Equal(HttpStatusCode.Accepted, (await Post("ana", "/api/v1/sales/77/receipt/whatsapp")).StatusCode);
        using (var json = JsonDocument.Parse(Assert.Single(api.ComercialWeb.Received).Body))
            Assert.False(json.RootElement.TryGetProperty("phone", out _));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post("ana", "/api/v1/sales/77/receipt/whatsapp", new { phone = "<script>" })).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Theory]
    [InlineData("connection_missing")]
    [InlineData("customer_phone_missing")]
    public async Task Motivo_da_recusa_do_comercialweb_chega_ao_app(string reason)
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.UnprocessableEntity, $"{{\"success\":false,\"reason\":\"{reason}\",\"error\":{{\"code\":\"business_rule\",\"message\":\"Sem WhatsApp.\"}}}}");

        var response = await Post("ana", "/api/v1/sales/77/receipt/whatsapp");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal((reason, "business_rule", "Sem WhatsApp."), (body.GetProperty("reason").GetString(), body.GetProperty("code").GetString(), body.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task Telefone_invalido_no_laravel_e_validation_sem_vazar_mensagem_interna()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.UnprocessableEntity, """{"message":"The phone is invalid.","errors":{"phone":["x"]}}""");

        var body = await (await Post("ana", "/api/v1/sales/77/receipt/whatsapp", new { phone = "11 91234-5678" })).Content.ReadFromJsonAsync<JsonElement>(Ct);

        Assert.Equal("validation", body.GetProperty("code").GetString());
        Assert.False(body.TryGetProperty("message", out _));
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden, HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.NotFound, HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError, HttpStatusCode.ServiceUnavailable)]
    public async Task Status_do_comercialweb_e_repassado_ou_vira_503(HttpStatusCode cw, HttpStatusCode app)
    {
        TestDatabase.RequireMySql();
        Reply(cw, """{"success":false,"error":{"code":"x"}}""");

        Assert.Equal(app, (await Post("ana", "/api/v1/sales/77/receipt/whatsapp")).StatusCode);
    }

    [Fact]
    public async Task Sem_permissao_de_venda_e_403_sem_chamar_o_comercialweb()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.Accepted, """{"success":true}""");

        Assert.Equal(HttpStatusCode.Forbidden, (await Post("bruno", "/api/v1/sales/77/receipt/whatsapp")).StatusCode);
        Assert.Empty(api.ComercialWeb.Received);
    }

    [Fact]
    public async Task Pdf_e_repassado_com_nome_seguro()
    {
        TestDatabase.RequireMySql();
        byte[] pdf = [.. "%PDF-1.7 teste"u8];
        api.ComercialWeb.Reply = () =>
        {
            var r = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(pdf) };
            r.Content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            r.Content.Headers.ContentDisposition = new ContentDispositionHeaderValue("attachment") { FileName = "\"../comprovante-V000077.pdf\"" };
            return r;
        };

        var response = await Post("ana", "/api/v1/sales/77/receipt/pdf");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(pdf, await response.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal("comprovante-V000077.pdf", response.Content.Headers.ContentDisposition!.FileNameStar ?? response.Content.Headers.ContentDisposition.FileName!.Trim('"'));
    }

    [Fact]
    public async Task Resposta_200_que_nao_e_pdf_vira_503()
    {
        TestDatabase.RequireMySql();
        Reply(HttpStatusCode.OK, "<html>portal</html>");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Post("ana", "/api/v1/sales/77/receipt/pdf")).StatusCode);
    }

    [Theory]
    [InlineData("\"comprovante-V1.pdf\"", "comprovante-V1.pdf")]
    [InlineData("../../etc/passwd", "comprovante-5.pdf")]
    [InlineData(null, "comprovante-5.pdf")]
    [InlineData("a b.pdf", "ab.pdf")]
    public void Nome_do_arquivo_so_aceita_caracteres_seguros(string? raw, string expected) =>
        Assert.Equal(expected, ReceiptClient.SafeFileName(raw, 5));
}
