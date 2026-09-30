using Dapper;
using Microsoft.Extensions.Logging;
using MySqlConnector;

namespace ComercialWeb.Mobile.Sales;

/// <summary>
/// Marca as vendas criadas pelo app (mobile_sale_origins). O push usa isso para não avisar o celular de uma venda que
/// ele mesmo acabou de fazer. Melhor esforço: falha aqui nunca derruba a venda (no pior caso o aviso chega).
/// </summary>
public sealed partial class SaleOrigins(MySqlDataSource db, TimeProvider clock, ILogger<SaleOrigins> logger)
{
    public async Task RecordAsync(long businessId, long saleId, CancellationToken ct)
    {
        try
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            await conn.ExecuteAsync(new CommandDefinition(
                "INSERT IGNORE INTO mobile_sale_origins (business_id, sale_id, created_at) VALUES (@businessId, @saleId, @now)",
                new { businessId, saleId, now = clock.GetUtcNow().UtcDateTime }, cancellationToken: ct));
        }
        catch (Exception e) when (e is MySqlException or InvalidOperationException && !ct.IsCancellationRequested)
        {
            LogFailed(logger, e.GetType().Name);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Não foi possível marcar a origem da venda do app ({Error}); o push dela pode chegar.")]
    private static partial void LogFailed(ILogger logger, string error);
}
