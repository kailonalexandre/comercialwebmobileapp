using System.Collections.Concurrent;

namespace ComercialWeb.Mobile.Identity.Application;

/// <summary>
/// Mesmas faixas do ComercialWeb web: 5 falhas/minuto e 20 falhas/hora por login+IP.
/// </summary>
// ponytail: contadores em memória por instância; durante blue-green (2 instâncias) o limite efetivo dobra.
// Migrar para Redis (já usado pelo ComercialWeb) quando houver mais de uma instância permanente.
public sealed class LoginThrottle(TimeProvider clock)
{
    private static readonly (int Max, TimeSpan Window)[] Tiers = [(5, TimeSpan.FromMinutes(1)), (20, TimeSpan.FromHours(1))];

    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _failures = new();

    public static string Identity(string login, string? ip) => $"{login.Trim().ToLowerInvariant()}|{ip}";

    /// <returns>Tempo de espera se bloqueado; null se liberado.</returns>
    public TimeSpan? RetryAfter(string identity)
    {
        if (!_failures.TryGetValue(identity, out var list)) return null;
        var now = clock.GetUtcNow();
        lock (list)
        {
            foreach (var (max, window) in Tiers)
            {
                var recent = list.Where(t => t > now - window).Order().ToList();
                if (recent.Count >= max) return recent[^max] + window - now;
            }
        }
        return null;
    }

    public void RecordFailure(string identity)
    {
        var now = clock.GetUtcNow();
        var list = _failures.GetOrAdd(identity, _ => []);
        lock (list)
        {
            list.RemoveAll(t => t <= now - Tiers[^1].Window);
            list.Add(now);
        }
    }

    public void Clear(string identity) => _failures.TryRemove(identity, out _);
}
