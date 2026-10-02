using ComercialWeb.Mobile.Common;
using Dapper;
using MySqlConnector;

namespace ComercialWeb.Mobile.Customers;

public sealed record CustomerListItem(
    long Id, long Code, string Name, string? TradeName, string? Document, string? Phone,
    string? City, string? State, bool IsActive, bool RestrictionAlert, bool RestrictionBlock, bool RegistrationIncomplete = false, string? TradeScope = null);

public sealed record Address(string? Street, string? Number, string? District, string? City, string? State, string? Zip);

public sealed record CustomerDetail(
    long Id, long Code, string Name, string? TradeName, string PersonKind, string? Document,
    string? Phone, string? Mobile, string? Whatsapp, string? Email, Address MainAddress,
    bool IsActive, bool RestrictionAlert, bool RestrictionBlock, bool RegistrationIncomplete = false, string? TradeScope = null);

/// <summary>
/// Clientes (people.is_client) da empresa da sessão, somente leitura.
/// Minimização (LGPD): limite de crédito, renda, motivo de restrição e observações não saem para o app.
/// </summary>
public sealed class CustomerQueries(MySqlDataSource db)
{
    private const string Scope = "p.business_id = @businessId AND p.is_client = 1 AND p.deleted_at IS NULL";

    // Mesmos campos da busca da web (PersonRepository::paginate). Documento e telefones são gravados
    // só com dígitos, então o termo também é comparado sem máscara ("123.456.789-00" acha o CPF).
    private const string SearchFilter = """
        AND (
          @term IS NULL
          OR p.name LIKE @like OR p.trade_name LIKE @like OR p.code LIKE @like
          OR (@digits IS NOT NULL AND (p.document LIKE @digits OR p.phone LIKE @digits OR p.mobile LIKE @digits))
        )
        """;

    public async Task<PagedResult<CustomerListItem>> SearchAsync(long businessId, string? search, bool includeInactive, Paging paging, CancellationToken ct)
    {
        var term = SqlText.NormalizeSearch(search);
        var digits = term is null ? "" : new string([.. term.Where(char.IsAsciiDigit)]);
        var args = new
        {
            businessId,
            includeInactive,
            term,
            like = term is null ? null : SqlText.ContainsPattern(term),
            digits = digits.Length >= 3 ? $"%{digits}%" : null,
            offset = paging.Offset,
            pageSize = paging.PageSize,
        };
        const string where = $"FROM people p WHERE {Scope} AND (@includeInactive OR p.is_active = 1) {SearchFilter}";

        await using var conn = await db.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(*) {where}", args, cancellationToken: ct));
        var items = total == 0 ? [] : (await conn.QueryAsync<CustomerListItem>(new CommandDefinition(
            $"""
            SELECT CAST(p.id AS SIGNED) AS Id, CAST(p.code AS SIGNED) AS Code, p.name AS Name, p.trade_name AS TradeName,
                   p.document AS Document, COALESCE(p.mobile, p.phone) AS Phone,
                   p.main_address->>'$.city' AS City, p.main_address->>'$.state' AS State,
                   p.is_active AS IsActive, p.restriction_alert AS RestrictionAlert, p.restriction_block AS RestrictionBlock,
                   p.registration_incomplete AS RegistrationIncomplete, p.trade_scope AS TradeScope
            {where}
            ORDER BY p.name, p.id LIMIT @pageSize OFFSET @offset
            """, args, cancellationToken: ct))).AsList();
        return new PagedResult<CustomerListItem>(items, paging.Page, paging.PageSize, total);
    }

    /// <summary>Cliente de outra empresa, excluído ou que não é cliente retorna null (404).</summary>
    public async Task<CustomerDetail?> FindAsync(long businessId, long id, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var row = await conn.QuerySingleOrDefaultAsync<DetailRow>(new CommandDefinition(
            $"""
            SELECT CAST(p.id AS SIGNED) AS Id, CAST(p.code AS SIGNED) AS Code, p.name AS Name, p.trade_name AS TradeName,
                   p.person_kind AS PersonKind, p.document AS Document, p.phone AS Phone, p.mobile AS Mobile,
                   p.whatsapp AS Whatsapp, p.email AS Email,
                   p.main_address->>'$.street' AS Street, p.main_address->>'$.number' AS Number,
                   p.main_address->>'$.district' AS District, p.main_address->>'$.city' AS City,
                   p.main_address->>'$.state' AS State, p.main_address->>'$.zip' AS Zip,
                   p.is_active AS IsActive, p.restriction_alert AS RestrictionAlert, p.restriction_block AS RestrictionBlock,
                   p.registration_incomplete AS RegistrationIncomplete, p.trade_scope AS TradeScope
            FROM people p WHERE p.id = @id AND {Scope}
            """,
            new { id, businessId }, cancellationToken: ct));
        return row is null ? null : new CustomerDetail(
            row.Id, row.Code, row.Name, row.TradeName, row.PersonKind, row.Document, row.Phone, row.Mobile, row.Whatsapp, row.Email,
            new Address(row.Street, row.Number, row.District, row.City, row.State, row.Zip),
            row.IsActive, row.RestrictionAlert, row.RestrictionBlock, row.RegistrationIncomplete, row.TradeScope);
    }

    private sealed class DetailRow
    {
        public long Id { get; set; }
        public long Code { get; set; }
        public string Name { get; set; } = "";
        public string? TradeName { get; set; }
        public string PersonKind { get; set; } = "";
        public string? Document { get; set; }
        public string? Phone { get; set; }
        public string? Mobile { get; set; }
        public string? Whatsapp { get; set; }
        public string? Email { get; set; }
        public string? Street { get; set; }
        public string? Number { get; set; }
        public string? District { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip { get; set; }
        public bool IsActive { get; set; }
        public bool RestrictionAlert { get; set; }
        public bool RestrictionBlock { get; set; }
        public bool RegistrationIncomplete { get; set; }
        public string? TradeScope { get; set; }
    }
}
