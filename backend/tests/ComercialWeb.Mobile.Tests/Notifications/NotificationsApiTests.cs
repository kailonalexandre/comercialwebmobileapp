using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Tests.Dashboard;
using ComercialWeb.Mobile.Tests.Support;
using Dapper;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Notifications;

public sealed class NotificationsFixture : ApiFixture
{
    // 01:00 UTC de 11/09 = 22:00 de 10/09 em São Paulo (horário local gravado pela web).
    public static readonly DateTimeOffset Now = new(2026, 9, 11, 1, 0, 0, TimeSpan.Zero);

    protected override void ConfigureHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(Now)));

    /// <summary>Volta read/archived/updated ao estado do seed: testes que gravam não afetam os demais.</summary>
    public Task ResetAsync() => Db.ExecuteAsync("""
        UPDATE notifications SET updated_at = NULL,
          read_at = CASE id WHEN 3 THEN '2026-09-09 12:00:00' WHEN 5 THEN '2026-09-01 10:00:00' WHEN 6 THEN '2026-09-08 10:00:00' END,
          archived_at = CASE id WHEN 5 THEN '2026-09-02 10:00:00' END
        """);

    // ana e bruno na empresa A (10); ana também na B (20), mas a sessão dela abre em A.
    // Avisos da ana: 1 A info não lido | 2 A crítico não lido | 3 sem empresa lido | 4 B não lido (outra empresa)
    //                5 A arquivado | 6 A warning lido com "%" no título. Aviso 7 é do bruno.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (20, 1, 'active'), (10, 2, 'active');
        INSERT INTO notifications (id, uuid, user_id, type_key, domain, severity, title, body, url, business_id, entity_type, entity_id, context, read_at, archived_at, created_at) VALUES
          (1, '00000000-0000-0000-0000-000000000001', 1, 'vendas.nova', 'vendas', 'info', 'Nova venda', 'Venda V1 finalizada', '/comercial/vendas/1', 10, 'sale', 1, '{"secret":"x"}', NULL, NULL, '2026-09-10 09:00:00'),
          (2, '00000000-0000-0000-0000-000000000002', 1, 'estoque.baixo', 'estoque', 'critical', 'Estoque crítico', 'Camiseta zerada', NULL, 10, 'product', 5, NULL, NULL, NULL, '2026-09-10 10:00:00'),
          (3, '00000000-0000-0000-0000-000000000003', 1, 'sistema.aviso', 'sistema', 'success', 'Atualização', 'Nova versão', NULL, NULL, NULL, NULL, NULL, '2026-09-09 12:00:00', NULL, '2026-09-09 08:00:00'),
          (4, '00000000-0000-0000-0000-000000000004', 1, 'vendas.nova', 'vendas', 'info', 'Venda da empresa B', 'Outra empresa', NULL, 20, 'sale', 9, NULL, NULL, NULL, '2026-09-10 11:00:00'),
          (5, '00000000-0000-0000-0000-000000000005', 1, 'vendas.nova', 'vendas', 'info', 'Arquivado', 'Antigo', NULL, 10, NULL, NULL, NULL, '2026-09-01 10:00:00', '2026-09-02 10:00:00', '2026-09-01 09:00:00'),
          (6, '00000000-0000-0000-0000-000000000006', 1, 'financeiro.vencido', 'financeiro', 'warning', 'Desconto de 50% vencido', 'Título vencido', NULL, 10, 'title', 3, NULL, '2026-09-08 10:00:00', NULL, '2026-09-08 09:00:00'),
          (7, '00000000-0000-0000-0000-000000000007', 2, 'vendas.nova', 'vendas', 'info', 'Aviso do Bruno', 'Só dele', NULL, 10, NULL, NULL, NULL, NULL, NULL, '2026-09-10 12:00:00');
        """, new { hash = PasswordHash });
}

public sealed class NotificationsApiTests(NotificationsFixture api) : IClassFixture<NotificationsFixture>, IAsyncLifetime
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        if (TestDatabase.Server is not null) await api.ResetAsync();
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private sealed record Item(long Id, string Severity, string? EntityType, long? EntityId, DateTime? ReadAt, DateTime? ArchivedAt);
    private sealed record PageDto(List<Item> Items, long Total);
    private sealed record CountsDto(long Count, long CriticalCount);

    private static async Task<PageDto> List(HttpClient client, string query = "")
    {
        var response = await client.GetAsync($"/api/v1/notifications{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PageDto>(Ct))!;
    }

    private async Task<(DateTime? Read, DateTime? Archived, DateTime? Updated)> Row(long id)
    {
        await using var conn = await api.Db.DataSource!.OpenConnectionAsync(Ct);
        return await conn.QuerySingleAsync<(DateTime?, DateTime?, DateTime?)>("SELECT read_at, archived_at, updated_at FROM notifications WHERE id = @id", new { id });
    }

    [Fact]
    public async Task Sem_token_e_401()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync("/api/v1/notifications", Ct)).StatusCode);
    }

    [Fact]
    public async Task Lista_so_os_avisos_ativos_do_usuario_na_empresa_da_sessao_ou_sem_empresa()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");

        // 4 (outra empresa), 5 (arquivado) e 7 (outro usuário) ficam de fora; ordem do mais novo ao mais antigo.
        Assert.Equal([2, 1, 3, 6], (await List(ana)).Items.Select(i => i.Id));
        Assert.Equal([7], (await List(await api.SignedInAsync("bruno"))).Items.Select(i => i.Id));
    }

    [Theory]
    [InlineData("?status=archived", new long[] { 5 })]
    [InlineData("?read=unread", new long[] { 2, 1 })]
    [InlineData("?read=read", new long[] { 3, 6 })]
    [InlineData("?severity=critical", new long[] { 2 })]
    [InlineData("?domain=financeiro", new long[] { 6 })]
    [InlineData("?search=50%25", new long[] { 6 })]   // "%" é texto
    [InlineData("?search=%25", new long[] { 6 })]     // "%" sozinho não vira curinga
    [InlineData("?search=zerada", new long[] { 2 })]  // busca no corpo
    public async Task Filtros(string query, long[] expected)
    {
        TestDatabase.RequireMySql();
        Assert.Equal(expected, (await List(await api.SignedInAsync("ana"), query)).Items.Select(i => i.Id));
    }

    [Theory]
    [InlineData("?status=todas")]
    [InlineData("?read=talvez")]
    [InlineData("?severity=fatal")]
    [InlineData("?pageSize=51")]
    public async Task Filtro_invalido_e_422(string query)
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await (await api.SignedInAsync("ana")).GetAsync($"/api/v1/notifications{query}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Nao_expoe_url_nem_contexto_e_traz_a_entidade_para_navegacao_no_app()
    {
        TestDatabase.RequireMySql();
        var json = await (await (await api.SignedInAsync("ana")).GetAsync("/api/v1/notifications?severity=critical", Ct)).Content.ReadAsStringAsync(Ct);
        using var doc = JsonDocument.Parse(json);
        var item = doc.RootElement.GetProperty("items")[0];
        Assert.Equal("product", item.GetProperty("entityType").GetString());
        Assert.Equal(5, item.GetProperty("entityId").GetInt64());
        Assert.DoesNotContain("url", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("context", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Contador_conta_ativas_nao_lidas_e_as_criticas_a_parte()
    {
        TestDatabase.RequireMySql();
        var counts = await (await api.SignedInAsync("ana")).GetFromJsonAsync<CountsDto>("/api/v1/notifications/unread-count", Ct);
        Assert.Equal(new CountsDto(2, 1), counts); // 1 e 2; a 4 é de outra empresa
    }

    [Fact]
    public async Task Marcar_como_lida_grava_horario_local_e_e_idempotente()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");

        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync("/api/v1/notifications/1/read", null, Ct)).StatusCode);
        var first = await Row(1);
        Assert.Equal(new DateTime(2026, 9, 10, 22, 0, 0), first.Read);
        Assert.Equal(first.Read, first.Updated);

        // Já lida: não muda o horário original nem o updated_at.
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync("/api/v1/notifications/6/read", null, Ct)).StatusCode);
        Assert.Equal(new DateTime(2026, 9, 8, 10, 0, 0), (await Row(6)).Read);
    }

    [Fact]
    public async Task Aviso_de_outro_usuario_ou_inexistente_e_404_e_nao_e_alterado()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");

        Assert.Equal(HttpStatusCode.NotFound, (await ana.PostAsync("/api/v1/notifications/7/read", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ana.PostAsync("/api/v1/notifications/7/archive", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ana.PostAsync("/api/v1/notifications/999/read", null, Ct)).StatusCode);
        Assert.Equal((null, null, null), await Row(7));
    }

    [Fact]
    public async Task Arquivar_tambem_marca_como_lida_e_tira_da_lista_ativa()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");

        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync("/api/v1/notifications/2/archive", null, Ct)).StatusCode);

        var row = await Row(2);
        Assert.Equal(new DateTime(2026, 9, 10, 22, 0, 0), row.Archived);
        Assert.Equal(row.Archived, row.Read);
        Assert.DoesNotContain(2, (await List(ana)).Items.Select(i => i.Id));
        Assert.Contains(2, (await List(ana, "?status=archived")).Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Marcar_todas_respeita_o_escopo_da_listagem()
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("ana")).PostAsync("/api/v1/notifications/read-all", null, Ct);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

        Assert.Equal(2, body.GetProperty("updated").GetInt32());
        Assert.NotNull((await Row(1)).Read);
        Assert.NotNull((await Row(2)).Read);
        Assert.Null((await Row(4)).Read); // outra empresa: o usuário nunca viu, não é marcado
        Assert.Null((await Row(7)).Read); // outro usuário
        Assert.Equal(new DateTime(2026, 9, 1, 10, 0, 0), (await Row(5)).Read); // arquivado: não é tocado
        Assert.Equal(new DateTime(2026, 9, 9, 12, 0, 0), (await Row(3)).Read); // já lido: horário original
    }
}
