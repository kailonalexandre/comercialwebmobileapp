namespace ComercialWeb.Mobile.Sales;

/// <summary>
/// Validação de forma do desconto que o app envia como intenção (o ComercialWeb recalcula tudo e aplica o limite do usuário):
/// percentual (0 a 99,99, até 2 casas) OU valor em centavos, nunca os dois.
/// </summary>
internal static class Discounts
{
    private const long MaxCents = 100_000_000;

    public static bool IsValid(decimal? percent, long? cents) =>
        !(percent is not null && cents is not null)
        && (percent is null || (percent is >= 0 and <= 99.99m && decimal.Round(percent.Value, 2) == percent))
        && (cents is null || cents is >= 0 and <= MaxCents);
}
