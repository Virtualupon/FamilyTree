using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Polly;
using Polly.CircuitBreaker;

namespace FamilyTreeApi.Services.Caching;

public interface IResilientCacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct = default) where T : class;
    Task<bool> SetAsync<T>(string key, T value, CacheLifeTime lifetime, CancellationToken ct = default) where T : class;
    Task RemoveAsync(string key, CancellationToken ct = default);
    Task RemoveMultipleAsync(IEnumerable<string> keys, CancellationToken ct = default);
}

/// <summary>
/// Cache wrapper with circuit breaker pattern for Redis resilience.
/// Prevents cascade failures when Redis is unavailable.
/// </summary>
public class ResilientCacheService : IResilientCacheService
{
    private readonly IDistributedCache _cache;
    private readonly ICacheOptionsProvider _options;
    private readonly ILogger<ResilientCacheService> _logger;
    private readonly AsyncCircuitBreakerPolicy _circuitBreaker;
    private readonly int _maxPayloadSize;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        MaxDepth = 64 // Prevent deeply nested payloads
    };

    public ResilientCacheService(
        IDistributedCache cache,
        ICacheOptionsProvider options,
        IConfiguration configuration,
        ILogger<ResilientCacheService> logger)
    {
        _cache = cache;
        _options = options;
        _logger = logger;

        var redisConfig = configuration.GetSection("Redis");
        _maxPayloadSize = redisConfig.GetValue("MaxPayloadSizeBytes", 5 * 1024 * 1024); // 5MB default
        var failureThreshold = redisConfig.GetValue("CircuitBreakerFailureThreshold", 5);
        var durationSeconds = redisConfig.GetValue("CircuitBreakerDurationSeconds", 30);

        // Circuit breaker: Open after N failures, stay open for M seconds
        _circuitBreaker = Policy
            .Handle<Exception>()
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking: failureThreshold,
                durationOfBreak: TimeSpan.FromSeconds(durationSeconds),
                onBreak: (ex, duration) =>
                {
                    _logger.LogWarning(ex,
                        "Cache circuit breaker OPEN for {Duration}s", duration.TotalSeconds);
                },
                onReset: () =>
                {
                    _logger.LogInformation("Cache circuit breaker CLOSED - Redis recovered");
                },
                onHalfOpen: () =>
                {
                    _logger.LogInformation("Cache circuit breaker HALF-OPEN - testing Redis");
                });
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct = default) where T : class
    {
        if (_circuitBreaker.CircuitState == CircuitState.Open)
        {
            _logger.LogDebug("Cache GET skipped - circuit breaker open: {Key}", key);
            return null;
        }

        try
        {
            return await _circuitBreaker.ExecuteAsync(async () =>
            {
                var json = await _cache.GetStringAsync(key, ct);
                if (string.IsNullOrEmpty(json))
                    return null;

                _logger.LogDebug("Cache HIT: {Key}", key);
                return JsonSerializer.Deserialize<T>(json, JsonOptions);
            });
        }
        catch (BrokenCircuitException)
        {
            _logger.LogDebug("Cache GET failed - circuit open: {Key}", key);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cache GET failed: {Key}", key);
            return null;
        }
    }

    public async Task<bool> SetAsync<T>(string key, T value, CacheLifeTime lifetime, CancellationToken ct = default) where T : class
    {
        if (_circuitBreaker.CircuitState == CircuitState.Open)
        {
            _logger.LogDebug("Cache SET skipped - circuit breaker open: {Key}", key);
            return false;
        }

        try
        {
            return await _circuitBreaker.ExecuteAsync(async () =>
            {
                var json = JsonSerializer.Serialize(value, JsonOptions);

                // SECURITY: Prevent caching excessively large payloads
                if (json.Length > _maxPayloadSize)
                {
                    _logger.LogWarning(
                        "Cache SET rejected - payload too large: {Key} ({Size} bytes > {Max} bytes)",
                        key, json.Length, _maxPayloadSize);
                    return false;
                }

                await _cache.SetStringAsync(key, json, _options.WithLifeTime(lifetime), ct);
                _logger.LogDebug("Cache SET: {Key} ({Size} bytes, TTL: {Lifetime})",
                    key, json.Length, (TimeSpan)lifetime);
                return true;
            });
        }
        catch (BrokenCircuitException)
        {
            _logger.LogDebug("Cache SET failed - circuit open: {Key}", key);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cache SET failed: {Key}", key);
            return false;
        }
    }

    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        if (_circuitBreaker.CircuitState == CircuitState.Open)
            return;

        try
        {
            await _circuitBreaker.ExecuteAsync(async () =>
            {
                await _cache.RemoveAsync(key, ct);
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cache REMOVE failed: {Key}", key);
        }
    }

    public async Task RemoveMultipleAsync(IEnumerable<string> keys, CancellationToken ct = default)
    {
        // Remove all keys - don't stop on individual failures
        var tasks = keys.Select(k => RemoveAsync(k, ct));
        await Task.WhenAll(tasks);
    }
}
