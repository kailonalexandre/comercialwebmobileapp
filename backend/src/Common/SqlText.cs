namespace ComercialWeb.Mobile.Common;

public static class SqlText
{
    /// <summary>
    /// Termo de busca como texto literal em LIKE (escape padrão '\' do MySQL).
    /// A web não escapa: "%" ou "_" digitados viram curinga.
    /// </summary>
    public static string ContainsPattern(string term) =>
        "%" + term.Replace(@"\", @"\\", StringComparison.Ordinal).Replace("%", @"\%", StringComparison.Ordinal).Replace("_", @"\_", StringComparison.Ordinal) + "%";

    /// <summary>Busca vazia vira null (sem filtro).</summary>
    public static string? NormalizeSearch(string? search) => string.IsNullOrWhiteSpace(search) ? null : search.Trim();
}
