using ComercialWeb.Mobile.Common;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Sales;

/// <summary>Datas no horário local da empresa (America/Sao_Paulo), como gravadas e exibidas pela web.</summary>
public sealed record SaleListItem(long Id, string Number, DateTime CreatedAt, string Status, long TotalCents, string? CustomerName, string? SellerName);

public sealed record SaleItem(string Description, string? Sku, decimal Quantity, long UnitPriceCents, long DiscountCents, long TotalCents);

public sealed record SalePayment(string Method, long AmountCents, long? Installments);

public sealed record SaleDetail(
    long Id, string Number, DateTime CreatedAt, string Status, string PriceMode,
    long? CustomerId, string? CustomerName, string? SellerName,
    long SubtotalCents, long ItemDiscountCents, long DiscountCents, long FreightCents, long SurchargeCents, long TotalCents,
    string? Observation, IReadOnlyList<SaleItem> Items, IReadOnlyList<SalePayment> Payments);

public sealed record SaleFilter(string? Search, string? Status, DateOnly? From, DateOnly? To);

/// <summary>
/// Consulta de vendas da empresa e da unidade da sessão (mesmo recorte da tela "Consulta de Vendas" da web:
/// nunca consolida filiais em silêncio).
/// </summary>
public sealed class SaleQueries(MySqlDataSource db)
{
    // Status aceitos no filtro. "devolucao" traz as duas pontas da operação (devolucao + troca), como na web.
    public static readonly IReadOnlySet<string> Statuses = new HashSet<string>(StringComparer.Ordinal)
    {
        "pendente", "pre_venda", "finalizada", "devolucao", "condicional_aberto", "condicional_fechado", "condicional_cancelado",
    };

    private const string Scope = "s.business_id = @businessId AND s.location_id = @locationId AND s.deleted_at IS NULL";

    private const string Joins = """
        LEFT JOIN people c ON c.id = s.customer_person_id AND c.business_id = s.business_id
        LEFT JOIN people sp ON sp.id = s.seller_person_id AND sp.business_id = s.business_id
        LEFT JOIN users su ON su.id = s.seller_user_id
        """;

    // Vendedor é a pessoa que vendeu; sem ela, o usuário vendedor (mesma regra da web).
    private const string Summary = """
        CAST(s.id AS SIGNED) AS Id, s.number AS Number, s.created_at AS CreatedAt, s.status AS Status,
        CAST(s.total_cents AS SIGNED) AS TotalCents, c.name AS CustomerName, COALESCE(sp.name, su.name) AS SellerName
        """;

    public async Task<PagedResult<SaleListItem>> SearchAsync(long businessId, long locationId, SaleFilter filter, Paging paging, CancellationToken ct)
    {
        var term = SqlText.NormalizeSearch(filter.Search);
        var digits = term is null ? "" : new string([.. term.Where(char.IsAsciiDigit)]);
        var args = new
        {
            businessId,
            locationId,
            status = filter.Status,
            from = filter.From?.ToDateTime(TimeOnly.MinValue),
            to = filter.To?.ToDateTime(TimeOnly.MinValue),
            term,
            like = term is null ? null : SqlText.ContainsPattern(term),
            digits = digits.Length >= 3 ? $"%{digits}%" : null,
            offset = paging.Offset,
            pageSize = paging.PageSize,
        };
        const string where = $"""
            FROM sales s {Joins}
            WHERE {Scope}
              AND (@status IS NULL OR s.status = @status OR (@status = 'devolucao' AND s.status = 'troca'))
              AND (@from IS NULL OR DATE(s.created_at) >= @from)
              AND (@to IS NULL OR DATE(s.created_at) <= @to)
              AND (@term IS NULL OR s.number LIKE @like OR c.name LIKE @like OR c.trade_name LIKE @like
                   OR (@digits IS NOT NULL AND c.document LIKE @digits))
            """;

        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<SaleListItem>(new CommandDefinition(
            $"SELECT {Summary} {where} ORDER BY s.created_at DESC, s.id DESC LIMIT @pageSize OFFSET @offset", args, cancellationToken: ct))).AsList();
        return new PagedResult<SaleListItem>(items, paging.Page, paging.PageSize, total);
    }

    /// <summary>Venda de outra empresa, de outra unidade ou excluída retorna null (404).</summary>
    public async Task<SaleDetail?> FindAsync(long businessId, long locationId, long id, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var head = await conn.QuerySingleOrDefaultAsync<HeadRow>(new CommandDefinition(
            $"""
            SELECT {Summary}, s.price_mode AS PriceMode, CAST(s.customer_person_id AS SIGNED) AS CustomerId,
                   CAST(s.subtotal_cents AS SIGNED) AS SubtotalCents, CAST(s.item_discount_cents AS SIGNED) AS ItemDiscountCents,
                   CAST(s.discount_cents AS SIGNED) AS DiscountCents, CAST(s.freight_cents AS SIGNED) AS FreightCents,
                   CAST(s.surcharge_cents AS SIGNED) AS SurchargeCents, s.observation AS Observation
            FROM sales s {Joins}
            WHERE s.id = @id AND {Scope}
            """,
            new { id, businessId, locationId }, cancellationToken: ct));
        if (head is null) return null;

        var items = (await conn.QueryAsync<SaleItem>(new CommandDefinition(
            """
            SELECT description AS Description, sku AS Sku, quantity AS Quantity, CAST(unit_price_cents AS SIGNED) AS UnitPriceCents,
                   CAST(discount_cents AS SIGNED) AS DiscountCents, CAST(total_cents AS SIGNED) AS TotalCents
            FROM sale_items WHERE sale_id = @id ORDER BY id
            """, new { id }, cancellationToken: ct))).AsList();
        var payments = (await conn.QueryAsync<SalePayment>(new CommandDefinition(
            "SELECT method AS Method, CAST(amount_cents AS SIGNED) AS AmountCents, CAST(installments AS SIGNED) AS Installments FROM sale_payments WHERE sale_id = @id ORDER BY id",
            new { id }, cancellationToken: ct))).AsList();

        return new SaleDetail(head.Id, head.Number, head.CreatedAt, head.Status, head.PriceMode, head.CustomerId, head.CustomerName, head.SellerName,
            head.SubtotalCents, head.ItemDiscountCents, head.DiscountCents, head.FreightCents, head.SurchargeCents, head.TotalCents,
            head.Observation, items, payments);
    }

    private sealed class HeadRow
    {
        public long Id { get; set; }
        public string Number { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public string Status { get; set; } = "";
        public long TotalCents { get; set; }
        public string? CustomerName { get; set; }
        public string? SellerName { get; set; }
        public string PriceMode { get; set; } = "";
        public long? CustomerId { get; set; }
        public long SubtotalCents { get; set; }
        public long ItemDiscountCents { get; set; }
        public long DiscountCents { get; set; }
        public long FreightCents { get; set; }
        public long SurchargeCents { get; set; }
        public string? Observation { get; set; }
    }
}
