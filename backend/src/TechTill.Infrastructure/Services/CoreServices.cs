using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Caching.Memory;
using TechTill.Application.Common.Interfaces;

namespace TechTill.Infrastructure.Services;

public sealed class SystemDateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}

public sealed class BcryptPasswordHasher : IPasswordHasher
{
    // 11 keeps sign-in responsive on a shop PC while staying well above the default cost.
    private const int WorkFactor = 11;

    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public bool Verify(string password, string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}

/// <summary>
/// IMemoryCache wrapper with logical groups. Keys are tracked per group so one write can
/// drop every related entry, for example all dashboard aggregates after a sale.
/// </summary>
public sealed class MemoryCacheService(IMemoryCache cache) : ICacheService
{
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(5);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _groups = new();
    private readonly ConcurrentDictionary<string, Lazy<Task<object?>>> _building = new();

    public async Task<T> GetOrCreateAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null)
    {
        if (cache.TryGetValue(key, out var cached) && cached is T hit)
        {
            return hit;
        }

        // Single flight: callers that miss together wait for one build rather than each
        // starting their own, which is what turned one slow dashboard into a pile-up.
        var build = _building.GetOrAdd(key, _ => new Lazy<Task<object?>>(async () =>
        {
            var value = await factory().ConfigureAwait(false);
            cache.Set(key, value, ttl ?? DefaultTtl);
            Track(key);
            return value;
        }));

        try
        {
            return (T)(await build.Value.ConfigureAwait(false))!;
        }
        finally
        {
            _building.TryRemove(new KeyValuePair<string, Lazy<Task<object?>>>(key, build));
        }
    }

    public void Remove(string key)
    {
        cache.Remove(key);
        foreach (var group in _groups.Values)
        {
            group.TryRemove(key, out _);
        }
    }

    public void Mark(string key, TimeSpan ttl) => cache.Set(key, true, ttl);

    public bool IsMarked(string key) => cache.TryGetValue(key, out _);

    public int Increment(string key, TimeSpan window)
    {
        var counter = cache.GetOrCreate(key, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = window;
            return new StrongBox<int>();
        })!;

        return Interlocked.Increment(ref counter.Value);
    }

    public int CountOf(string key) => cache.TryGetValue(key, out StrongBox<int>? counter) ? counter!.Value : 0;

    public void RemoveGroup(string group)
    {
        if (!_groups.TryRemove(group, out var keys))
        {
            return;
        }

        foreach (var key in keys.Keys)
        {
            cache.Remove(key);
        }
    }

    private void Track(string key)
    {
        var group = key.Split(':', 2)[0];
        _groups.GetOrAdd(group, _ => new ConcurrentDictionary<string, byte>())[key] = 0;
    }
}
