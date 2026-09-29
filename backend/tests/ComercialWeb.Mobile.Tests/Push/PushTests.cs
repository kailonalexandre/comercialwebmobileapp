using System.Net;
using System.Text;
using System.Text.Json;
using ComercialWeb.Mobile.Push;
using ComercialWeb.Mobile.Tests.Support;
using Dapper;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace ComercialWeb.Mobile.Tests.Push;

public sealed class PushFixture : ApiFixture
{
    // ana (1) e bruno (2) na empresa A (10); ana também na B (20).
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (20, 1, 'active'), (10, 2, 'active');
        """, new { hash = PasswordHash });
}

/// <summary>Remetente falso: registra o que recebeu e devolve o resultado programado (ou lança).</summary>
internal sealed class FakePushSender : IPushSender
{
    public List<PushMessage> Sent { get; } = [];
    public Func<PushMessage, PushOutcome> Outcome { get; set; } = _ => PushOutcome.Ok;
    public bool Fail { get; set; }

    public Task<IReadOnlyList<PushOutcome>> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken ct)
    {
        if (Fail) throw new HttpRequestException("rede fora");
        Sent.AddRange(messages);
        return Task.FromResult<IReadOnlyList<PushOutcome>>([.. messages.Select(Outcome)]);
    }
}

public sealed class PushDispatcherTests(PushFixture api) : IClassFixture<PushFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly Guid Session = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private const string Token = "ExponentPushToken[aaaa]";

    private readonly FakePushSender _sender = new();

    private PushDispatcher Dispatcher() =>
        new(new PushStore(api.Db.DataSource!), _sender, TimeProvider.System, new ConfigurationBuilder().Build(), NullLogger<PushDispatcher>.Instance);

    private async Task Reset(string? revokedAt = null, string expiresAt = "2999-01-01 00:00:00")
    {
        await api.Db.ExecuteAsync("""
            DELETE FROM mobile_push_tokens; DELETE FROM mobile_sessions; DELETE FROM notifications;
            INSERT INTO mobile_sessions (id, user_id, business_id, created_at, last_used_at, expires_at, revoked_at)
              VALUES (@s, 1, 10, NOW(6), NOW(6), @expires, @revoked);
            INSERT INTO mobile_push_tokens (session_id, token, platform, created_at, updated_at, last_notification_id)
              VALUES (@s, @t, 'android', NOW(6), NOW(6), 0);
            """, new { s = Session.ToString(), t = Token, expires = expiresAt, revoked = revokedAt });
    }

    private Task Notify(int id, long user, long? business, string? read = null, string? archived = null) => api.Db.ExecuteAsync("""
        INSERT INTO notifications (id, uuid, user_id, type_key, domain, severity, title, body, business_id, entity_type, entity_id, read_at, archived_at, created_at)
        VALUES (@id, UUID(), @user, 'x', 'vendas', 'info', @title, 'corpo', @business, 'sale', 9, @read, @archived, NOW())
        """, new { id, user, business, read, archived, title = $"Aviso {id}" });

    private async Task<long> Watermark() => await api.Db.DataSource!.CreateConnection().ExecuteScalarAsync<long>(
        "SELECT COALESCE(MAX(last_notification_id), -1) FROM mobile_push_tokens");

    [Fact]
    public async Task Envia_so_do_escopo_da_sessao_em_ordem_e_avanca_a_marca_dagua()
    {
        TestDatabase.RequireMySql();
        await Reset();
        await Notify(1, 1, 10);                                   // enviada
        await Notify(2, 1, null);                                 // sem empresa: enviada
        await Notify(3, 1, 20);                                   // outra empresa
        await Notify(4, 2, 10);                                   // outro usuário
        await Notify(5, 1, 10, read: "2026-01-01 00:00:00");      // lida
        await Notify(6, 1, 10, archived: "2026-01-01 00:00:00");  // arquivada

        await Dispatcher().RunOnceAsync(Ct);

        Assert.Equal([1L, 2L], _sender.Sent.Select(m => m.NotificationId));
        Assert.All(_sender.Sent, m => Assert.Equal(Token, m.To));
        Assert.Equal(2, await Watermark());

        _sender.Sent.Clear();
        await Dispatcher().RunOnceAsync(Ct);
        Assert.Empty(_sender.Sent); // nada repetido
    }

    [Fact]
    public async Task Sessao_revogada_ou_expirada_nao_recebe()
    {
        TestDatabase.RequireMySql();
        await Reset(revokedAt: "2026-01-01 00:00:00");
        await Notify(1, 1, 10);
        await Dispatcher().RunOnceAsync(Ct);
        Assert.Empty(_sender.Sent);

        await Reset(expiresAt: "2000-01-01 00:00:00");
        await Notify(1, 1, 10);
        await Dispatcher().RunOnceAsync(Ct);
        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task DeviceNotRegistered_apaga_o_token()
    {
        TestDatabase.RequireMySql();
        await Reset();
        await Notify(1, 1, 10);
        _sender.Outcome = _ => PushOutcome.DeviceNotRegistered;

        await Dispatcher().RunOnceAsync(Ct);

        Assert.Equal(-1, await Watermark()); // sem linhas
    }

    [Fact]
    public async Task Falha_de_envio_mantem_a_marca_dagua_e_retenta()
    {
        TestDatabase.RequireMySql();
        await Reset();
        await Notify(1, 1, 10);
        _sender.Fail = true;

        await Assert.ThrowsAsync<HttpRequestException>(() => Dispatcher().RunOnceAsync(Ct));
        Assert.Equal(0, await Watermark());

        _sender.Fail = false;
        await Dispatcher().RunOnceAsync(Ct);
        Assert.Equal([1L], _sender.Sent.Select(m => m.NotificationId));
    }

    [Fact]
    public async Task Erro_de_uma_mensagem_avanca_so_ate_a_anterior()
    {
        TestDatabase.RequireMySql();
        await Reset();
        await Notify(1, 1, 10);
        await Notify(2, 1, 10);
        await Notify(3, 1, 10);
        _sender.Outcome = m => m.NotificationId == 2 ? PushOutcome.Error : PushOutcome.Ok;

        await Dispatcher().RunOnceAsync(Ct);

        Assert.Equal(1, await Watermark());
    }
}

public sealed class PushEndpointsTests(PushFixture api) : IClassFixture<PushFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static HttpRequestMessage Put(string token, string platform = "android") =>
        new(HttpMethod.Put, "/api/v1/me/push-token") { Content = JsonContent.Create(new { token, platform }) };

    private async Task<long> Rows(string token) => await api.Db.DataSource!.CreateConnection()
        .ExecuteScalarAsync<long>("SELECT COUNT(*) FROM mobile_push_tokens WHERE token = @token", new { token });

    [Fact]
    public async Task Exige_autenticacao()
    {
        TestDatabase.RequireMySql();
        var response = await api.Anonymous().SendAsync(Put("ExponentPushToken[abc]"), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().DeleteAsync("/api/v1/me/push-token", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("nao-e-expo", "android")]
    [InlineData("ExponentPushToken[]", "android")]
    [InlineData("ExponentPushToken[a b]", "android")]
    [InlineData("ExponentPushToken[abc]", "windows")]
    public async Task Token_ou_plataforma_invalidos_dao_422(string token, string platform)
    {
        TestDatabase.RequireMySql();
        var client = await api.SignedInAsync("ana");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.SendAsync(Put(token, platform), Ct)).StatusCode);
    }

    [Fact]
    public async Task Registra_substitui_ao_trocar_de_sessao_e_remove()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");
        var bruno = await api.SignedInAsync("bruno");
        const string token = "ExpoPushToken[xyz_-1]";

        Assert.Equal(HttpStatusCode.NoContent, (await ana.SendAsync(Put(token), Ct)).StatusCode);
        Assert.Equal(1, await Rows(token));
        Assert.Equal(HttpStatusCode.NoContent, (await ana.SendAsync(Put(token), Ct)).StatusCode); // idempotente
        Assert.Equal(1, await Rows(token));

        // O mesmo aparelho entrou com outra conta: o token muda de sessão, sem duplicar.
        Assert.Equal(HttpStatusCode.NoContent, (await bruno.SendAsync(Put(token), Ct)).StatusCode);
        Assert.Equal(1, await Rows(token));

        Assert.Equal(HttpStatusCode.NoContent, (await bruno.DeleteAsync("/api/v1/me/push-token", Ct)).StatusCode);
        Assert.Equal(0, await Rows(token));
    }

    [Fact]
    public async Task Notificacoes_antigas_nao_sao_enviadas_ao_registrar()
    {
        TestDatabase.RequireMySql();
        await api.Db.ExecuteAsync("""
            INSERT INTO notifications (id, uuid, user_id, type_key, domain, severity, title, body, business_id, created_at)
            VALUES (100, UUID(), 1, 'x', 'vendas', 'info', 'Velha', 'corpo', 10, NOW())
            """);
        var ana = await api.SignedInAsync("ana");
        const string token = "ExponentPushToken[old1]";
        await ana.SendAsync(Put(token), Ct);

        var watermark = await api.Db.DataSource!.CreateConnection()
            .ExecuteScalarAsync<long>("SELECT last_notification_id FROM mobile_push_tokens WHERE token = @token", new { token });
        Assert.Equal(100, watermark);

        var sender = new FakePushSender();
        var dispatcher = new PushDispatcher(new PushStore(api.Db.DataSource!), sender, TimeProvider.System, new ConfigurationBuilder().Build(), NullLogger<PushDispatcher>.Instance);
        await dispatcher.RunOnceAsync(Ct);
        Assert.DoesNotContain(sender.Sent, m => m.NotificationId == 100);
    }
}

public sealed class ExpoPushSenderTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class Stub(Func<HttpRequestMessage, string, HttpResponseMessage> reply) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = await request.Content!.ReadAsStringAsync(ct);
            Calls.Add((request, body));
            return reply(request, body);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static PushMessage[] Messages(int n) =>
        [.. Enumerable.Range(1, n).Select(i => new PushMessage("ExponentPushToken[a]", $"T{i}", "B", i, "sale", 9))];

    private static ExpoPushSender Sender(Stub stub, string? accessToken = null) => new(new HttpClient(stub),
        new ConfigurationBuilder().AddInMemoryCollection(accessToken is null ? [] : new Dictionary<string, string?> { ["Push:ExpoAccessToken"] = accessToken }).Build());

    [Fact]
    public async Task Divide_em_lotes_de_100_e_monta_o_payload()
    {
        var stub = new Stub((_, body) =>
        {
            var count = JsonDocument.Parse(body).RootElement.GetArrayLength();
            return Json(HttpStatusCode.OK, $$"""{"data":[{{string.Join(",", Enumerable.Repeat("""{"status":"ok","id":"x"}""", count))}}]}""");
        });

        var results = await Sender(stub).SendAsync(Messages(150), Ct);

        Assert.Equal(150, results.Count);
        Assert.All(results, r => Assert.Equal(PushOutcome.Ok, r));
        Assert.Equal([100, 50], stub.Calls.Select(c => JsonDocument.Parse(c.Body).RootElement.GetArrayLength()));
        Assert.All(stub.Calls, c => Assert.Equal(ExpoPushSender.Endpoint, c.Request.RequestUri!.ToString()));
        var first = JsonDocument.Parse(stub.Calls[0].Body).RootElement[0];
        Assert.Equal("default", first.GetProperty("sound").GetString());
        Assert.Equal("high", first.GetProperty("priority").GetString());
        Assert.Equal("default", first.GetProperty("channelId").GetString());
        Assert.Equal(1, first.GetProperty("data").GetProperty("notificationId").GetInt64());
        Assert.Equal("sale", first.GetProperty("data").GetProperty("entityType").GetString());
        Assert.Null(stub.Calls[0].Request.Headers.Authorization);
    }

    [Fact]
    public async Task Interpreta_recibos_por_mensagem_e_envia_bearer_quando_configurado()
    {
        var stub = new Stub((_, _) => Json(HttpStatusCode.OK, """
            {"data":[{"status":"ok"},{"status":"error","message":"x","details":{"error":"DeviceNotRegistered"}},{"status":"error","details":{"error":"MessageRateExceeded"}}]}
            """));

        var results = await Sender(stub, "segredo").SendAsync(Messages(3), Ct);

        Assert.Equal([PushOutcome.Ok, PushOutcome.DeviceNotRegistered, PushOutcome.Error], results);
        Assert.Equal("Bearer", stub.Calls[0].Request.Headers.Authorization!.Scheme);
        Assert.Equal("segredo", stub.Calls[0].Request.Headers.Authorization!.Parameter);
    }

    [Fact]
    public async Task Http_5xx_ou_resposta_fora_do_formato_lancam()
    {
        await Assert.ThrowsAsync<HttpRequestException>(() =>
            Sender(new Stub((_, _) => Json(HttpStatusCode.BadGateway, "{}"))).SendAsync(Messages(1), Ct));
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Sender(new Stub((_, _) => Json(HttpStatusCode.OK, """{"data":[]}"""))).SendAsync(Messages(1), Ct));
    }
}
