using Microsoft.AspNetCore.Hosting;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ComercialWeb.Mobile.Tests.Support;

/// <summary>API real em memória (pipeline completo: JWT, sessão, permissão) contra um TestDatabase.</summary>
public abstract class ApiFixture : IAsyncLifetime
{
    public const string Password = "senha-de-teste";
    public static readonly string PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password, 4);

    public TestDatabase Db { get; } = new();

    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        await Db.InitializeAsync();
        if (TestDatabase.Server is null) return;
        await SeedAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:ComercialWeb", Db.ConnectionString);
            ConfigureHost(b);
        });
    }

    protected abstract Task SeedAsync();

    /// <summary>Ponto de extensão para configurações e dublês específicos de uma suíte.</summary>
    protected virtual void ConfigureHost(IWebHostBuilder builder)
    {
    }

    public HttpClient Anonymous() => _factory!.CreateClient();

    public async Task<HttpClient> SignedInAsync(string login)
    {
        var client = _factory!.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { login, password = Password });
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<SessionDto>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!.AccessToken);
        return client;
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
        await Db.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private sealed record SessionDto(string AccessToken, string RefreshToken);
}
