using System.Text.RegularExpressions;

namespace ComercialWeb.Mobile.Common;

/// <summary>
/// Tabela de preço é um identificador do ComercialWeb ("varejo", "atacado"...), sempre decidido e calculado lá.
/// Aqui só se confere o formato antes de repassar; a lista válida e os preços vêm do ComercialWeb.
/// </summary>
public static partial class PriceTables
{
    public const string Default = "varejo";

    [GeneratedRegex("^[a-z0-9_]{1,20}$")]
    private static partial Regex Key();

    public static bool IsValidKey(string? key) => key is null || Key().IsMatch(key);

    public static bool IsDefault(string? key) => key is null || key == Default;
}
