using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Api;

/// <summary>
/// Aplica db/migrations/*.sql em ordem, uma vez cada. Executado pelo pipeline (`dotnet ComercialWeb.Mobile.Api.dll migrate`),
/// nunca na subida da API: em blue-green duas versões convivem e a migration precisa rodar uma vez, antes da troca.
/// </summary>
// ponytail: DDL no MySQL faz commit implícito, então uma migration com vários comandos não é atômica.
// Mantenha um passo expand/contract por arquivo; adote uma ferramenta de migrations se o volume crescer.
internal static class Migrator
{
    public static async Task RunAsync(MySqlDataSource db, string directory, TextWriter log)
    {
        await using var conn = await db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            CREATE TABLE IF NOT EXISTS mobile_schema_migrations (
                version VARCHAR(150) NOT NULL PRIMARY KEY,
                applied_at DATETIME(6) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """);
        var applied = (await conn.QueryAsync<string>("SELECT version FROM mobile_schema_migrations")).ToHashSet();

        foreach (var file in Directory.GetFiles(directory, "*.sql").Order(StringComparer.Ordinal))
        {
            var version = Path.GetFileNameWithoutExtension(file);
            if (applied.Contains(version)) continue;
            await conn.ExecuteAsync(await File.ReadAllTextAsync(file));
            await conn.ExecuteAsync("INSERT INTO mobile_schema_migrations (version, applied_at) VALUES (@version, UTC_TIMESTAMP(6))", new { version });
            await log.WriteLineAsync($"applied {version}");
        }
    }
}
