using System.Net;
using System.Net.Http.Headers;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Identity;

public sealed class SwitchBusinessFixture : ApiFixture
{
    // ana: A e B. bruno: só A. carla: A e B com vínculo inativo em B. Clientes diferentes em cada empresa.
    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES
          (1, 'Ana', 'ana', 'ana@a.com', @hash), (2, 'Bruno', 'bruno', 'bruno@a.com', @hash), (3, 'Carla', 'carla', 'carla@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active'), (20, 1, 'active'), (10, 2, 'active'), (10, 3, 'active'), (20, 3, 'inactive');
        INSERT INTO permissions (id, name, guard_name) VALUES (1, 'people.view', 'web');
        INSERT INTO model_has_permissions (permission_id, model_type, model_id, business_id) VALUES (1, 'App\\Models\\User', 1, 10), (1, 'App\\Models\\User', 1, 20);
        INSERT INTO people (id, business_id, code, person_kind, name, is_client) VALUES (1, 10, 1, 'individual', 'CLIENTE DA A', 1), (2, 20, 1, 'individual', 'CLIENTE DA B', 1);
        """, new { hash = PasswordHash });
}

public sealed class SwitchBusinessApiTests(SwitchBusinessFixture api) : IClassFixture<SwitchBusinessFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Session(string AccessToken, string RefreshToken);
    private sealed record Switched(string AccessToken, long BusinessId, string BusinessName);

    private async Task<(HttpClient Client, Session Session)> Login(string login)
    {
        var client = api.Anonymous();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { login, password = ApiFixture.Password }, Ct);
        response.EnsureSuccessStatusCode();
        var session = (await response.Content.ReadFromJsonAsync<Session>(Ct))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return (client, session);
    }

    [Fact]
    public async Task Lista_so_as_empresas_com_vinculo_ativo()
    {
        TestDatabase.RequireMySql();
        var (ana, _) = await Login("ana");
        var json = await ana.GetStringAsync("/api/v1/me/businesses", Ct);
        Assert.Contains("Empresa A", json, StringComparison.Ordinal);
        Assert.Contains("Empresa B", json, StringComparison.Ordinal);
        Assert.Contains("\"currentBusinessId\":10", json, StringComparison.Ordinal);

        var (carla, _) = await Login("carla");
        var carlaJson = await carla.GetStringAsync("/api/v1/me/businesses", Ct);
        Assert.DoesNotContain("Empresa B", carlaJson, StringComparison.Ordinal); // vínculo inativo não conta
    }

    [Fact]
    public async Task Troca_muda_a_empresa_dos_dados_e_invalida_o_token_antigo()
    {
        TestDatabase.RequireMySql();
        var (ana, session) = await Login("ana");
        Assert.Contains("CLIENTE DA A", await ana.GetStringAsync("/api/v1/customers", Ct), StringComparison.Ordinal);

        var response = await ana.PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 20 }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var switched = (await response.Content.ReadFromJsonAsync<Switched>(Ct))!;
        Assert.Equal(20, switched.BusinessId);
        Assert.Equal("Empresa B", switched.BusinessName);

        // Token antigo (empresa A) morre na hora: nenhuma chamada em voo mistura dados das duas empresas.
        Assert.Equal(HttpStatusCode.Unauthorized, (await ana.GetAsync("/api/v1/customers", Ct)).StatusCode);

        ana.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", switched.AccessToken);
        var customers = await ana.GetStringAsync("/api/v1/customers", Ct);
        Assert.Contains("CLIENTE DA B", customers, StringComparison.Ordinal);
        Assert.DoesNotContain("CLIENTE DA A", customers, StringComparison.Ordinal);
        Assert.Contains("\"businessId\":20", await ana.GetStringAsync("/api/v1/me", Ct), StringComparison.Ordinal);

        // O refresh da sessão continua valendo e renova já na empresa nova.
        var refreshed = await api.Anonymous().PostAsJsonAsync("/api/v1/auth/refresh", new { session.RefreshToken }, Ct);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var after = (await refreshed.Content.ReadFromJsonAsync<Session>(Ct))!;
        ana.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", after.AccessToken);
        Assert.Contains("\"businessId\":20", await ana.GetStringAsync("/api/v1/me", Ct), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Recusa_empresa_sem_vinculo_inativa_ou_pedido_invalido()
    {
        TestDatabase.RequireMySql();
        var (bruno, _) = await Login("bruno");
        Assert.Equal(HttpStatusCode.Forbidden, (await bruno.PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 20 }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await bruno.PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 0 }, Ct)).StatusCode);
        Assert.Contains("\"businessId\":10", await bruno.GetStringAsync("/api/v1/me", Ct), StringComparison.Ordinal); // sessão intacta após a recusa

        var (carla, _) = await Login("carla");
        Assert.Equal(HttpStatusCode.Forbidden, (await carla.PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 20 }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().PostAsJsonAsync("/api/v1/auth/switch-business", new { businessId = 10 }, Ct)).StatusCode);
    }
}
