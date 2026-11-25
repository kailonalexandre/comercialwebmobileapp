using System.Text.RegularExpressions;
using System.Text.Json.Serialization;
using ComercialWeb.Mobile.Common;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Catalog;

/// <param name="SalePriceCents">Preço de venda do cadastro (varejo).</param>
/// <param name="PriceCents">Preço na tabela pedida; null = produto sem preço nessa tabela.</param>
public sealed record ProductListItem(long Id, long Code, string Name, string? Sku, string? Barcode, long SalePriceCents, bool IsActive,
    string? Unit, long? GroupId, long? StockMilli, [property: JsonIgnore] string? ImagePath, long? PriceCents = null, string? ImageUrl = null)
{
    public ProductListItem(long id, long code, string name, string? sku, string? barcode, long salePriceCents, bool isActive,
        string? unit, long? groupId, long? stockMilli, string? imagePath)
        : this(id, code, name, sku, barcode, salePriceCents, isActive, unit, groupId, stockMilli, imagePath, null, null) { }
}

public sealed record ProductDetail(long Id, long Code, string Name, string? Sku, string? Barcode, long SalePriceCents, bool IsActive, string? Description,
    string? Unit, [property: JsonIgnore] string? ImagePath, IReadOnlyDictionary<string, long>? Prices = null, string? ImageUrl = null)
{
    public ProductDetail(long id, long code, string name, string? sku, string? barcode, long salePriceCents, bool isActive,
        string? description, string? unit, string? imagePath)
        : this(id, code, name, sku, barcode, salePriceCents, isActive, description, unit, imagePath, null, null) { }
}

public sealed record ProductGroup(long Id, string Name);

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

    private const string UnitJoin = "LEFT JOIN units u ON u.id = p.unit_id AND u.business_id = p.business_id";

    // Mesma agregação por endereço e variação usada na listagem web.
    private const string Stock = """
        SELECT CAST(COALESCE(SUM(sb.quantity_milli), 0) AS SIGNED)
        FROM stock_balances sb
        JOIN storage_locations sl ON sl.id = sb.storage_location_id AND sl.business_id = sb.business_id
        WHERE sb.business_id = p.business_id AND sb.product_id = p.id AND sl.type = 'storage' AND sl.parent_id = @unitId
          AND (sb.product_variation_id IS NOT NULL
               OR EXISTS (SELECT 1 FROM product_variations pv WHERE pv.product_id = p.id AND pv.id = sb.variation_key)
               OR NOT EXISTS (SELECT 1 FROM product_variations pv WHERE pv.product_id = p.id))
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

    public async Task<PagedResult<ProductListItem>> SearchAsync(long businessId, string? search, bool includeInactive, Paging paging, CancellationToken ct, long? unitId = null, long? groupId = null, bool inStock = false)
    {
        var term = SqlText.NormalizeSearch(search);
        var args = new
        {
            businessId,
            includeInactive,
            unitId,
            groupId,
            term,
            like = term is null ? null : SqlText.ContainsPattern(term),
            variants = term is null ? [""] : IdentifierVariants(term),
            code = term is not null && CodePattern().IsMatch(term) && long.TryParse(term, out var c) ? c : (long?)null,
            offset = paging.Offset,
            pageSize = paging.PageSize,
        };
        var where = $"""
            FROM products p {UnitJoin}
            WHERE p.business_id = @businessId AND p.deleted_at IS NULL AND (@includeInactive OR p.is_active = 1)
              AND (@groupId IS NULL OR p.group_id = @groupId)
            {SearchFilter}
            {(inStock ? $"AND ({Stock}) > 0" : "")}
            """;

        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<ProductListItem>(new CommandDefinition(
            $"""
            SELECT {Columns}, u.name AS Unit, CAST(p.group_id AS SIGNED) AS GroupId,
                   CASE WHEN @unitId IS NULL THEN NULL ELSE ({Stock}) END AS StockMilli, p.image_path AS ImagePath
            {where}
            ORDER BY p.name, p.id LIMIT @pageSize OFFSET @offset
            """, args, cancellationToken: ct))).AsList();
        return new PagedResult<ProductListItem>(items, paging.Page, paging.PageSize, total);
    }

    /// <summary>Produto de outra empresa ou excluído retorna null (404), sem revelar que existe.</summary>
    public async Task<ProductDetail?> FindAsync(long businessId, long id, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<ProductDetail>(new CommandDefinition(
            $"SELECT {Columns}, p.description AS Description, u.name AS Unit, p.image_path AS ImagePath FROM products p {UnitJoin} WHERE p.id = @id AND p.business_id = @businessId AND p.deleted_at IS NULL",
            new { id, businessId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<ProductGroup>> GroupsAsync(long businessId, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<ProductGroup>(new CommandDefinition(
            "SELECT CAST(id AS SIGNED) AS Id, name AS Name FROM product_groups WHERE business_id = @businessId AND is_active = 1 ORDER BY name, id",
            new { businessId }, cancellationToken: ct))).AsList();
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
