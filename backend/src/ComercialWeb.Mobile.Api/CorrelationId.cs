namespace ComercialWeb.Mobile.Api;

/// <summary>Propaga X-Correlation-ID do app (ou gera um) para resposta e logs.</summary>
internal static class CorrelationId
{
    public const string Header = "X-Correlation-ID";

    public static string For(HttpContext http) => (string)http.Items[Header]!;

    public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        var incoming = http.Request.Headers[Header].ToString();
        // Valor do cliente só é aceito em formato seguro para log (sem quebra de linha/injeção).
        var id = incoming.Length is > 0 and <= 64 && incoming.All(c => char.IsAsciiLetterOrDigit(c) || c == '-') ? incoming : Guid.NewGuid().ToString();
        http.Items[Header] = id;
        http.Response.Headers[Header] = id;
        var logger = http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("Request");
        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
        {
            await next(http);
        }
    });
}
