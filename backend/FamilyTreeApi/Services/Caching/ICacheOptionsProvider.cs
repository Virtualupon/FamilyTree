using Microsoft.Extensions.Caching.Distributed;

namespace FamilyTreeApi.Services.Caching;

public interface ICacheOptionsProvider
{
    DistributedCacheEntryOptions WithLifeTime(CacheLifeTime timeout);
}

/// <summary>
/// Represents a cache lifetime duration.
/// Uses struct (not ref struct) for async compatibility.
/// </summary>
public readonly struct CacheLifeTime
{
    private readonly TimeSpan _timeout;

    private CacheLifeTime(TimeSpan timeout) => _timeout = timeout;
    private CacheLifeTime(double minutes) => _timeout = TimeSpan.FromMinutes(minutes);

    public static implicit operator TimeSpan(CacheLifeTime cacheLifeTime) => cacheLifeTime._timeout;
    public static implicit operator CacheLifeTime(TimeSpan ts) => new(ts);
    public static implicit operator CacheLifeTime(double minutes) => new(minutes);

    // Predefined durations
    public static CacheLifeTime Short => TimeSpan.FromMinutes(15);
    public static CacheLifeTime Medium => TimeSpan.FromHours(1);
    public static CacheLifeTime Long => TimeSpan.FromHours(6);
    public static CacheLifeTime VeryLong => TimeSpan.FromHours(24);
    public static CacheLifeTime ReferenceData => TimeSpan.FromDays(7);
}
