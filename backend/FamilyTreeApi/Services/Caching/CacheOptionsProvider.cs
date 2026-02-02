using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Distributed;

namespace FamilyTreeApi.Services.Caching;

/// <summary>
/// Thread-safe cache options provider that pools DistributedCacheEntryOptions instances.
/// Registered as Singleton - must be thread-safe.
/// </summary>
internal class CacheOptionsProvider : ICacheOptionsProvider
{
    // CRITICAL: Use ConcurrentDictionary for thread safety (Singleton service)
    private readonly ConcurrentDictionary<TimeSpan, DistributedCacheEntryOptions> _options = new();

    public DistributedCacheEntryOptions WithLifeTime(CacheLifeTime timeout)
    {
        TimeSpan ts = timeout;
        return _options.GetOrAdd(ts, CreateOptions);
    }

    private static DistributedCacheEntryOptions CreateOptions(TimeSpan ts)
    {
        return new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ts
        };
    }
}
