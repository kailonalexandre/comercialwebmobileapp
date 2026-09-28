using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Tests.Support;

/// <summary>
/// Banco MySQL descartável com o schema espelho do ComercialWeb + migrations mobile.
/// Requer MOBILE_TEST_MYSQL (ex.: "Server=127.0.0.1;Port=3317;User ID=root;Password=..."); sem ela os testes são pulados.
/// </summary>
public sealed class TestDatabase : IAsyncLifetime
{
    public static readonly string? Server = Environment.GetEnvironmentVariable("MOBILE_TEST_MYSQL");

    private readonly string _name = $"cw_mobile_test_{Guid.NewGuid():N}";

    public string ConnectionString => $"{Server};Database={_name};AllowUserVariables=true";

    public MySqlDataSource? DataSource { get; private set; }

    public static void RequireMySql() => Assert.SkipWhen(Server is null, "MOBILE_TEST_MYSQL não configurada.");

    public async ValueTask InitializeAsync()
    {
        if (Server is null) return;
        await using (var admin = new MySqlConnection(Server))
            await admin.ExecuteAsync($"CREATE DATABASE {_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

        DataSource = new MySqlDataSource(ConnectionString);
        await using var conn = await DataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(await File.ReadAllTextAsync("Fixtures/laravel-schema.sql"));
        foreach (var file in Directory.GetFiles("migrations", "*.sql").Order(StringComparer.Ordinal))
            await conn.ExecuteAsync(await File.ReadAllTextAsync(file));
    }

    public async Task ExecuteAsync(string sql, object? args = null)
    {
        await using var conn = await DataSource!.OpenConnectionAsync();
        await conn.ExecuteAsync(sql, args);
    }

    public async ValueTask DisposeAsync()
    {
        if (DataSource is null) return;
        await DataSource.DisposeAsync();
        await using var admin = new MySqlConnection(Server);
        await admin.ExecuteAsync($"DROP DATABASE IF EXISTS {_name}");
    }
}
