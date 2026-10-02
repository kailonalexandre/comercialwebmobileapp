using System.Security.Claims;
using System.Net;
using ComercialWeb.Mobile.Identity;
using ComercialWeb.Mobile.Identity.Authorization;
using ComercialWeb.Mobile.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Customers;

public static class CustomersModule
{
    // Mesma permissão da web para consultar pessoas (Person/Core).
    public const string ViewPeople = "people.view";

    // Criar cliente: mesma permissão da web; o ComercialWeb confere de novo.
    public const string CreatePeople = "people.create";

    public sealed record AddressRequest(string? Zip, string? Street, string? Number, string? Complement, string? District, string? City, string? State);

    public sealed record QuickRequest(
        string? PersonKind, string? Name, string? TradeName, string? Document, string? Phone, string? Whatsapp,
        string? Email, string? ContactName, string? Notes, AddressRequest? Address);

    public sealed record DuplicatesRequest(string? Document, string? Phone, string? Email);

    public static IServiceCollection AddCustomersModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<CustomerQueries>();
        services.AddHttpClient<CustomerWebClient>(http =>
        {
            if (Uri.TryCreate(config["ComercialWeb:BaseUrl"], UriKind.Absolute, out var baseUrl)) http.BaseAddress = baseUrl;
            http.Timeout = TimeSpan.FromSeconds(20);
        });
        return services;
    }

    private static int Digits(string? s) => s?.Count(char.IsAsciiDigit) ?? 0;

    // Limites do cadastro rápido (os mesmos da web); a regra de negócio completa roda no ComercialWeb.
    internal static bool IsValid(QuickRequest b) =>
        b.PersonKind is "individual" or "company"
        && !string.IsNullOrWhiteSpace(b.Name) && b.Name.Length <= 200
        && (b.TradeName?.Length ?? 0) <= 200 && (b.ContactName?.Length ?? 0) <= 150 && (b.Notes?.Length ?? 0) <= 4000
        && (b.Email?.Length ?? 0) <= 255 && Digits(b.Document) <= 14 && Digits(b.Phone) <= 11 && Digits(b.Whatsapp) <= 11
        && (Digits(b.Phone) > 0 || Digits(b.Whatsapp) > 0);

    private static IResult Relay(WebResponse r) => r.Status switch
    {
        HttpStatusCode.OK or HttpStatusCode.Created or HttpStatusCode.UnprocessableEntity =>
            Results.Content(System.Text.Encoding.UTF8.GetString(r.Body), "application/json", System.Text.Encoding.UTF8, (int)r.Status),
        HttpStatusCode.Forbidden => Results.Problem(statusCode: StatusCodes.Status403Forbidden),
        _ => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable),
    };

    public static IEndpointRouteBuilder MapCustomersEndpoints(this IEndpointRouteBuilder app)
    {
        var customers = app.MapGroup("/api/v1/customers");

        customers.MapGet("/", async (ClaimsPrincipal user, CustomerQueries queries, CancellationToken ct,
            string? search, bool? includeInactive, int? page, int? pageSize) =>
        {
            if (!Paging.TryCreate(page, pageSize, search, out var paging)) return Paging.Invalid();
            var ids = SessionIds.From(user)!;
            return Results.Ok(await queries.SearchAsync(ids.BusinessId, search, includeInactive ?? false, paging, ct));
        }).RequirePermission(ViewPeople);

        customers.MapGet("/{id:long}", async (long id, ClaimsPrincipal user, CustomerQueries queries, CancellationToken ct) =>
        {
            var customer = await queries.FindAsync(SessionIds.From(user)!.BusinessId, id, ct);
            return customer is null ? Results.Problem(statusCode: StatusCodes.Status404NotFound) : Results.Ok(customer);
        }).RequirePermission(ViewPeople);

        // Cadastro rápido: o ComercialWeb aplica as regras de Pessoa e deduplica por Idempotency-Key (client_uuid).
        customers.MapPost("/", async (QuickRequest body, HttpContext http, ClaimsPrincipal user, CustomerWebClient web, CancellationToken ct) =>
        {
            if (!Guid.TryParse(http.Request.Headers["Idempotency-Key"].ToString(), out var key) || key == Guid.Empty || !IsValid(body))
                return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            var ids = SessionIds.From(user)!;
            return Relay(await web.PostAsync(CustomerWebClient.QuickPath, new
            {
                user_id = ids.UserId,
                business_id = ids.BusinessId,
                client_uuid = key.ToString(),
                person_kind = body.PersonKind,
                name = body.Name!.Trim(),
                trade_name = body.TradeName?.Trim(),
                document = body.Document,
                phone = body.Phone,
                whatsapp = body.Whatsapp,
                email = body.Email?.Trim(),
                contact_name = body.ContactName?.Trim(),
                notes = body.Notes?.Trim(),
                main_address = body.Address,
            }, ct));
        }).RequirePermission(CreatePeople);

        customers.MapPost("/duplicates", async (DuplicatesRequest body, ClaimsPrincipal user, CustomerWebClient web, CancellationToken ct) =>
        {
            var ids = SessionIds.From(user)!;
            return Relay(await web.PostAsync(CustomerWebClient.DuplicatesPath,
                new { user_id = ids.UserId, business_id = ids.BusinessId, document = body.Document, phone = body.Phone, email = body.Email }, ct));
        }).RequirePermission(CreatePeople);

        // Consultas da web reaproveitadas (CEP e CNPJ).
        customers.MapGet("/lookup/postal-code", async (string? zip, ClaimsPrincipal user, CustomerWebClient web, CancellationToken ct) =>
        {
            if (Digits(zip) != 8) return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            var ids = SessionIds.From(user)!;
            return Relay(await web.PostAsync(CustomerWebClient.PostalCodePath, new { user_id = ids.UserId, business_id = ids.BusinessId, zip }, ct));
        }).RequirePermission(CreatePeople);

        customers.MapGet("/lookup/company", async (string? document, ClaimsPrincipal user, CustomerWebClient web, CancellationToken ct) =>
        {
            if (Digits(document) != 14) return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
            var ids = SessionIds.From(user)!;
            return Relay(await web.PostAsync(CustomerWebClient.CompanyPath, new { user_id = ids.UserId, business_id = ids.BusinessId, document }, ct));
        }).RequirePermission(CreatePeople);

        return app;
    }
}
