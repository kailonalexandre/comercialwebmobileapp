using System.Text.RegularExpressions;
using ComercialWeb.Mobile.Common;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Catalog;

public sealed record ProductListItem(long Id, long Code, string Name, string? Sku, string? Barcode, long SalePriceCents, bool IsActive);

public sealed record ProductDetail(long Id, long Code, string Name, string? Sku, string? Barcode, long SalePriceCents, bool IsActive, string? Description);

/// <summary>
/// Consulta de produtos da empresa da sessão (somente leitura nas tabelas do ComercialWeb).
/// Custo e margens não são expostos ao app.
/// </summary>
public sealed partial class ProductQueries(MySqlDataSource db)
{
    private const string Columns = """
        CAST(p.id AS SIGNED) AS Id, CAST(p.code AS SIGNED) AS Code, p.name AS Name, p.sku AS Sku, p.barcode AS Barcode,
        CAST(ROUND(p.sale_price * 100) AS SIGNED) AS SalePriceCents, p.is_active AS IsActive
        """;

    // Mesmos campos de ProductIdentifierSearch da web + código numérico exato.
    private const string SearchFilter = """
        AND (
          @term IS NULL
          OR p.name LIKE @like OR p.sku LIKE @like OR p.barcode LIKE @like OR p.barcode IN @variants
          OR (@code IS NOT NULL AND p.code = @code)
          OR EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.product_id = p.id AND (pb.barcode LIKE @like OR pb.barcode IN @variants))
          OR EXISTS (SELECT 1 FROM product_variations pv WHERE pv.product_id = p.id
                     AND (pv.barcode LIKE @like OR pv.barcode IN @variants OR pv.reference LIKE @like))
        )
        """;

    public async Task<PagedResult<ProductListItem>> SearchAsync(long businessId, string? search, bool includeInactive, Paging paging, CancellationToken ct)
    {
        var term = SqlText.NormalizeSearch(search);
        var args = new
        {
            businessId,
            includeInactive,
            term,
            like = term is null ? null : SqlText.ContainsPattern(term),
            variants = term is null ? [""] : IdentifierVariants(term),
            code = term is not null && CodePattern().IsMatch(term) && long.TryParse(term, out var c) ? c : (long?)null,
            offset = paging.Offset,
            pageSize = paging.PageSize,
        };
        const string where = $"""
            FROM products p
            WHERE p.business_id = @businessId AND p.deleted_at IS NULL AND (@includeInactive OR p.is_active = 1)
            {SearchFilter}
            """;

        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<ProductListItem>(new CommandDefinition(
            $"SELECT {Columns} {where} ORDER BY p.name, p.id LIMIT @pageSize OFFSET @offset", args, cancellationToken: ct))).AsList();
        return new PagedResult<ProductListItem>(items, paging.Page, paging.PageSize, total);
    }

    /// <summary>Produto de outra empresa ou excluído retorna null (404), sem revelar que existe.</summary>
    public async Task<ProductDetail?> FindAsync(long businessId, long id, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<ProductDetail>(new CommandDefinition(
            $"SELECT {Columns}, p.description AS Description FROM products p WHERE p.id = @id AND p.business_id = @businessId AND p.deleted_at IS NULL",
            new { id, businessId }, cancellationToken: ct));
    }

    // Espelha ProductBarcodeRepository::identifierVariants: UPC-A (12 dígitos) e EAN-13 com zero à esquerda.
    internal static string[] IdentifierVariants(string term)
    {
        var variants = new List<string> { term };
        if (Upc().IsMatch(term)) variants.Add("0" + term);
        if (EanWithLeadingZero().IsMatch(term)) variants.Add(term[1..]);
        return [.. variants.Distinct()];
    }

    [GeneratedRegex(@"^\d{1,9}$")]
    private static partial Regex CodePattern();

    [GeneratedRegex(@"^\d{12}$")]
    private static partial Regex Upc();

    [GeneratedRegex(@"^0\d{12}$")]
    private static partial Regex EanWithLeadingZero();
}
