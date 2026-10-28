using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Dashboard;

public sealed record CountAndTotal(long Count, long TotalCents);

/// <summary>Meta do mês: `Scope` "company" (loja) ou "seller" (o próprio vendedor). `Percent` sem teto (pode passar de 100).</summary>
public sealed record SalesGoal(string Scope, long GoalCents, long SoldCents, int Percent);

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

    /// <summary>
    /// Card "Meta do mês" da web (DashboardAnalyticsService::salesGoal): meta da empresa no mês; sem ela, soma das metas dos
    /// vendedores; sem nenhuma, soma de `people.sales_goal` dos funcionários ativos. Vendido = faturamento líquido do mês
    /// até hoje (finalizada + troca − devolução), como os cards da aba Gráficos.
    /// </summary>
    public async Task<SalesGoal?> StoreGoalAsync(long businessId, DateOnly today, CancellationToken ct)
    {
        var month = new DateOnly(today.Year, today.Month, 1);
        await using var conn = await db.OpenConnectionAsync(ct);
        var row = await GoalTablesOptional(() => conn.QuerySingleAsync<GoalRow>(new CommandDefinition(
            $"""
            SELECT
              (SELECT CAST(COALESCE(SUM(amount_cents), 0) AS SIGNED) FROM sales_goals
                WHERE business_id = @businessId AND is_active = 1 AND year = @year AND month = @month AND scope = 'company') AS Monthly,
              (SELECT CAST(COALESCE(SUM(amount_cents), 0) AS SIGNED) FROM sales_goals
                WHERE business_id = @businessId AND is_active = 1 AND year = @year AND month = @month AND scope = 'seller') AS Sellers,
              (SELECT CAST(ROUND(COALESCE(SUM(sales_goal), 0) * 100) AS SIGNED) FROM people
                WHERE business_id = @businessId AND deleted_at IS NULL AND is_employee = 1 AND is_active = 1) AS Legacy,
              (SELECT CAST(COALESCE(SUM(CASE WHEN s.status = 'devolucao' THEN -CAST(s.total_cents AS SIGNED) ELSE s.total_cents END), 0) AS SIGNED) FROM sales s
                WHERE s.business_id = @businessId AND s.deleted_at IS NULL AND s.status IN ('finalizada', 'troca', 'devolucao')
                  AND {OccurredAt} >= @start AND {OccurredAt} < @end) AS Sold
            """,
            new { businessId, year = today.Year, month = today.Month, start = month.ToDateTime(TimeOnly.MinValue), end = today.AddDays(1).ToDateTime(TimeOnly.MinValue) },
            cancellationToken: ct)));
        if (row is null) return null;
        var goal = row.Monthly > 0 ? row.Monthly : row.Sellers > 0 ? row.Sellers : row.Legacy;
        return new SalesGoal("company", goal, row.Sold, Percent(row.Sold, goal));
    }

    /// <summary>
    /// Meta do próprio vendedor no mês (tela Metas da web, GoalReportService). Vendedor do usuário = vendedor padrão do vínculo
    /// ou o funcionário vinculado (UserDefaultSellerRepository::ownSellerId). Meta do cadastro de Metas; sem ela, a meta antiga
    /// do cadastro do vendedor (`people.sales_goal`), como o gráfico por vendedor. Realizado = GoalRepository::realizedByMonth:
    /// finalizada sem frete (nunca negativa) − devolução, no mês inteiro. Usuário sem vendedor: null.
    /// </summary>
    public async Task<SalesGoal?> SellerGoalAsync(long businessId, long userId, DateOnly today, CancellationToken ct)
    {
        var start = new DateOnly(today.Year, today.Month, 1);
        await using var conn = await db.OpenConnectionAsync(ct);
        var seller = await conn.ExecuteScalarAsync<long?>(new CommandDefinition(
            """
            SELECT CAST(COALESCE(NULLIF(default_seller_person_id, 0), NULLIF(employee_person_id, 0)) AS SIGNED)
            FROM business_user WHERE business_id = @businessId AND user_id = @userId AND status = 'active' LIMIT 1
            """,
            new { businessId, userId }, cancellationToken: ct));
        if (seller is not { } sellerId) return null;

        var row = await GoalTablesOptional(() => conn.QuerySingleAsync<GoalRow>(new CommandDefinition(
            """
            SELECT
              (SELECT CAST(COALESCE(MAX(amount_cents), 0) AS SIGNED) FROM sales_goals
                WHERE business_id = @businessId AND is_active = 1 AND year = @year AND month = @month AND scope = 'seller' AND seller_person_id = @sellerId) AS Monthly,
              0 AS Sellers,
              (SELECT CAST(ROUND(COALESCE(MAX(sales_goal), 0) * 100) AS SIGNED) FROM people WHERE id = @sellerId AND business_id = @businessId) AS Legacy,
              (SELECT CAST(COALESCE(SUM(CASE WHEN status = 'devolucao' THEN -CAST(total_cents AS SIGNED)
                                             WHEN total_cents > freight_cents THEN total_cents - freight_cents ELSE 0 END), 0) AS SIGNED)
                FROM sales WHERE business_id = @businessId AND deleted_at IS NULL AND status IN ('finalizada', 'devolucao') AND seller_person_id = @sellerId
                  AND occurred_at >= @start AND occurred_at < @end) AS Sold
            """,
            new { businessId, sellerId, year = today.Year, month = today.Month, start = start.ToDateTime(TimeOnly.MinValue), end = start.AddMonths(1).ToDateTime(TimeOnly.MinValue) },
            cancellationToken: ct)));
        if (row is null) return null;
        var goal = row.Monthly > 0 ? row.Monthly : row.Legacy;
        return new SalesGoal("seller", goal, row.Sold, Percent(Math.Max(0, row.Sold), goal));
    }

    private sealed record GoalRow(long Monthly, long Sellers, long Legacy, long Sold);

    // round() do PHP: o meio arredonda para longe do zero. Sem meta, 0%.
    private static int Percent(long sold, long goal) =>
        goal > 0 ? (int)Math.Round(sold * 100m / goal, MidpointRounding.AwayFromZero) : 0;

    // Metas (sales_goals, people.sales_goal) são de outubro/2026 no ComercialWeb: banco ainda sem elas fica sem o card, sem 500.
    private static async Task<GoalRow?> GoalTablesOptional(Func<Task<GoalRow>> query)
    {
        try
        {
            return await query();
        }
        catch (MySqlException e) when (e.ErrorCode is MySqlErrorCode.NoSuchTable or MySqlErrorCode.BadFieldError)
        {
            return null;
        }
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
