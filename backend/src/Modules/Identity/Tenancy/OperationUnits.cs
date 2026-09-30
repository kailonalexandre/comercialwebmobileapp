using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Identity.Tenancy;

public sealed record OperationUnit(long Id, string Name);

/// <summary>
/// Unidade de operação (loja/filial) atual. Espelha App\Shared\Tenancy\CurrentLocation da web, inclusive a
/// preferência do navegador (user_preferences.current_location_id): app e web operam sempre na mesma unidade,
/// e a pré-venda enviada ao ComercialWeb cai na unidade que o app mostra.
/// Candidatas = unidades ativas da empresa; se o usuário tiver unidades permitidas (user_storage_locations),
/// só elas. Escolha: preferida (se permitida) → principal (primary_marker) → primeira por nome.
/// Obs.: como na web, a lista de permitidas não é filtrada por empresa.
/// </summary>
public sealed class OperationUnits(MySqlDataSource db)
{
    private const string ResolveSql = """
        SELECT CAST(sl.id AS SIGNED) AS Id, sl.name AS Name
        FROM storage_locations sl
        WHERE sl.business_id = @businessId AND sl.type = 'unit' AND sl.is_active = 1
          AND (NOT EXISTS (SELECT 1 FROM user_storage_locations a WHERE a.user_id = @userId)
               OR EXISTS (SELECT 1 FROM user_storage_locations a WHERE a.user_id = @userId AND a.storage_location_id = sl.id))
        ORDER BY sl.id <=> (SELECT current_location_id FROM user_preferences WHERE user_id = @userId LIMIT 1) DESC, sl.primary_marker IS NULL, sl.name, sl.id
        LIMIT 1
        """;

    /// <summary>Unidade atual, resolvida a cada chamada. Null: empresa sem unidade operável para o usuário.</summary>
    public async Task<OperationUnit?> CurrentAsync(long userId, long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QueryFirstOrDefaultAsync<OperationUnit>(new CommandDefinition(
            ResolveSql, new { userId, businessId }, cancellationToken: ct));
    }
}
