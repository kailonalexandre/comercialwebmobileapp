using System.Net;
using ComercialWeb.Mobile.Catalog;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Catalog;

public sealed class CatalogFixture : ApiFixture
{
    // Empresa A (10) e B (20).
    // ana:   papel "Vendedor" com products.view em A.
    // bruno: membro de A sem permissão.
    // carla: membro de A e B; products.view atribuída direto só em B. Sessão abre em A (menor id).
    // root:  admin de plataforma, membro de A, sem papel.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password, is_platform_admin) VALUES
          (1, 'Ana', 'ana', 'ana@a.com', @hash, 0), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash, 0),
          (3, 'Carla', 'carla', 'carla@a.com', @hash, 0), (4, 'Root', 'root', 'root@infinit.com', @hash, 1);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active'), (10, 3, 'active'), (20, 3, 'active'), (10, 4, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'products.view', 'web'), (2, 'sales.oversell-stock', 'web');
        INSERT INTO roles (id, business_id, name, guard_name) VALUES (1, 10, 'Vendedor', 'web');
        INSERT INTO role_has_permissions (permission_id, role_id) VALUES (1, 1);
        INSERT INTO model_has_roles (role_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 3, 20);
        INSERT INTO products (id, business_id, code, name, sku, barcode, description, cost_price, sale_price, is_active, deleted_at) VALUES
          (100, 10, 1, 'Camiseta Azul', 'CAM-AZ', '0789123456784', 'Algodão', 20.00, 59.90, 1, NULL),
          (101, 10, 2, 'Calça 50% algodão', NULL, NULL, NULL, 50.00, 149.00, 1, NULL),
          (102, 10, 3, 'Boné', NULL, NULL, NULL, 10.00, 39.90, 0, NULL),
          (103, 10, 4, 'Produto excluído', NULL, NULL, NULL, 1.00, 2.00, 1, NOW()),
          (200, 20, 1, 'Produto da empresa B', NULL, NULL, NULL, 1.00, 9.99, 1, NULL);
        INSERT INTO product_variations (business_id, product_id, reference, barcode) VALUES (10, 101, 'REF-XYZ', NULL);
        """, new { hash = PasswordHash });
}

public sealed class ProductsApiTests(CatalogFixture api) : IClassFixture<CatalogFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Item(long Id, long Code, string Name, long SalePriceCents, bool IsActive);
    private sealed record PageDto(List<Item> Items, int Page, int PageSize, long Total);

    private static async Task<PageDto> List(HttpClient client, string query = "")
    {
        var response = await client.GetAsync($"/api/v1/products{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PageDto>(Ct))!;
    }

    [Fact]
    public async Task Sem_token_e_401()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync("/api/v1/products", Ct)).StatusCode);
    }

    [Fact]
    public async Task Lista_so_produtos_ativos_da_empresa_da_sessao_com_preco_em_centavos()
    {
        TestDatabase.RequireMySql();
        var page = await List(await api.SignedInAsync("ana"));

        Assert.Equal([101, 100], page.Items.Select(i => i.Id)); // ordem por nome: "Calça" antes de "Camiseta"
        Assert.Equal(2, page.Total);
        Assert.Equal(5990, page.Items.Single(i => i.Id == 100).SalePriceCents);
    }

    [Fact]
    public async Task Produto_de_outra_empresa_responde_404_e_nao_403()
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");

        Assert.Equal(HttpStatusCode.NotFound, (await ana.GetAsync("/api/v1/products/200", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ana.GetAsync("/api/v1/products/103", Ct)).StatusCode); // excluído
        Assert.Equal(HttpStatusCode.OK, (await ana.GetAsync("/api/v1/products/100", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("bruno")] // sem permissão alguma
    [InlineData("carla")] // tem a permissão só na empresa B; a sessão está em A
    public async Task Sem_permissao_no_tenant_da_sessao_e_403(string login)
    {
        TestDatabase.RequireMySql();
        var client = await api.SignedInAsync(login);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/products", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/products/100", Ct)).StatusCode);
    }

    [Fact]
    public async Task Admin_de_plataforma_membro_da_empresa_tem_acesso()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(2, (await List(await api.SignedInAsync("root"))).Total);
    }

    [Theory]
    [InlineData("?search=algodão", new long[] { 101 })]
    [InlineData("?search=789123456784", new long[] { 100 })] // UPC-A encontra o EAN-13 com zero à esquerda
    [InlineData("?search=REF-XYZ", new long[] { 101 })]      // referência da variação
    [InlineData("?search=2", new long[] { 101, 100 })]       // código exato (101) + código de barras que contém "2" (100)
    [InlineData("?search=50%25", new long[] { 101 })]        // "%" é texto
    [InlineData("?search=%25", new long[] { 101 })]          // "%" sozinho não vira curinga: só quem tem "%" no nome
    [InlineData("?includeInactive=true", new long[] { 102, 101, 100 })]
    public async Task Busca_e_filtros(string query, long[] expected)
    {
        TestDatabase.RequireMySql();
        var page = await List(await api.SignedInAsync("ana"), query);
        Assert.Equal(expected, page.Items.Select(i => i.Id));
    }

    [Theory]
    [InlineData("?pageSize=51")]
    [InlineData("?pageSize=0")]
    [InlineData("?page=0")]
    [InlineData("?page=10001")]
    public async Task Paginacao_abusiva_e_422(string query)
    {
        TestDatabase.RequireMySql();
        var ana = await api.SignedInAsync("ana");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await ana.GetAsync($"/api/v1/products{query}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Paginacao_respeita_tamanho_e_total()
    {
        TestDatabase.RequireMySql();
        var page = await List(await api.SignedInAsync("ana"), "?pageSize=1&page=2");
        Assert.Equal([100], page.Items.Select(i => i.Id));
        Assert.Equal(2, page.Total);
    }

    [Fact]
    public async Task Admin_de_plataforma_nao_recebe_alcadas_discricionarias()
    {
        TestDatabase.RequireMySql();
        var checker = new MySqlPermissionChecker(api.Db.DataSource!);
        Assert.True(await checker.HasAsync(4, 10, CatalogModule.ViewProducts, Ct));
        Assert.False(await checker.HasAsync(4, 10, "sales.oversell-stock", Ct));
    }

    [Theory]
    [InlineData("sales.final-consumer.discount", true)]
    [InlineData("inventory.allow-negative", true)]
    [InlineData("products.view", false)]
    public void Alcadas_discricionarias_seguem_a_lista_da_web(string permission, bool expected) =>
        Assert.Equal(expected, MySqlPermissionChecker.IsDiscretionary(permission));
}
