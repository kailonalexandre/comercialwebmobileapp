using System.Net;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Sales;

public sealed class SalesFixture : ApiFixture
{
    // Empresa A (10): unidades 100 Matriz (principal), 101 Filial, 102 inativa, 103 depósito. Empresa B (20): unidade 200.
    // ana:   preferência 101 (permitida)               -> unidade 101
    // bruno: preferência 101, restrito à 100           -> unidade 100
    // carla: sem preferência                           -> principal 100
    // diego: restrito à unidade 200 (empresa B apenas)  -> nenhuma unidade na empresa A (como na web)
    // eva:   sem sales.view                            -> 403
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES
          (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash), (3, 'Carla', 'carla', 'carla@a.com', @hash),
          (4, 'Diego', 'diego', 'diego@a.com', @hash), (5, 'Eva', 'eva', 'eva@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active'), (10, 3, 'active'), (10, 4, 'active'), (10, 5, 'active');
        INSERT INTO storage_locations (id, business_id, type, name, primary_marker, is_active) VALUES
          (100, 10, 'unit', 'Matriz', 1, 1), (101, 10, 'unit', 'Filial', NULL, 1), (102, 10, 'unit', 'Antiga', NULL, 0),
          (103, 10, 'storage', 'Depósito', NULL, 1), (200, 20, 'unit', 'Loja B', 1, 1);
        INSERT INTO user_preferences (user_id, current_business_id, current_location_id) VALUES (1, 10, 101), (2, 10, 101);
        INSERT INTO user_storage_locations (user_id, storage_location_id, business_id) VALUES (2, 100, 10), (4, 200, 20);
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'sales.view', 'web');
        INSERT INTO roles (id, business_id, name, guard_name) VALUES (1, 10, 'Vendedor', 'web');
        INSERT INTO role_has_permissions (permission_id, role_id) VALUES (1, 1);
        INSERT INTO model_has_roles (role_id, model_type, model_id, business_id) VALUES
          (1, 'App\\Models\\User', 1, 10), (1, 'App\\Models\\User', 2, 10), (1, 'App\\Models\\User', 3, 10), (1, 'App\\Models\\User', 4, 10);
        INSERT INTO people (id, business_id, code, person_kind, name, document, is_client) VALUES
          (1, 10, 1, 'individual', 'MARIA SILVA', '12345678900', 1), (2, 10, 2, 'individual', 'JOAO VENDEDOR', NULL, 0);
        INSERT INTO sales (id, business_id, location_id, customer_person_id, seller_user_id, seller_person_id, number, status,
                           subtotal_cents, discount_cents, total_cents, created_at, deleted_at) VALUES
          (1, 10, 100, 1, 3, 2, 'V000001', 'finalizada', 13000, 1000, 12000, '2026-09-01 10:00:00', NULL),
          (2, 10, 100, NULL, 3, NULL, 'V000002', 'pre_venda', 5000, 0, 5000, '2026-09-02 11:00:00', NULL),
          (3, 10, 100, 1, 3, NULL, 'V000003', 'troca', 2000, 0, 2000, '2026-09-03 12:00:00', NULL),
          (4, 10, 100, NULL, 3, NULL, 'V000004', 'finalizada', 100, 0, 100, '2026-09-03 13:00:00', NOW()),
          (10, 10, 101, NULL, 1, NULL, 'V000010', 'finalizada', 700, 0, 700, '2026-09-01 09:00:00', NULL),
          (20, 20, 200, NULL, 4, NULL, 'V000020', 'finalizada', 900, 0, 900, '2026-09-01 09:00:00', NULL);
        INSERT INTO sale_items (sale_id, product_id, sku, description, quantity, unit_price_cents, discount_cents, total_cents) VALUES
          (1, 1, 'CAM-AZ', 'CAMISETA AZUL', 2.000, 6500, 1000, 12000);
        INSERT INTO sale_payments (sale_id, method, amount_cents, installments) VALUES (1, 'pix', 2000, NULL), (1, 'credit_card', 10000, 3);
        """, new { hash = PasswordHash });
}

public sealed class SalesApiTests(SalesFixture api) : IClassFixture<SalesFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Item(long Id, string Number, DateTime CreatedAt, string Status, long TotalCents, string? CustomerName, string? SellerName);
    private sealed record PageDto(List<Item> Items, long Total);
    private sealed record UnitDto(long Id, string Name);
    private sealed record MeDto(string UserName, UnitDto? Unit);
    private sealed record SaleItemDto(string Description, decimal Quantity, long UnitPriceCents, long DiscountCents, long TotalCents);
    private sealed record PaymentDto(string Method, long AmountCents, long? Installments);
    private sealed record DetailDto(long Id, string Status, string? SellerName, long SubtotalCents, long DiscountCents, long TotalCents,
        List<SaleItemDto> Items, List<PaymentDto> Payments);

    private static async Task<PageDto> List(HttpClient client, string query = "")
    {
        var response = await client.GetAsync($"/api/v1/sales{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PageDto>(Ct))!;
    }

    [Theory]
    [InlineData("ana", 101L)]   // preferência permitida
    [InlineData("bruno", 100L)] // preferência fora da restrição -> única permitida
    [InlineData("carla", 100L)] // sem preferência -> principal
    public async Task Unidade_da_sessao_segue_a_regra_da_web(string login, long expected)
    {
        TestDatabase.RequireMySql();
        var me = await (await api.SignedInAsync(login)).GetFromJsonAsync<MeDto>("/api/v1/me", Ct);
        Assert.Equal(expected, me!.Unit!.Id);
    }

    [Fact]
    public async Task Lista_so_a_unidade_da_sessao_em_ordem_decrescente_sem_excluidas()
    {
        TestDatabase.RequireMySql();
        Assert.Equal([10], (await List(await api.SignedInAsync("ana"))).Items.Select(i => i.Id));

        var carla = await List(await api.SignedInAsync("carla"));
        Assert.Equal([3, 2, 1], carla.Items.Select(i => i.Id));
        var v1 = carla.Items.Single(i => i.Id == 1);
        Assert.Equal(("MARIA SILVA", "JOAO VENDEDOR", 12000L), (v1.CustomerName, v1.SellerName, v1.TotalCents));
        Assert.Equal("Carla", carla.Items.Single(i => i.Id == 2).SellerName); // sem pessoa vendedora: usuário vendedor
        Assert.Equal(new DateTime(2026, 9, 1, 10, 0, 0), v1.CreatedAt);     // horário local como gravado pela web
    }

    [Theory]
    [InlineData("?status=devolucao", new long[] { 3 })]   // traz também a troca, como na web
    [InlineData("?status=pre_venda", new long[] { 2 })]
    [InlineData("?from=2026-09-02&to=2026-09-02", new long[] { 2 })]
    [InlineData("?search=maria", new long[] { 3, 1 })]
    [InlineData("?search=123.456.789-00", new long[] { 3, 1 })] // CPF do cliente com máscara
    [InlineData("?search=V000002", new long[] { 2 })]
    public async Task Filtros(string query, long[] expected)
    {
        TestDatabase.RequireMySql();
        Assert.Equal(expected, (await List(await api.SignedInAsync("carla"), query)).Items.Select(i => i.Id));
    }

    [Theory]
    [InlineData("?status=qualquer")]
    [InlineData("?from=2026-09-05&to=2026-09-01")]
    [InlineData("?pageSize=100")]
    public async Task Filtro_invalido_e_422(string query)
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("carla")).GetAsync($"/api/v1/sales{query}", Ct);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Detalhe_traz_itens_pagamentos_e_totais_em_centavos()
    {
        TestDatabase.RequireMySql();
        var sale = await (await api.SignedInAsync("carla")).GetFromJsonAsync<DetailDto>("/api/v1/sales/1", Ct);

        Assert.Equal((13000L, 1000L, 12000L), (sale!.SubtotalCents, sale.DiscountCents, sale.TotalCents));
        var item = Assert.Single(sale.Items);
        Assert.Equal(("CAMISETA AZUL", 2.000m, 6500L, 12000L), (item.Description, item.Quantity, item.UnitPriceCents, item.TotalCents));
        Assert.Equal([("pix", 2000L, (long?)null), ("credit_card", 10000L, 3L)], sale.Payments.Select(p => (p.Method, p.AmountCents, p.Installments)));
    }

    [Theory]
    [InlineData(10)] // outra unidade da mesma empresa
    [InlineData(20)] // outra empresa
    [InlineData(4)]  // excluída
    public async Task Venda_fora_do_escopo_e_404(long id)
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("carla")).GetAsync($"/api/v1/sales/{id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Sem_unidade_operavel_e_409()
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("diego")).GetAsync("/api/v1/sales", Ct);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Sem_sales_view_e_403()
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("eva")).GetAsync("/api/v1/sales", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
