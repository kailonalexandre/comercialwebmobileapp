using System.Net;
using ComercialWeb.Mobile.Tests.Dashboard;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Management;

public sealed class ManagementFixture : ApiFixture
{
    protected override void ConfigureHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(DashboardFixture.Now)));

    // ana: todas as permissões de gestão; bruno: nenhuma; carla: só contas a receber. "Hoje" da empresa = 10/09/2026.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash), (3, 'Carla', 'carla', 'carla@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active'), (10, 3, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'financial.receivables.view', 'web'), (2, 'financial.payables.view', 'web'), (3, 'purchases.access', 'web'), (4, 'relatorios.access', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES
          (1, 'App\\Models\\User', 1, 10), (2, 'App\\Models\\User', 1, 10), (3, 'App\\Models\\User', 1, 10), (4, 'App\\Models\\User', 1, 10), (1, 'App\\Models\\User', 3, 10);
        INSERT INTO people (id, business_id, code, person_kind, name, is_client) VALUES (1, 10, 1, 'individual', 'MARIA', 1), (2, 10, 2, 'company', 'FORNECEDOR X', 0);
        INSERT INTO storage_locations (id, business_id, type, name, primary_marker, is_active) VALUES
          (100, 10, 'unit', 'Matriz', 1, 1), (101, 10, 'unit', 'Filial', NULL, 1), (200, 20, 'unit', 'Loja B', 1, 1);
        INSERT INTO financial_lines (id, business_id, location_id, type, status, grouped_into_id, amount_cents, paid_cents, interest_cents, person_id, description, due_date, is_liquidated, deleted_at) VALUES
          (1, 10, 100, 'receivable', 'open', NULL, 10000, 2000, 0, 1, 'Venda V1', '2026-09-09', 0, NULL),
          (2, 10, 100, 'receivable', 'open', 1, 5000, 0, 0, NULL, 'Agrupado', '2026-09-01', 0, NULL),
          (3, 10, 100, 'receivable', 'settled', NULL, 4000, 4000, 0, NULL, 'Baixado', '2026-09-05', 0, NULL),
          (4, 10, 100, 'receivable', 'open', NULL, 3000, 0, 0, NULL, 'Vence hoje', '2026-09-10', 0, NULL),
          (5, 10, 100, 'receivable', 'open', NULL, 6000, 0, 0, NULL, 'Excluído', '2026-09-02', 0, NOW()),
          (6, 10, 100, 'payable', 'open', NULL, 9000, 0, 0, 2, 'Aluguel', '2026-09-08', 0, NULL),
          (7, 20, 200, 'receivable', 'open', NULL, 7777, 0, 0, NULL, 'Outra empresa', '2026-09-01', 0, NULL),
          (8, 10, 100, 'receivable', 'partial', NULL, 5000, 1000, 200, NULL, 'Parcial com juros', '2026-09-12', 0, NULL),
          (9, 10, 100, 'receivable', 'settled', NULL, 1500, 1500, 0, NULL, 'Liquidado fora do caixa', '2026-09-01', 1, NULL),
          (10, 10, 100, 'receivable', 'lost', NULL, 700, 0, 0, NULL, 'Perdido', '2026-09-02', 0, NULL),
          (11, 10, 101, 'receivable', 'open', NULL, 999, 0, 0, NULL, 'Outra unidade', '2026-09-01', 0, NULL);
        INSERT INTO purchase_orders (id, business_id, location_id, supplier_person_id, nfe_access_key, number, status, ordered_at, total_cents, is_urgent) VALUES
          (1, 10, 100, 2, NULL, 'PC1', 'pendente', '2026-09-01', 5000, 1), (2, 10, 100, NULL, '35260912345678901234567890123456789012345678', 'PC2', 'recebido', '2026-09-05', 7000, 0),
          (3, 20, 200, NULL, NULL, 'PC3', 'pendente', '2026-09-06', 1, 0), (4, 10, 101, NULL, NULL, 'PC4', 'pendente', '2026-09-07', 2, 0);
        INSERT INTO sales (id, business_id, location_id, customer_person_id, number, status, total_cents, occurred_at, created_at, deleted_at) VALUES
          (1, 10, 100, 1, 'V1', 'finalizada', 10000, '2026-09-10 21:00:00', '2026-09-10 21:00:00', NULL),
          (2, 10, 101, NULL, 'V2', 'finalizada', 5000, NULL, '2026-09-10 08:00:00', NULL),
          (3, 10, 100, NULL, 'V3', 'pre_venda', 7000, '2026-09-10 09:00:00', '2026-09-10 09:00:00', NULL),
          (4, 10, 100, NULL, 'V4', 'finalizada', 999, '2026-09-10 10:00:00', '2026-09-10 10:00:00', NOW()),
          (5, 10, 100, NULL, 'V5', 'finalizada', 3000, '2026-09-11 00:30:00', '2026-09-11 00:30:00', NULL),
          (6, 20, 200, NULL, 'V6', 'finalizada', 8000, '2026-09-10 12:00:00', '2026-09-10 12:00:00', NULL);
        INSERT INTO sale_payments (sale_id, method, amount_cents) VALUES (1, 'cash', 10000), (2, 'pix_transfer', 5000), (5, 'cash', 3000), (3, 'cash', 7000), (6, 'cash', 8000);
        """, new { hash = PasswordHash });
}

public sealed class ManagementApiTests(ManagementFixture api) : IClassFixture<ManagementFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Totals(long Count, long TotalCents);
    private sealed record Summary(Totals? ReceivablesOpen, Totals? ReceivablesOverdue, Totals? PayablesOpen, Totals? PayablesOverdue);
    private sealed record Title(long Id, string? PersonName, long OpenCents, bool Overdue);
    private sealed record Purchase(long Id, string Number, string? SupplierName);
    private sealed record Page<T>(List<T> Items, long Total);
    private sealed record Report(long Count, long TotalCents, long AverageTicketCents, List<JsonElementDay> ByDay, List<MethodRow> ByMethod);
    private sealed record JsonElementDay(string Day, long Count, long TotalCents);
    private sealed record MethodRow(string Method, long TotalCents);

    private async Task<HttpResponseMessage> Get(string login, string url) => await (await api.SignedInAsync(login)).GetAsync(url, Ct);

    private async Task<T> Read<T>(string login, string url)
    {
        var response = await Get(login, url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<T>(Ct))!;
    }

    [Fact]
    public async Task Resumo_conta_so_o_que_esta_em_aberto_e_nao_agrupado_da_empresa()
    {
        TestDatabase.RequireMySql();
        var s = await Read<Summary>("ana", "/api/v1/financial/summary");
        // "A vencer" como a web: vence hoje (3000) + parcial com juros (5000 + 200 - 1000 = 4200); perdido, liquidado só aparece fora daqui.
        Assert.Equal(new Totals(2, 7200), s.ReceivablesOpen);
        Assert.Equal(new Totals(1, 8000), s.ReceivablesOverdue);
        Assert.Equal(new Totals(0, 0), s.PayablesOpen);
        Assert.Equal(new Totals(1, 9000), s.PayablesOverdue);
    }

    [Fact]
    public async Task Resumo_so_traz_o_lado_permitido()
    {
        TestDatabase.RequireMySql();
        var s = await Read<Summary>("carla", "/api/v1/financial/summary");
        Assert.NotNull(s.ReceivablesOpen);
        Assert.Null(s.PayablesOpen);
        Assert.Equal(HttpStatusCode.Forbidden, (await Get("bruno", "/api/v1/financial/summary")).StatusCode);
    }

    [Fact]
    public async Task Contas_a_receber_filtram_por_situacao_e_busca()
    {
        TestDatabase.RequireMySql();
        var open = await Read<Page<Title>>("ana", "/api/v1/financial/receivables?status=open");
        Assert.Equal([4L, 8L], open.Items.Select(t => t.Id)); // a vencer, por vencimento; parcial entra com o saldo com juros
        Assert.Equal(4200, open.Items[1].OpenCents);
        var overdue = await Read<Page<Title>>("ana", "/api/v1/financial/receivables?status=overdue");
        Assert.Equal([1L], overdue.Items.Select(t => t.Id));
        Assert.True(overdue.Items[0].Overdue);
        Assert.Equal(8000, overdue.Items[0].OpenCents);
        Assert.Equal([3L], (await Read<Page<Title>>("ana", "/api/v1/financial/receivables?status=paid")).Items.Select(t => t.Id)); // liquidado fora do caixa e perdido ficam de fora
        Assert.Equal([9L, 10L, 3L, 1L, 4L, 8L], (await Read<Page<Title>>("ana", "/api/v1/financial/receivables")).Items.Select(t => t.Id)); // sem filtro: toda a unidade (11 é da Filial)
        Assert.Equal([1L], (await Read<Page<Title>>("ana", "/api/v1/financial/receivables?search=maria")).Items.Select(t => t.Id));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Get("ana", "/api/v1/financial/receivables?status=xx")).StatusCode);
    }

    [Fact]
    public async Task Contas_a_pagar_exigem_a_propria_permissao()
    {
        TestDatabase.RequireMySql();
        Assert.Equal([6L], (await Read<Page<Title>>("ana", "/api/v1/financial/payables")).Items.Select(t => t.Id));
        Assert.Equal(HttpStatusCode.Forbidden, (await Get("carla", "/api/v1/financial/payables")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Get("carla", "/api/v1/financial/receivables")).StatusCode);
    }

    [Fact]
    public async Task Compras_da_empresa_com_filtro_e_permissao()
    {
        TestDatabase.RequireMySql();
        var all = await Read<Page<Purchase>>("ana", "/api/v1/purchases");
        Assert.Equal(["PC2", "PC1"], all.Items.Select(p => p.Number));
        Assert.Equal("FORNECEDOR X", all.Items.Single(p => p.Number == "PC1").SupplierName);
        Assert.Equal(["PC1"], (await Read<Page<Purchase>>("ana", "/api/v1/purchases?status=pendente")).Items.Select(p => p.Number));
        Assert.Equal(["PC1"], (await Read<Page<Purchase>>("ana", "/api/v1/purchases?search=fornecedor")).Items.Select(p => p.Number));
        Assert.Equal(["PC2"], (await Read<Page<Purchase>>("ana", "/api/v1/purchases?search=3526091234")).Items.Select(p => p.Number)); // chave da NF-e
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Get("ana", "/api/v1/purchases?status=xx")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Get("bruno", "/api/v1/purchases")).StatusCode);
    }

    [Fact]
    public async Task Relatorio_de_vendas_soma_so_finalizadas_do_periodo_na_data_local()
    {
        TestDatabase.RequireMySql();
        var r = await Read<Report>("ana", "/api/v1/reports/sales?from=2026-09-10&to=2026-09-11");
        Assert.Equal(2, r.Count); // V1 e V5 da Matriz; V2 é da Filial; pré-venda, excluída e outra empresa ficam de fora
        Assert.Equal(13000, r.TotalCents);
        Assert.Equal(6500, r.AverageTicketCents);
        Assert.Equal([("2026-09-10", 1L), ("2026-09-11", 1L)], r.ByDay.Select(d => (d.Day[..10], d.Count)));
        Assert.Equal([("cash", 13000L)], r.ByMethod.Select(m => (m.Method, m.TotalCents)));

        var padrao = await Read<Report>("ana", "/api/v1/reports/sales"); // últimos 30 dias até hoje (10/09): V5 é de amanhã
        Assert.Equal(1, padrao.Count);
    }

    [Fact]
    public async Task Relatorio_recusa_periodo_invalido_e_exige_permissao()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Get("ana", "/api/v1/reports/sales?from=2026-09-11&to=2026-09-10")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Get("ana", "/api/v1/reports/sales?from=2024-01-01&to=2026-09-10")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Get("bruno", "/api/v1/reports/sales")).StatusCode);
    }
}
