using ComercialWeb.Mobile.Api;
using ComercialWeb.Mobile.Catalog;
using ComercialWeb.Mobile.Customers;
using ComercialWeb.Mobile.Dashboard;
using ComercialWeb.Mobile.Notifications;
using ComercialWeb.Mobile.Push;
using ComercialWeb.Mobile.Sales;
using ComercialWeb.Mobile.Identity;
using Microsoft.AspNetCore.HttpOverrides;
using MySqlConnector;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(sp => new MySqlDataSource(
    sp.GetRequiredService<IConfiguration>().GetConnectionString("ComercialWeb")
    ?? throw new InvalidOperationException("ConnectionStrings:ComercialWeb não configurada.")));
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
{
    // Cliente recebe só mensagem genérica + correlationId; detalhes técnicos ficam no log.
    ctx.ProblemDetails.Detail = "Não foi possível concluir a operação.";
    ctx.ProblemDetails.Extensions.Remove("traceId");
    ctx.ProblemDetails.Extensions["correlationId"] = CorrelationId.For(ctx.HttpContext);
});
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Só o proxy da borda pode dizer quem é o cliente. O padrão do ASP.NET confia apenas em loopback; atrás do Traefik
    // (K3s) ou de um nginx, a origem é a rede de pods/containers: ForwardedHeaders__KnownNetworks="10.42.0.0/16" (CIDR exato, nunca largo).
    foreach (var cidr in (builder.Configuration["ForwardedHeaders:KnownNetworks"] ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
});

builder.Services.AddIdentityModule(builder.Configuration, builder.Environment);
builder.Services.AddCatalogModule(builder.Configuration);
builder.Services.AddCustomersModule(builder.Configuration);
builder.Services.AddSalesModule(builder.Configuration);
builder.Services.AddDashboardModule();
builder.Services.AddNotificationsModule();
builder.Services.AddPushModule();

// Segredo HMAC compartilhado com o ComercialWeb: fora de dev, curto demais é erro de configuração (o contrato exige 32+).
if (!builder.Environment.IsDevelopment() && builder.Configuration["ComercialWeb:MobileApiSecret"] is { Length: > 0 and < 32 })
    throw new InvalidOperationException("ComercialWeb:MobileApiSecret deve ter 32 caracteres ou mais.");

var app = builder.Build();

if (args is ["migrate"])
{
    await Migrator.RunAsync(app.Services.GetRequiredService<MySqlDataSource>(), Path.Combine(AppContext.BaseDirectory, "migrations"), Console.Out);
    return;
}

app.UseForwardedHeaders();
app.UseCorrelationId();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseAuthentication();
app.UseAuthorization();

// Health check para blue-green: só responde 200 com banco acessível.
app.MapGet("/health", async (MySqlDataSource db, CancellationToken ct) =>
{
    await using var conn = await db.OpenConnectionAsync(ct);
    return Results.Ok(new { status = "ok" });
});

app.MapIdentityEndpoints();
app.MapCatalogEndpoints();
app.MapCustomersEndpoints();
app.MapSalesEndpoints();
app.MapDashboardEndpoints();
app.MapNotificationsEndpoints();
app.MapPushEndpoints();
app.MapPermissionsEndpoint();

await app.RunAsync();

public partial class Program;
