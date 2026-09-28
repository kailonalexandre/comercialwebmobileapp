using Dapper;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using MySqlConnector;

namespace ComercialWeb.Mobile.Identity.Authorization;

public interface IPermissionChecker
{
    Task<bool> HasAsync(long userId, long businessId, string permission, CancellationToken ct);
}

/// <summary>
/// Mesma decisão do ComercialWeb web (AppServiceProvider Gate::before + spatie/laravel-permission com teams):
/// admin de plataforma recebe tudo exceto as alçadas discricionárias do negócio; os demais precisam da
/// permissão via papel ou atribuição direta, sempre no business_id da sessão.
/// Suporte de plataforma não tem janela de supervisão no app, então não recebe nada extra.
/// </summary>
public sealed class MySqlPermissionChecker(MySqlDataSource db) : IPermissionChecker
{
    private const string UserModel = @"App\Models\User";

    // Espelha App\Shared\Authorization\BusinessDiscretionPermissions. Item terminado em '.' é prefixo.
    private static readonly string[] Discretionary =
    [
        "sales.sell-blocked-customer",
        "sales.override-credit-limit",
        "sales.override-discount-limit",
        "sales.oversell-stock",
        "sales.conditional-final-consumer",
        "sales.final-consumer.",
        "inventory.allow-negative",
    ];

    public static bool IsDiscretionary(string permission) =>
        Discretionary.Any(d => d.EndsWith('.') ? permission.StartsWith(d, StringComparison.Ordinal) : permission == d);

    public async Task<bool> HasAsync(long userId, long businessId, string permission, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<bool>(new CommandDefinition(
            """
            SELECT
              (@allowPlatformAdmin AND EXISTS (
                  SELECT 1 FROM users WHERE id = @userId AND is_platform_admin = 1 AND deactivated_at IS NULL AND deleted_at IS NULL))
              OR EXISTS (
                  SELECT 1 FROM model_has_permissions mp JOIN permissions p ON p.id = mp.permission_id
                  WHERE mp.model_type = @model AND mp.model_id = @userId AND mp.business_id = @businessId
                    AND p.name = @permission AND p.guard_name = 'web')
              OR EXISTS (
                  SELECT 1 FROM model_has_roles mr
                  JOIN role_has_permissions rp ON rp.role_id = mr.role_id
                  JOIN permissions p ON p.id = rp.permission_id
                  WHERE mr.model_type = @model AND mr.model_id = @userId AND mr.business_id = @businessId
                    AND p.name = @permission AND p.guard_name = 'web')
            """,
            new { userId, businessId, permission, model = UserModel, allowPlatformAdmin = !IsDiscretionary(permission) },
            cancellationToken: ct));
    }
}

public static class PermissionEndpointExtensions
{
    /// <summary>Exige sessão válida e a permissão no tenant da sessão. Sem permissão: 403 genérico.</summary>
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, string permission) =>
        builder.RequireAuthorization().AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var ids = SessionIds.From(http.User);
            var checker = http.RequestServices.GetRequiredService<IPermissionChecker>();
            if (ids is null || !await checker.HasAsync(ids.UserId, ids.BusinessId, permission, http.RequestAborted))
                return Results.Problem(statusCode: StatusCodes.Status403Forbidden);
            return await next(ctx);
        });
}
