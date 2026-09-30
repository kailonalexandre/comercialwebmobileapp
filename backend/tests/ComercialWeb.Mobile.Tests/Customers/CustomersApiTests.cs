using System.Net;
using System.Text.Json;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Customers;

public sealed class CustomersFixture : ApiFixture
{
    // Empresa A (10) e B (20). ana: papel com people.view em A. bruno: membro de A sem permissão.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'people.view', 'web');
        INSERT INTO roles (id, business_id, name, guard_name) VALUES (1, 10, 'Vendedor', 'web');
        INSERT INTO role_has_permissions (permission_id, role_id) VALUES (1, 1);
        INSERT INTO model_has_roles (role_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        INSERT INTO people (id, business_id, code, person_kind, name, trade_name, document, phone, mobile, email, credit_limit,
                            restriction_alert, restriction_block, restriction_reason, main_address, notes, is_client, is_supplier, is_active, deleted_at) VALUES
          (1, 10, 1, 'individual', 'MARIA SILVA', NULL, '12345678900', NULL, '11988887777', 'maria@x.com', 5000.00,
           1, 0, 'Atrasou 2 parcelas', '{"street":"RUA A","number":"10","district":"CENTRO","city":"SAO PAULO","state":"SP","zip":"01001000","ibge_code":"3550308"}',
           'Observação interna', 1, 0, 1, NULL),
          (2, 10, 2, 'company', 'LOJA BOA LTDA', 'LOJA BOA', '11222333000181', '1133334444', NULL, NULL, NULL,
           0, 1, NULL, '{"city":"CAMPINAS","state":"SP"}', NULL, 1, 1, 1, NULL),
          (3, 10, 3, 'company', 'SÓ FORNECEDOR', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, 0, 1, 1, NULL),
          (4, 10, 4, 'individual', 'CLIENTE INATIVO', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 0, 0, NULL),
          (5, 10, 5, 'individual', 'CLIENTE EXCLUIDO', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 0, 1, NOW()),
          (6, 20, 1, 'individual', 'CLIENTE DA EMPRESA B', NULL, '98765432100', NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 0, 1, NULL);
        """, new { hash = PasswordHash });
}

public sealed class CustomersApiTests(CustomersFixture api) : IClassFixture<CustomersFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Item(long Id, string Name, string? Document, string? Phone, string? City, string? State, bool RestrictionAlert, bool RestrictionBlock);
    private sealed record PageDto(List<Item> Items, long Total);

    private static async Task<PageDto> List(HttpClient client, string query = "")
    {
        var response = await client.GetAsync($"/api/v1/customers{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PageDto>(Ct))!;
    }

    [Fact]
    public async Task Lista_so_clientes_ativos_da_empresa_da_sessao()
    {
        TestDatabase.RequireMySql();
        var page = await List(await api.SignedInAsync("ana"));

        // Fornecedor puro, inativo, excluído e cliente da empresa B ficam de fora.
        Assert.Equal([2, 1], page.Items.Select(i => i.Id));
        var maria = page.Items.Single(i => i.Id == 1);
        Assert.Equal(("11988887777", "SAO PAULO", "SP", true, false), (maria.Phone, maria.City, maria.State, maria.RestrictionAlert, maria.RestrictionBlock));
        Assert.True(page.Items.Single(i => i.Id == 2).RestrictionBlock);
    }

    [Theory]
    [InlineData("?search=123.456.789-00", new long[] { 1 })] // CPF com máscara acha o documento gravado só com dígitos
    [InlineData("?search=(11) 3333", new long[] { 2 })]      // telefone com máscara
    [InlineData("?search=loja boa", new long[] { 2 })]       // nome fantasia, sem diferenciar caixa
    [InlineData("?search=98765432100", new long[0])]         // documento de cliente de outra empresa
    [InlineData("?includeInactive=true", new long[] { 4, 2, 1 })]
    public async Task Busca_e_filtros(string query, long[] expected)
    {
        TestDatabase.RequireMySql();
        Assert.Equal(expected, (await List(await api.SignedInAsync("ana"), query)).Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Detalhe_traz_endereco_e_nao_expoe_dados_financeiros_nem_observacoes()
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("ana")).GetAsync("/api/v1/customers/1", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync(Ct);
        using var doc = JsonDocument.Parse(json);
        Assert.Equal("RUA A", doc.RootElement.GetProperty("mainAddress").GetProperty("street").GetString());
        Assert.Equal("maria@x.com", doc.RootElement.GetProperty("email").GetString());
        foreach (var hidden in new[] { "5000", "Atrasou", "Observação", "creditLimit", "notes", "restrictionReason", "ibge" })
            Assert.DoesNotContain(hidden, json, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(3)] // fornecedor, não cliente
    [InlineData(5)] // excluído
    [InlineData(6)] // outra empresa
    public async Task Detalhe_fora_do_escopo_e_404(long id)
    {
        TestDatabase.RequireMySql();
        var response = await (await api.SignedInAsync("ana")).GetAsync($"/api/v1/customers/{id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Sem_people_view_e_403()
    {
        TestDatabase.RequireMySql();
        var bruno = await api.SignedInAsync("bruno");
        Assert.Equal(HttpStatusCode.Forbidden, (await bruno.GetAsync("/api/v1/customers", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bruno.GetAsync("/api/v1/customers/1", Ct)).StatusCode);
    }

    [Fact]
    public async Task Paginacao_abusiva_e_422()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await ana.GetAsync("/api/v1/customers?pageSize=500", Ct)).StatusCode);
    }
}
