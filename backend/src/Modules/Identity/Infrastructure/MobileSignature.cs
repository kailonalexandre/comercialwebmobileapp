using System.Security.Cryptography;
using System.Text;

namespace ComercialWeb.Mobile.Identity.Infrastructure;

/// <summary>
/// Assinatura de máquina (.NET → ComercialWeb): HMAC-SHA256 de "{timestamp}\n{MÉTODO}\n{caminho}\n{corpo}" em hex minúsculo,
/// com o segredo compartilhado (ComercialWeb:MobileApiSecret = MOBILE_API_SECRET do Laravel). O corpo são os bytes exatos enviados.
/// </summary>
public static class MobileSignature
{
    public static string Sign(string secret, string timestamp, string method, string path, byte[] body)
    {
        byte[] message = [.. Encoding.UTF8.GetBytes($"{timestamp}\n{method}\n{path}\n"), .. body];
        return Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), message));
    }
}
