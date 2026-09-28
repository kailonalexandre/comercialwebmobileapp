using System.Security.Cryptography;
using ComercialWeb.Mobile.Identity.Application;
using ComercialWeb.Mobile.Identity.Infrastructure;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ComercialWeb.Mobile.Tests.Identity;

public sealed class AuthServiceTests
{
    private const string Password = "senha-correta";
    private static readonly string Hash = BCrypt.Net.BCrypt.HashPassword(Password, 4);
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly FakeIdentityStore _store = new();
    private readonly ManualClock _clock = new(new DateTimeOffset(2026, 9, 28, 12, 0, 0, TimeSpan.Zero));
    private readonly JwtSettings _jwt = new("test-issuer", "test-audience", new ECDsaSecurityKey(ECDsa.Create(ECCurve.NamedCurves.nistP256)));
    private readonly AuthService _auth;

    public AuthServiceTests()
    {
        _store.Users.Add(new(1, "ana@empresa.com", "ana", Hash));
        _store.ActiveMemberships.Add((1, 10));
        _store.ActiveMemberships.Add((1, 20));
        _store.Preferences[1] = 20;
        _auth = new AuthService(_store, new TokenIssuer(_jwt), new LoginThrottle(_clock), _clock);
    }

    private Task<AuthResult> Login(string login = "ana@empresa.com", string password = Password) =>
        _auth.LoginAsync(login, password, "10.0.0.1", "Pixel", Ct);

    [Fact]
    public async Task Login_por_email_ou_usuario_emite_tokens_na_empresa_preferida()
    {
        foreach (var login in new[] { "ana@empresa.com", "ana" })
        {
            var result = await Login(login);

            Assert.NotNull(result.Session);
            var jwt = new JsonWebToken(result.Session.AccessToken);
            Assert.Equal("1", jwt.Subject);
            Assert.Equal("20", jwt.GetClaim(TokenIssuer.BusinessClaim).Value);
            Assert.Equal(_clock.Now + TokenIssuer.AccessLifetime, result.Session.ExpiresAt);
        }
    }

    [Fact]
    public async Task Access_token_valida_com_a_chave_do_servidor_e_nao_com_outra()
    {
        var token = (await Login()).Session!.AccessToken;
        var handler = new JsonWebTokenHandler();
        TokenValidationParameters With(SecurityKey key) => new()
        {
            ValidIssuer = "test-issuer",
            ValidAudience = "test-audience",
            IssuerSigningKey = key,
            LifetimeValidator = (_, _, _, _) => true,
        };

        Assert.True((await handler.ValidateTokenAsync(token, With(_jwt.SigningKey))).IsValid);
        Assert.False((await handler.ValidateTokenAsync(token, With(new ECDsaSecurityKey(ECDsa.Create(ECCurve.NamedCurves.nistP256))))).IsValid);
    }

    [Theory]
    [InlineData("ana@empresa.com", "errada")]
    [InlineData("naoexiste@empresa.com", Password)]
    public async Task Credencial_invalida_falha_sem_distinguir_o_motivo(string login, string password)
    {
        var result = await Login(login, password);

        Assert.Null(result.Session);
        Assert.Equal(AuthFailure.InvalidCredentials, result.Failure);
    }

    [Fact]
    public async Task Senha_correta_sem_empresa_ativa_falha_igual_a_senha_errada()
    {
        _store.ActiveMemberships.Clear();

        Assert.Equal(AuthFailure.InvalidCredentials, (await Login()).Failure);
    }

    [Fact]
    public async Task Bloqueia_apos_cinco_falhas_mesmo_com_senha_correta_e_libera_depois_de_um_minuto()
    {
        for (var i = 0; i < 5; i++) await Login(password: "errada");

        var locked = await Login();
        Assert.Equal(AuthFailure.LockedOut, locked.Failure);
        Assert.True(locked.RetryAfter > TimeSpan.Zero);

        _clock.Now += TimeSpan.FromMinutes(1) + TimeSpan.FromSeconds(1);
        Assert.NotNull((await Login()).Session);
    }

    [Fact]
    public async Task Refresh_rotaciona_e_reuso_do_token_antigo_revoga_a_sessao()
    {
        var first = (await Login()).Session!;
        var second = (await _auth.RefreshAsync(first.RefreshToken, Ct)).Session;
        Assert.NotNull(second);
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);

        // Atacante reapresenta o token já usado: sessão inteira cai, inclusive o token legítimo novo.
        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(first.RefreshToken, Ct)).Failure);
        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(second.RefreshToken, Ct)).Failure);
        Assert.Equal("refresh_reuse", _store.Sessions.Values.Single().Reason);
    }

    [Fact]
    public async Task Refresh_falha_e_revoga_quando_usuario_perde_vinculo_com_a_empresa_da_sessao()
    {
        var session = (await Login()).Session!;
        _store.ActiveMemberships.Remove((1, 20));

        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(session.RefreshToken, Ct)).Failure);
        Assert.Equal("account_inactive", _store.Sessions.Values.Single().Reason);
    }

    [Fact]
    public async Task Refresh_expirado_ou_apos_logout_falha()
    {
        var a = (await Login()).Session!;
        _clock.Now += AuthService.RefreshLifetime + TimeSpan.FromSeconds(1);
        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(a.RefreshToken, Ct)).Failure);

        var b = (await Login()).Session!;
        var sessionId = Guid.Parse(new JsonWebToken(b.AccessToken).GetClaim(TokenIssuer.SessionClaim).Value);
        await _auth.LogoutAsync(sessionId, Ct);
        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(b.RefreshToken, Ct)).Failure);
    }

    [Theory]
    [InlineData("")]
    [InlineData("curto")]
    [InlineData("' OR 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    public async Task Refresh_malformado_e_rejeitado_sem_consultar_o_banco(string token)
    {
        Assert.Equal(AuthFailure.InvalidToken, (await _auth.RefreshAsync(token, Ct)).Failure);
    }
}
