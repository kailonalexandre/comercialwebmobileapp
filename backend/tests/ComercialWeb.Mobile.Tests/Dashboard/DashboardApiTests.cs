using System.Net;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Dashboard;

internal sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

public sealed class DashboardFixture : ApiFixture
{
    // 01:00 UTC de 11/09 = 22:00 de 10/09 em São Paulo: "hoje" da empresa ainda é 10/09.
    public static readonly DateTimeOffset Now = new(2026, 9, 11, 1, 0, 0, TimeSpan.Zero);

    protected override void ConfigureHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(Now)));

    // ana: todas as permissões dos cards; bruno: só sales.view; carla: nenhuma.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash), (3, 'Carla', 'carla', 'carla@a.com', @hash), (4, 'Dani', 'dani', 'dani@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status, employee_person_id, default_seller_person_id) VALUES
          (10, 1, 'active', NULL, NULL), (10, 2, 'active', NULL, NULL), (10, 3, 'active', NULL, NULL), (10, 4, 'active', 3, 2);
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'sales.view', 'web'), (2, 'financial.receivables.view', 'web'), (3, 'inventory.view', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES
          (1, 'App\\Models\\User', 1, 10), (2, 'App\\Models\\User', 1, 10), (3, 'App\\Models\\User', 1, 10), (1, 'App\\Models\\User', 2, 10),
          (1, 'App\\Models\\User', 4, 10);
        INSERT INTO people (id, business_id, code, person_kind, name, is_client, is_employee, sales_goal, is_active) VALUES
          (1, 10, 1, 'individual', 'MARIA', 1, 0, NULL, 1),
          (2, 10, 2, 'individual', 'DANI VENDEDORA', 0, 1, 100.00, 1),
          (3, 10, 3, 'individual', 'DANI FUNCIONARIA', 0, 1, 50.00, 1);
        INSERT INTO sales (id, business_id, location_id, customer_person_id, number, status, total_cents, occurred_at, created_at, deleted_at) VALUES
          (1, 10, 100, 1, 'V1', 'finalizada', 10000, '2026-09-10 21:00:00', '2026-09-10 21:00:00', NULL),
          (2, 10, 101, NULL, 'V2', 'finalizada', 5000, NULL, '2026-09-10 08:00:00', NULL),
          (3, 10, 100, NULL, 'V3', 'pre_venda', 7000, '2026-09-10 09:00:00', '2026-09-10 09:00:00', NULL),
          (4, 10, 100, NULL, 'V4', 'finalizada', 999, '2026-09-10 10:00:00', '2026-09-10 10:00:00', NOW()),
          (5, 10, 100, NULL, 'V5', 'finalizada', 3000, '2026-09-11 00:30:00', '2026-09-11 00:30:00', NULL),
          (6, 20, 200, NULL, 'V6', 'finalizada', 8000, '2026-09-10 12:00:00', '2026-09-10 12:00:00', NULL);
        INSERT INTO financial_lines (id, business_id, type, status, grouped_into_id, amount_cents, paid_cents, deleted_at) VALUES
          (1, 10, 'receivable', 'open', NULL, 10000, 2000, NULL),
          (2, 10, 'receivable', 'open', 1, 5000, 0, NULL),
          (3, 10, 'receivable', 'paid', NULL, 4000, 4000, NULL),
          (4, 10, 'payable', 'open', NULL, 9000, 0, NULL),
          (5, 10, 'receivable', 'open', NULL, 6000, 0, NOW()),
          (6, 20, 'receivable', 'open', NULL, 7777, 0, NULL);
        INSERT INTO products (id, business_id, code, name, cost_price, sale_price, minimum_quantity, is_active, deleted_at) VALUES
          (1, 10, 1, 'Abaixo do mínimo', 0, 1, 5, 1, NULL),
          (2, 10, 2, 'Saldo negativo', 0, 1, 0, 1, NULL),
          (3, 10, 3, 'Mínimo pelas variações', 0, 1, 0, 1, NULL),
          (4, 10, 4, 'Acima do mínimo', 0, 1, 10, 1, NULL),
          (5, 10, 5, 'Inativo', 0, 1, 5, 0, NULL),
          (6, 10, 6, 'Excluído', 0, 1, 5, 1, NOW()),
          (7, 10, 7, 'Sem mínimo', 0, 1, 0, 1, NULL),
          (8, 20, 1, 'De outra empresa', 0, 1, 5, 1, NULL);
        INSERT INTO product_variations (business_id, product_id, minimum_stock) VALUES (10, 3, 2), (10, 3, 2);
        INSERT INTO stock_balances (business_id, product_id, storage_location_id, quantity_milli) VALUES
          (10, 1, 100, 1000), (10, 1, 101, 2000), (10, 2, 100, -1000), (10, 3, 100, 4000), (10, 4, 100, 20000),
          (10, 5, 100, 0), (10, 6, 100, 0), (10, 7, 100, 0), (20, 8, 200, 0);
        -- Setembro: meta da empresa 1.000,00 vence a soma dos vendedores; a da Dani é 400,00 (a de agosto não vale).
        INSERT INTO sales_goals (business_id, scope, seller_person_id, seller_key, year, month, amount_cents, is_active) VALUES
          (10, 'company', NULL, 0, 2026, 9, 100000, 1), (10, 'seller', 2, 2, 2026, 9, 40000, 1), (10, 'seller', 3, 3, 2026, 9, 99999, 0),
          (10, 'seller', 2, 2, 2026, 8, 77777, 1), (20, 'company', NULL, 0, 2026, 9, 555, 1);
        -- Vendas da Dani no mês: finalizada (frete fora), devolução (negativa) e uma de agosto que não conta.
        INSERT INTO sales (id, business_id, location_id, seller_person_id, number, status, total_cents, freight_cents, occurred_at, created_at) VALUES
          (7, 10, 100, 2, 'V7', 'finalizada', 20000, 2000, '2026-09-02 10:00:00', '2026-09-02 10:00:00'),
          (8, 10, 100, 2, 'V8', 'devolucao', 3000, 0, '2026-09-03 10:00:00', '2026-09-03 10:00:00'),
          (9, 10, 100, 2, 'V9', 'finalizada', 50000, 0, '2026-08-30 10:00:00', '2026-08-30 10:00:00');
        INSERT INTO conditionals (business_id, status, total_cents) VALUES (10, 'aberto', 100), (10, 'aberto', 200), (10, 'fechado', 999), (20, 'aberto', 555);
        """, new { hash = PasswordHash });
}

public sealed class DashboardApiTests(DashboardFixture api) : IClassFixture<DashboardFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Pair(long Count, long TotalCents);
    private sealed record Recent(long Id, string? CustomerName, DateTime OccurredAt);
    private sealed record Goal(string Scope, long GoalCents, long SoldCents, int Percent);
    private sealed record Dto(Pair? SalesToday, Pair? Receivables, long? LowStockCount, Pair? OpenConditionals, List<Recent>? RecentSales, string View = "", Goal? SalesGoal = null);

    private async Task<Dto> Get(string login)
    {
        var response = await (await api.SignedInAsync(login)).GetAsync("/api/v1/dashboard", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Dto>(Ct))!;
    }

    [Fact]
    public async Task Cards_seguem_as_regras_da_web_para_a_empresa_inteira()
    {
        TestDatabase.RequireMySql();
        var d = await Get("ana");

        // Hoje (10/09 local): V1 + V2 (outra unidade entra: dashboard consolida). Pré-venda, excluída, amanhã e outra empresa ficam de fora.
        Assert.Equal(new Pair(2, 15000), d.SalesToday);
        // Aberto e não agrupado: 10000 - 2000 pagos.
        Assert.Equal(new Pair(1, 8000), d.Receivables);
        // Abaixo do mínimo, saldo negativo e mínimo pelas variações (4 <= 4).
        Assert.Equal(3, d.LowStockCount);
        Assert.Equal(new Pair(2, 300), d.OpenConditionals);

        Assert.Equal([5, 1, 3, 2, 8, 7, 9], d.RecentSales!.Select(s => s.Id));
        Assert.Equal("MARIA", d.RecentSales!.Single(s => s.Id == 1).CustomerName);
        Assert.Equal(new DateTime(2026, 9, 10, 8, 0, 0), d.RecentSales!.Single(s => s.Id == 2).OccurredAt); // sem occurred_at: created_at
    }

    [Fact]
    public async Task Cards_sem_permissao_nao_sao_enviados()
    {
        TestDatabase.RequireMySql();
        var bruno = await Get("bruno");
        Assert.NotNull(bruno.SalesToday);
        Assert.NotNull(bruno.OpenConditionals);
        Assert.Null(bruno.Receivables);
        Assert.Null(bruno.LowStockCount);

        var carla = await Get("carla");
        Assert.Equal(new Dto(null, null, null, null, null, "seller"), carla with { RecentSales = null });
        Assert.Null(carla.RecentSales);
    }

    [Fact]
    public async Task Loja_ve_a_meta_da_empresa_com_o_faturamento_liquido_do_mes()
    {
        TestDatabase.RequireMySql();
        var ana = await Get("ana");
        Assert.Equal("store", ana.View);
        // Setembro até hoje (10/09): V1 10000 + V2 5000 + V7 20000 − V8 3000 = 32000 de 100000 (meta da empresa).
        Assert.Equal(new Goal("company", 100000, 32000, 32), ana.SalesGoal);
    }

    [Fact]
    public async Task Vendedor_ve_a_propria_meta_sem_contas_a_receber()
    {
        TestDatabase.RequireMySql();
        var dani = await Get("dani");
        Assert.Equal("seller", dani.View);
        Assert.Null(dani.Receivables); // a API não envia: esconder no app não basta
        // Vendedor padrão (2) vence o funcionário vinculado (3). Realizado: (20000 − 2000 de frete) − 3000 = 15000 de 40000.
        Assert.Equal(new Goal("seller", 40000, 15000, 38), dani.SalesGoal);

        // Bruno: vendedor sem vendedor vinculado = sem meta própria; Carla: sem sales.view = sem meta.
        Assert.Null((await Get("bruno")).SalesGoal);
        Assert.Null((await Get("carla")).SalesGoal);
    }
}
