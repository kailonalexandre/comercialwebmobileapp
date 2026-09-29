using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Dashboard;

public sealed record CountAndTotal(long Count, long TotalCents);

public sealed record RecentSale(long Id, string? Number, string? CustomerName, long TotalCents, DateTime OccurredAt, string Status);

/// <summary>
/// Mesmas consultas do DashboardRepository da web. Escopo: empresa inteira (todas as unidades), sem excluídos —
/// o dashboard da web não filtra por unidade. Datas no horário local da empresa, como gravadas pela web.
/// </summary>
public sealed class DashboardQueries(MySqlDataSource db)
{
    public const int RecentSalesLimit = 8; // DashboardService::RECENT_SALES_LIMIT

    private const string OccurredAt = "COALESCE(s.occurred_at, s.created_at)";

    public async Task<CountAndTotal> SalesOfDayAsync(long businessId, DateOnly day, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleAsync<CountAndTotal>(new CommandDefinition(
            $"""
            SELECT COUNT(*) AS Count, CAST(COALESCE(SUM(s.total_cents), 0) AS SIGNED) AS TotalCents
            FROM sales s
            WHERE s.business_id = @businessId AND s.deleted_at IS NULL AND s.status = 'finalizada'
              AND {OccurredAt} >= @start AND {OccurredAt} < @end
            """,
            new { businessId, start = day.ToDateTime(TimeOnly.MinValue), end = day.AddDays(1).ToDateTime(TimeOnly.MinValue) }, cancellationToken: ct));
    }

    // FinancialTitle usa a tabela financial_lines. Títulos agrupados em outro não contam duas vezes.
    public async Task<CountAndTotal> OpenReceivablesAsync(long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleAsync<CountAndTotal>(new CommandDefinition(
            """
            SELECT COUNT(*) AS Count, CAST(COALESCE(SUM(amount_cents - paid_cents), 0) AS SIGNED) AS TotalCents
            FROM financial_lines
            WHERE business_id = @businessId AND deleted_at IS NULL AND type = 'receivable' AND status = 'open' AND grouped_into_id IS NULL
            """,
            new { businessId }, cancellationToken: ct));
    }

    // Saldo negativo, ou mínimo configurado (produto; senão soma das variações) com saldo no mínimo ou abaixo.
    public async Task<long> LowStockCountAsync(long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<long>(new CommandDefinition(
            """
            SELECT COUNT(*) FROM (
              SELECT p.id
              FROM products p
              LEFT JOIN stock_balances sb ON sb.product_id = p.id
              LEFT JOIN (SELECT product_id, COALESCE(SUM(minimum_stock), 0) AS minimum_stock FROM product_variations GROUP BY product_id) vm
                ON vm.product_id = p.id
              WHERE p.business_id = @businessId AND p.deleted_at IS NULL AND p.is_active = 1
              GROUP BY p.id, p.minimum_quantity, vm.minimum_stock
              HAVING COALESCE(SUM(sb.quantity_milli), 0) / 1000 < 0
                  OR (COALESCE(NULLIF(p.minimum_quantity, 0), vm.minimum_stock, 0) > 0
                      AND COALESCE(SUM(sb.quantity_milli), 0) / 1000 <= COALESCE(NULLIF(p.minimum_quantity, 0), vm.minimum_stock, 0))
            ) low
            """,
            new { businessId }, cancellationToken: ct));
    }

    public async Task<CountAndTotal> OpenConditionalsAsync(long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleAsync<CountAndTotal>(new CommandDefinition(
            """
            SELECT COUNT(*) AS Count, CAST(COALESCE(SUM(total_cents), 0) AS SIGNED) AS TotalCents
            FROM conditionals WHERE business_id = @businessId AND status = 'aberto'
            """,
            new { businessId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<RecentSale>> RecentSalesAsync(long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<RecentSale>(new CommandDefinition(
            $"""
            SELECT CAST(s.id AS SIGNED) AS Id, s.number AS Number, c.name AS CustomerName,
                   CAST(s.total_cents AS SIGNED) AS TotalCents, {OccurredAt} AS OccurredAt, s.status AS Status
            FROM sales s LEFT JOIN people c ON c.id = s.customer_person_id AND c.business_id = s.business_id
            WHERE s.business_id = @businessId AND s.deleted_at IS NULL
            ORDER BY {OccurredAt} DESC, s.id DESC
            LIMIT {RecentSalesLimit}
            """,
            new { businessId }, cancellationToken: ct))).AsList();
    }
}
