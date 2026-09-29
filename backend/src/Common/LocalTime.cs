using Microsoft.Extensions.Configuration;

namespace ComercialWeb.Mobile.Common;

/// <summary>
/// Horário local da empresa (APP_TIMEZONE da web, padrão America/Sao_Paulo). O ComercialWeb grava e lê
/// datas nesse fuso, então tudo que o app compara com ou grava em tabelas dele usa o mesmo relógio.
/// </summary>
public static class LocalTime
{
    public static TimeZoneInfo Zone(IConfiguration config) =>
        TimeZoneInfo.FindSystemTimeZoneById(config["ComercialWeb:TimeZone"] ?? "America/Sao_Paulo");

    public static DateTime Now(IConfiguration config, TimeProvider clock) =>
        TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Zone(config)).DateTime;
}
