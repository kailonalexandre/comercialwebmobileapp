using System.Net;
using ComercialWeb.Mobile.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ComercialWeb.Mobile.Tests.Identity;

public sealed class MovableClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public sealed class TokenLifetimeFixture : ApiFixture
{
    public MovableClock Clock { get; } = new(DateTimeOffset.UtcNow);

    protected override void ConfigureHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(Clock));

    protected override Task SeedAsync() => Db.ExecuteAsync("""
        INSERT INTO businesses (id, name, status) VALUES (10, 'Empresa A', 'active');
        INSERT INTO users (id, name, username, email, password) VALUES (1, 'Ana', 'ana', 'ana@a.com', @hash);
        INSERT INTO business_user (business_id, user_id, status) VALUES (10, 1, 'active');
        """, new { hash = PasswordHash });
}

public sealed class TokenLifetimeApiTests(TokenLifetimeFixture api) : IClassFixture<TokenLifetimeFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Access_token_expira_em_10_minutos_com_tolerancia_de_30_segundos()
    {
        TestDatabase.RequireMySql();
        var start = api.Clock.Now;
        var client = await api.SignedInAsync("ana");

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);

        api.Clock.Now = start.AddMinutes(10).AddSeconds(20); // dentro da tolerância
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);

        api.Clock.Now = start.AddMinutes(11);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);

        api.Clock.Now = start.AddMinutes(-2); // emitido "no futuro" em relação ao relógio: recusado
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);
    }
}
