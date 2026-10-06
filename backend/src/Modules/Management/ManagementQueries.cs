using ComercialWeb.Mobile.Common;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Management;

public sealed record TitleItem(
    long Id, string? Description, string? Document, string? PersonName, DateTime DueDate,
    long AmountCents, long PaidCents, long OpenCents, string Status, bool Overdue, int InstallmentNumber, int InstallmentCount);

// Linha crua: MySQL devolve a comparação (vencido) como inteiro; a API expõe bool.
internal sealed record TitleRow(
    long Id, string? Description, string? Document, string? PersonName, DateTime DueDate,
    long AmountCents, long PaidCents, long OpenCents, string Status, long Overdue, long InstallmentNumber, long InstallmentCount)
{
    public TitleItem ToItem() => new(Id, Description, Document, PersonName, DueDate, AmountCents, PaidCents, OpenCents, Status, Overdue != 0, (int)InstallmentNumber, (int)InstallmentCount);
}

public sealed record TitleTotals(long Count, long TotalCents);

public sealed record FinancialSummary(TitleTotals? ReceivablesOpen, TitleTotals? ReceivablesOverdue, TitleTotals? PayablesOpen, TitleTotals? PayablesOverdue);

public sealed record PurchaseItem(long Id, string Number, string Kind, string Status, string? SupplierName, DateTime OrderedAt, long TotalCents, bool IsUrgent);

public sealed record SalesDay(DateTime Day, long Count, long TotalCents);

public sealed record SalesByMethod(string Method, long Count, long TotalCents);

public sealed record SalesReport(DateOnly From, DateOnly To, long Count, long TotalCents, long AverageTicketCents, IReadOnlyList<SalesDay> ByDay, IReadOnlyList<SalesByMethod> ByMethod);

/// <summary>
/// Consultas de gestão (financeiro, compras, relatórios), somente leitura, da empresa inteira da sessão
/// (como o dashboard da web). Datas no horário local da empresa.
/// </summary>
public sealed class ManagementQueries(MySqlDataSource db)
{
    public static readonly IReadOnlySet<string> TitleStatuses = new HashSet<string>(StringComparer.Ordinal) { "open", "overdue", "paid" };

    // Títulos agrupados em outro (grouped_into_id) não contam duas vezes, como no dashboard.
    private const string TitleScope = "f.business_id = @businessId AND f.deleted_at IS NULL AND f.grouped_into_id IS NULL AND f.type = @type";

    public async Task<PagedResult<TitleItem>> TitlesAsync(long businessId, string type, string? status, string? search, DateOnly today, Paging paging, CancellationToken ct)
    {
        var term = SqlText.NormalizeSearch(search);
        var args = new
        {
            businessId,
            type,
            status,
            today = today.ToDateTime(TimeOnly.MinValue),
            term,
            like = term is null ? null : SqlText.ContainsPattern(term),
            offset = paging.Offset,
            pageSize = paging.PageSize,
        };
        // "overdue" = em aberto e vencido; "open" = em aberto (inclui vencidos); "paid" = quitado.
        const string where = $"""
            FROM financial_lines f LEFT JOIN people p ON p.id = f.person_id AND p.business_id = f.business_id
            WHERE {TitleScope}
              AND (@status IS NULL OR (@status = 'paid' AND f.status = 'paid') OR (@status IN ('open','overdue') AND f.status = 'open'
                   AND (@status = 'open' OR f.due_date < @today)))
              AND (@term IS NULL OR f.description LIKE @like OR f.document LIKE @like OR p.name LIKE @like)
            """;
        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<TitleRow>(new CommandDefinition(
            $"""
            SELECT CAST(f.id AS SIGNED) AS Id, f.description AS Description, f.document AS Document, p.name AS PersonName, f.due_date AS DueDate,
                   CAST(f.amount_cents AS SIGNED) AS AmountCents, CAST(f.paid_cents AS SIGNED) AS PaidCents,
                   CAST(GREATEST(f.amount_cents - f.paid_cents, 0) AS SIGNED) AS OpenCents, f.status AS Status,
                   (f.status = 'open' AND f.due_date < @today) AS Overdue,
                   CAST(f.installment_number AS SIGNED) AS InstallmentNumber, CAST(f.installment_count AS SIGNED) AS InstallmentCount
            {where}
            ORDER BY f.due_date, f.id LIMIT @pageSize OFFSET @offset
            """, args, cancellationToken: ct))).Select(r => r.ToItem()).ToList();
        return new PagedResult<TitleItem>(items, paging.Page, paging.PageSize, total);
    }

    public async Task<(TitleTotals Open, TitleTotals Overdue)> TitleTotalsAsync(long businessId, string type, DateOnly today, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var rows = (await conn.QueryAsync<(bool Overdue, long Count, long TotalCents)>(new CommandDefinition(
            $"""
            SELECT (f.due_date < @today) AS Overdue, COUNT(*) AS Count, CAST(COALESCE(SUM(f.amount_cents - f.paid_cents), 0) AS SIGNED) AS TotalCents
            FROM financial_lines f WHERE {TitleScope} AND f.status = 'open' GROUP BY (f.due_date < @today)
            """,
            new { businessId, type, today = today.ToDateTime(TimeOnly.MinValue) }, cancellationToken: ct))).ToList();
        var overdue = rows.FirstOrDefault(r => r.Overdue);
        var current = rows.FirstOrDefault(r => !r.Overdue);
        return (new TitleTotals(overdue.Count + current.Count, overdue.TotalCents + current.TotalCents), new TitleTotals(overdue.Count, overdue.TotalCents));
    }

    public async Task<PagedResult<PurchaseItem>> PurchasesAsync(long businessId, string? status, string? search, Paging paging, CancellationToken ct)
    {
        var term = SqlText.NormalizeSearch(search);
        var args = new { businessId, status, term, like = term is null ? null : SqlText.ContainsPattern(term), offset = paging.Offset, pageSize = paging.PageSize };
        const string where = """
            FROM purchase_orders o LEFT JOIN people s ON s.id = o.supplier_person_id AND s.business_id = o.business_id
            WHERE o.business_id = @businessId AND (@status IS NULL OR o.status = @status)
              AND (@term IS NULL OR o.number LIKE @like OR s.name LIKE @like)
            """;
        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<PurchaseItem>(new CommandDefinition(
            $"""
            SELECT CAST(o.id AS SIGNED) AS Id, o.number AS Number, o.kind AS Kind, o.status AS Status, s.name AS SupplierName,
                   o.ordered_at AS OrderedAt, CAST(o.total_cents AS SIGNED) AS TotalCents, o.is_urgent AS IsUrgent
            {where}
            ORDER BY o.ordered_at DESC, o.id DESC LIMIT @pageSize OFFSET @offset
            """, args, cancellationToken: ct))).AsList();
        return new PagedResult<PurchaseItem>(items, paging.Page, paging.PageSize, total);
    }

    // Vendas finalizadas no período (inclusive nas duas pontas), pela data da venda no horário local da empresa.
    public async Task<SalesReport> SalesAsync(long businessId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var args = new { businessId, start = from.ToDateTime(TimeOnly.MinValue), end = to.AddDays(1).ToDateTime(TimeOnly.MinValue) };
        const string scope = """
            s.business_id = @businessId AND s.deleted_at IS NULL AND s.status = 'finalizada'
            AND COALESCE(s.occurred_at, s.created_at) >= @start AND COALESCE(s.occurred_at, s.created_at) < @end
            """;
        await using var conn = await db.OpenConnectionAsync(ct);
        var byDay = (await conn.QueryAsync<SalesDay>(new CommandDefinition(
            $"""
            SELECT DATE(COALESCE(s.occurred_at, s.created_at)) AS Day, COUNT(*) AS Count, CAST(COALESCE(SUM(s.total_cents), 0) AS SIGNED) AS TotalCents
            FROM sales s WHERE {scope} GROUP BY DATE(COALESCE(s.occurred_at, s.created_at)) ORDER BY Day
            """, args, cancellationToken: ct))).AsList();
        var byMethod = (await conn.QueryAsync<SalesByMethod>(new CommandDefinition(
            $"""
            SELECT sp.method AS Method, COUNT(*) AS Count, CAST(COALESCE(SUM(sp.amount_cents), 0) AS SIGNED) AS TotalCents
            FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE {scope} GROUP BY sp.method ORDER BY TotalCents DESC
            """, args, cancellationToken: ct))).AsList();
        var count = byDay.Sum(d => d.Count);
        var total = byDay.Sum(d => d.TotalCents);
        return new SalesReport(from, to, count, total, count == 0 ? 0 : total / count, byDay, byMethod);
    }
}
