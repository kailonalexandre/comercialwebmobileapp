using ComercialWeb.Mobile.Identity.Tenancy;
using ComercialWeb.Mobile.Tests.Support;

namespace ComercialWeb.Mobile.Tests.Sales;

/// <summary>Unidade resolvida a cada chamada, como na web: mudanças valem sem relogar.</summary>
public sealed class OperationUnitsTests : IAsyncLifetime
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly TestDatabase _db = new();

    public async ValueTask InitializeAsync()
    {
        await _db.InitializeAsync();
        if (TestDatabase.Server is null) return;
        await _db.ExecuteAsync("""
            INSERT INTO businesses (id, name, status) VALUES (10, 'A', 'active');
            INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', 'h');
            INSERT INTO storage_locations (id, business_id, type, name, primary_marker, is_active) VALUES
              (100, 10, 'unit', 'Matriz', 1, 1), (101, 10, 'unit', 'Filial', NULL, 1);
            INSERT INTO user_preferences (user_id, current_business_id, current_location_id) VALUES (1, 10, 101);
            """);
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();

    [Fact]
    public async Task Segue_a_preferencia_da_web_e_cai_no_fallback_quando_ela_deixa_de_ser_operavel()
    {
        TestDatabase.RequireMySql();
        var units = new OperationUnits(_db.DataSource!);
        Assert.Equal(101, (await units.CurrentAsync(1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE user_preferences SET current_location_id = 100 WHERE user_id = 1"); // trocou no navegador
        Assert.Equal(100, (await units.CurrentAsync(1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE user_preferences SET current_location_id = 101 WHERE user_id = 1");
        await _db.ExecuteAsync("UPDATE storage_locations SET is_active = 0 WHERE id = 101");
        Assert.Equal(100, (await units.CurrentAsync(1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE storage_locations SET is_active = 1 WHERE id = 101");
        await _db.ExecuteAsync("INSERT INTO user_storage_locations (user_id, storage_location_id, business_id) VALUES (1, 100, 10)");
        Assert.Equal(100, (await units.CurrentAsync(1, 10, Ct))!.Id);

        await _db.ExecuteAsync("UPDATE storage_locations SET is_active = 0 WHERE id = 100");
        Assert.Null(await units.CurrentAsync(1, 10, Ct));
    }
}
