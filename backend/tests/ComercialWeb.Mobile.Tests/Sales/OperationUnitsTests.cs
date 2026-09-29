using ComercialWeb.Mobile.Identity.Tenancy;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Sales;

/// <summary>Revalidação a cada request: unidade que deixa de ser operável cai no fallback, sem precisar relogar.</summary>
public sealed class OperationUnitsTests : IAsyncLifetime
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly Guid Session = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly TestDatabase _db = new();

    public async ValueTask InitializeAsync()
    {
        await _db.InitializeAsync();
        if (TestDatabase.Server is null) return;
        await _db.ExecuteAsync($"""
            INSERT INTO businesses (id, name, status) VALUES (10, 'A', 'active');
            INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', 'h');
            INSERT INTO storage_locations (id, business_id, type, name, primary_marker, is_active) VALUES
              (100, 10, 'unit', 'Matriz', 1, 1), (101, 10, 'unit', 'Filial', NULL, 1);
            INSERT INTO mobile_sessions (id, user_id, business_id, location_id, created_at, last_used_at, expires_at)
              VALUES ('{Session}', 1, 10, 101, NOW(), NOW(), NOW() + INTERVAL 1 DAY);
            """);
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();

    [Fact]
    public async Task Unidade_desativada_ou_proibida_depois_do_login_cai_no_fallback()
    {
        TestDatabase.RequireMySql();
        var units = new OperationUnits(_db.DataSource!);
        Assert.Equal(101, (await units.ForSessionAsync(Session, 1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE storage_locations SET is_active = 0 WHERE id = 101");
        Assert.Equal(100, (await units.ForSessionAsync(Session, 1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE storage_locations SET is_active = 1 WHERE id = 101");
        await _db.ExecuteAsync("INSERT INTO user_storage_locations (user_id, storage_location_id, business_id) VALUES (1, 100, 10)");
        Assert.Equal(100, (await units.ForSessionAsync(Session, 1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE storage_locations SET is_active = 0 WHERE id = 100");
        Assert.Null(await units.ForSessionAsync(Session, 1, 10, Ct));
    }
}
