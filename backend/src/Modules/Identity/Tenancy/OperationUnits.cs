using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Identity.Tenancy;

public sealed record OperationUnit(long Id, string Name);

/// <summary>
/// Unidade de operação (loja/filial) da sessão. Espelha App\Shared\Tenancy\CurrentLocation da web:
/// candidatas = unidades ativas da empresa; se o usuário tiver unidades permitidas (user_storage_locations),
/// só elas. Escolha: preferida (se ainda permitida) → principal (primary_marker) → primeira por nome.
/// Obs.: como na web, a lista de permitidas não é filtrada por empresa.
/// </summary>
public sealed class OperationUnits(MySqlDataSource db)
{
    internal const string ResolveSql = """
        SELECT CAST(sl.id AS SIGNED) AS Id, sl.name AS Name
        FROM storage_locations sl
        WHERE sl.business_id = @businessId AND sl.type = 'unit' AND sl.is_active = 1
          AND (NOT EXISTS (SELECT 1 FROM user_storage_locations a WHERE a.user_id = @userId)
               OR EXISTS (SELECT 1 FROM user_storage_locations a WHERE a.user_id = @userId AND a.storage_location_id = sl.id))
        ORDER BY sl.id = @preferredId DESC, sl.primary_marker IS NULL, sl.name, sl.id
        LIMIT 1
        """;

    /// <summary>Unidade atual da sessão, revalidada a cada chamada. Null: empresa sem unidade operável para o usuário.</summary>
    public async Task<OperationUnit?> ForSessionAsync(Guid sessionId, long userId, long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QueryFirstOrDefaultAsync<OperationUnit>(new CommandDefinition(
            ResolveSql.Replace("@preferredId", "(SELECT location_id FROM mobile_sessions WHERE id = @sessionId)", StringComparison.Ordinal),
            new { sessionId = sessionId.ToString(), userId, businessId }, cancellationToken: ct));
    }
}
