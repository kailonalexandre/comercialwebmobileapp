using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Identity.Tests;

/// <summary>
/// SQL real contra MySQL: isolamento entre tenants e regras de conta ativa.
/// Requer MOBILE_TEST_MYSQL (ex.: "Server=127.0.0.1;Port=3317;User ID=root;Password=...").
/// </summary>
public sealed class MySqlIdentityStoreTests : IAsyncLifetime
{
    private static readonly string? Server = Environment.GetEnvironmentVariable("MOBILE_TEST_MYSQL");
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly DateTimeOffset Now = new(2026, 9, 28, 12, 0, 0, TimeSpan.Zero);

    private readonly string _database = $"cw_mobile_test_{Guid.NewGuid():N}";
    private MySqlDataSource? _db;
    private MySqlIdentityStore Store => new(_db!);

    // Empresa A (10) e B (20). Ana: A ativa, B com vínculo inativo. Bruno: só B. Carla: desativada. Davi: excluído.
    public async ValueTask InitializeAsync()
    {
        if (Server is null) return;
        await using (var admin = new MySqlConnection(Server))
            await admin.ExecuteAsync($"CREATE DATABASE {_database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

        _db = new MySqlDataSource($"{Server};Database={_database};AllowUserVariables=true");
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync(await File.ReadAllTextAsync("Fixtures/laravel-schema.sql"));
        foreach (var file in Directory.GetFiles("migrations", "*.sql").Order(StringComparer.Ordinal))
            await conn.ExecuteAsync(await File.ReadAllTextAsync(file));
        await conn.ExecuteAsync("""
            INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active'), (20, 'Empresa B', 'active'), (30, 'Empresa C', 'suspended');
            INSERT INTO users (id, name, username, email, password, deactivated_at, deleted_at) VALUES
              (1, 'Ana', 'ana', 'ana@a.com', 'h', NULL, NULL),
              (2, 'Bruno', 'bruno', 'bruno@b.com', 'h', NULL, NULL),
              (3, 'Carla', 'carla', 'carla@a.com', 'h', NOW(), NULL),
              (4, 'Davi', 'davi', 'davi@a.com', 'h', NULL, NOW());
            INSERT INTO business_user (business_id, user_id, status) VALUES
              (10, 1, 'active'), (20, 1, 'inactive'), (30, 1, 'active'), (20, 2, 'active'), (10, 3, 'active'), (10, 4, 'active');
            INSERT INTO user_preferences (user_id, current_business_id) VALUES (1, 20);
            """);
    }

    public async ValueTask DisposeAsync()
    {
        if (_db is null) return;
        await _db.DisposeAsync();
        await using var admin = new MySqlConnection(Server);
        await admin.ExecuteAsync($"DROP DATABASE IF EXISTS {_database}");
    }

    private static void RequireMySql() => Assert.SkipWhen(Server is null, "MOBILE_TEST_MYSQL não configurada.");

    private async Task<Guid> NewSession(long userId, long businessId)
    {
        var id = Guid.NewGuid();
        var (_, hash) = TokenIssuer.NewRefreshToken();
        await Store.CreateSessionAsync(new NewSession(id, userId, businessId, "teste", Now, Now.AddDays(90)), new NewRefreshToken(hash, id, Now, Now.AddDays(30)), Ct);
        return id;
    }

    [Fact]
    public async Task Encontra_usuario_ativo_por_email_ou_username_e_ignora_desativado_e_excluido()
    {
        RequireMySql();
        Assert.Equal(1, (await Store.FindActiveUserAsync("ana@a.com", true, Ct))?.Id);
        Assert.Equal(1, (await Store.FindActiveUserAsync("ANA", false, Ct))?.Id);
        Assert.Null(await Store.FindActiveUserAsync("carla@a.com", true, Ct));
        Assert.Null(await Store.FindActiveUserAsync("davi@a.com", true, Ct));
        Assert.Null(await Store.FindActiveUserAsync("ana@a.com", false, Ct)); // e-mail não casa com a coluna username
    }

    [Fact]
    public async Task Preferencia_com_vinculo_inativo_e_empresa_suspensa_sao_ignoradas()
    {
        RequireMySql();
        // Preferência da Ana é B (vínculo inativo); C está suspensa. Sobra só A.
        Assert.Equal(10, await Store.ResolveActiveBusinessAsync(1, Ct));
        Assert.Equal(20, await Store.ResolveActiveBusinessAsync(2, Ct));
    }

    [Fact]
    public async Task Sessao_da_empresa_A_nunca_vale_para_a_empresa_B()
    {
        RequireMySql();
        var ana = await NewSession(1, 10);

        Assert.True(await Store.IsSessionActiveAsync(ana, 1, 10, Now, Ct));
        Assert.False(await Store.IsSessionActiveAsync(ana, 1, 20, Now, Ct)); // bid adulterado
        Assert.False(await Store.IsSessionActiveAsync(ana, 2, 10, Now, Ct)); // sub adulterado
    }

    [Fact]
    public async Task Sessao_cai_quando_vinculo_empresa_ou_usuario_deixam_de_estar_ativos()
    {
        RequireMySql();
        var ana = await NewSession(1, 10);
        await using var conn = await _db!.OpenConnectionAsync(Ct);

        await conn.ExecuteAsync("UPDATE business_user SET status = 'inactive' WHERE user_id = 1 AND business_id = 10");
        Assert.False(await Store.IsSessionActiveAsync(ana, 1, 10, Now, Ct));

        await conn.ExecuteAsync("UPDATE business_user SET status = 'active' WHERE user_id = 1 AND business_id = 10");
        await conn.ExecuteAsync("UPDATE businesses SET status = 'suspended' WHERE id = 10");
        Assert.False(await Store.IsSessionActiveAsync(ana, 1, 10, Now, Ct));

        await conn.ExecuteAsync("UPDATE businesses SET status = 'active' WHERE id = 10");
        await conn.ExecuteAsync("UPDATE users SET deactivated_at = NOW() WHERE id = 1");
        Assert.False(await Store.IsSessionActiveAsync(ana, 1, 10, Now, Ct));
    }

    [Fact]
    public async Task Refresh_token_so_rotaciona_uma_vez_mesmo_em_pedidos_simultaneos()
    {
        RequireMySql();
        var id = Guid.NewGuid();
        var (_, hash) = TokenIssuer.NewRefreshToken();
        await Store.CreateSessionAsync(new NewSession(id, 1, 10, null, Now, Now.AddDays(90)), new NewRefreshToken(hash, id, Now, Now.AddDays(30)), Ct);

        var attempts = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ =>
            new MySqlIdentityStore(_db!).RotateRefreshTokenAsync(hash, new NewRefreshToken(TokenIssuer.NewRefreshToken().Hash, id, Now, Now.AddDays(30)), Now, Ct)));

        Assert.Single(attempts, ok => ok);
        Assert.NotNull((await Store.FindRefreshTokenAsync(hash, Ct))?.UsedAt);
    }

    [Fact]
    public async Task Revogacao_invalida_a_sessao()
    {
        RequireMySql();
        var id = await NewSession(2, 20);
        await Store.RevokeSessionAsync(id, "logout", Now, Ct);
        Assert.False(await Store.IsSessionActiveAsync(id, 2, 20, Now, Ct));
    }
}
