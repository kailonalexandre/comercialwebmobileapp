using System.Net;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Identity;

public sealed class PermissionsFixture : ApiFixture
{
    // ana: papel com products.view + sales.view em A. bruno: sales.create direto só na empresa B (sessão abre em A). carla: nada.
    // root: admin de plataforma membro de A.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'A', 'active'), (20, 'B', 'active');
        INSERT INTO users (id, name, username, email, password, is_platform_admin) VALUES
          (1, 'Ana', 'ana', 'ana@a.com', @hash, 0), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash, 0),
          (3, 'Carla', 'carla', 'carla@a.com', @hash, 0), (4, 'Root', 'root', 'root@a.com', @hash, 1);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (10, 2, 'active'), (20, 2, 'active'), (10, 3, 'active'), (10, 4, 'active');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'products.view', 'web'), (2, 'sales.view', 'web'), (3, 'sales.create', 'web');
        INSERT INTO roles (id, business_id, name, guard_name) VALUES (1, 10, 'Vendedor', 'web');
        INSERT INTO role_has_permissions (permission_id, role_id) VALUES (1, 1), (2, 1);
        INSERT INTO model_has_roles (role_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10);
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (3, 'App\\Models\\User', 2, 20);
        """, new { hash = PasswordHash });
}

public sealed class PermissionsEndpointTests(PermissionsFixture api) : IClassFixture<PermissionsFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Dto(List<string> Permissions);

    private async Task<List<string>> For(string login) =>
        (await (await api.SignedInAsync(login)).GetFromJsonAsync<Dto>("/api/v1/me/permissions", Ct))!.Permissions;

    [Fact]
    public async Task Sem_token_e_401()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync("/api/v1/me/permissions", Ct)).StatusCode);
    }

    [Fact]
    public async Task Devolve_so_as_permissoes_do_usuario_na_empresa_da_sessao()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(["products.view", "sales.view"], await For("ana"));
        Assert.Empty(await For("bruno")); // sales.create existe só na empresa B
        Assert.Empty(await For("carla"));
    }

    [Fact]
    public async Task Admin_de_plataforma_recebe_todas_as_permissoes_do_app()
    {
        TestDatabase.RequireMySql();
        Assert.Equal(
            ["products.view", "people.view", "sales.view", "sales.create", "pdv.access", "financial.receivables.view", "inventory.view"],
            await For("root"));
    }
}
