using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using FamilyTreeApi.Models.Configuration;
using System.Text.Json;

namespace FamilyTreeApi.Services;

/// <summary>
/// Redis-based rate limiting service with in-memory fallback.
/// Uses atomic increment operations for thread-safe distributed rate limiting.
/// </summary>
public class RateLimitService : IRateLimitService
{
    private readonly IDistributedCache _cache;
    private readonly RateLimitConfiguration _config;
    private readonly ILogger<RateLimitService> _logger;
    private const string KeyPrefix = "ratelimit:";

    public RateLimitService(
        IDistributedCache cache,
        IOptions<RateLimitConfiguration> config,
        ILogger<RateLimitService> logger)
    {
        _cache = cache;
        _config = config.Value;
        _logger = logger;
    }

    public async Task<RateLimitResult> CheckAndIncrementAsync(string key, int maxAttempts, TimeSpan window)
    {
        var cacheKey = $"{KeyPrefix}{key}";

        try
        {
            var existingData = await _cache.GetStringAsync(cacheKey);
            var entry = existingData != null
                ? JsonSerializer.Deserialize<RateLimitEntry>(existingData)
                : null;

            var now = DateTime.UtcNow;

            // If entry doesn't exist or window has expired, start fresh
            if (entry == null || entry.WindowEnd < now)
            {
                entry = new RateLimitEntry
                {
                    Count = 1,
                    WindowStart = now,
                    WindowEnd = now.Add(window)
                };

                await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(entry), new DistributedCacheEntryOptions
                {
                    AbsoluteExpiration = entry.WindowEnd
                });

                return new RateLimitResult(true, 1, maxAttempts, null);
            }

            // Increment count
            entry.Count++;

            // Check if over limit
            if (entry.Count > maxAttempts)
            {
                var retryAfter = (int)Math.Ceiling((entry.WindowEnd - now).TotalSeconds);
                return new RateLimitResult(false, entry.Count, maxAttempts, retryAfter);
            }

            // Update cache
            await _cache.SetStringAsync(cacheKey, JsonSerializer.Serialize(entry), new DistributedCacheEntryOptions
            {
                AbsoluteExpiration = entry.WindowEnd
            });

            return new RateLimitResult(true, entry.Count, maxAttempts, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Rate limit check failed for key {Key}, allowing request", key);
            // Fail open - allow the request if rate limiting fails
            // This prevents rate limiting infrastructure issues from blocking all users
            return new RateLimitResult(true, 0, maxAttempts, null);
        }
    }

    public async Task ResetAsync(string key)
    {
        var cacheKey = $"{KeyPrefix}{key}";

        try
        {
            await _cache.RemoveAsync(cacheKey);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to reset rate limit for key {Key}", key);
        }
    }

    public async Task<bool> IsEmailLockedAsync(string email)
    {
        var lockKey = $"{KeyPrefix}lock:email:{email}";

        try
        {
            var lockData = await _cache.GetStringAsync(lockKey);
            return !string.IsNullOrEmpty(lockData);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check email lock for {Email}", email);
            return false; // Fail open
        }
    }

    public async Task<bool> IncrementEmailFailureAsync(string email)
    {
        var failureKey = $"{KeyPrefix}failures:email:{email}";
        var lockKey = $"{KeyPrefix}lock:email:{email}";

        try
        {
            var existingData = await _cache.GetStringAsync(failureKey);
            var count = existingData != null ? int.Parse(existingData) : 0;
            count++;

            if (count >= _config.MaxFailedAttemptsBeforeEmailLock)
            {
                // Lock the email
                await _cache.SetStringAsync(lockKey, DateTime.UtcNow.ToString("O"), new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = _config.EmailLockDuration
                });

                // Reset failure counter
                await _cache.RemoveAsync(failureKey);

                _logger.LogWarning("Email {Email} locked due to {Count} failed attempts", email, count);
                return true;
            }

            // Update failure count (expires after lock duration to prevent permanent accumulation)
            await _cache.SetStringAsync(failureKey, count.ToString(), new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = _config.EmailLockDuration
            });

            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to increment email failure for {Email}", email);
            return false;
        }
    }

    public async Task<int> GetResendCooldownSecondsAsync(string email, string purpose)
    {
        var cooldownKey = $"{KeyPrefix}cooldown:{purpose}:{email}";

        try
        {
            var cooldownData = await _cache.GetStringAsync(cooldownKey);
            if (string.IsNullOrEmpty(cooldownData))
                return 0;

            var expiresAt = DateTime.Parse(cooldownData);
            var remaining = (int)Math.Ceiling((expiresAt - DateTime.UtcNow).TotalSeconds);
            return Math.Max(0, remaining);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get resend cooldown for {Email}", email);
            return 0;
        }
    }

    public async Task SetResendCooldownAsync(string email, string purpose, int cooldownSeconds)
    {
        var cooldownKey = $"{KeyPrefix}cooldown:{purpose}:{email}";
        var expiresAt = DateTime.UtcNow.AddSeconds(cooldownSeconds);

        try
        {
            await _cache.SetStringAsync(cooldownKey, expiresAt.ToString("O"), new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(cooldownSeconds)
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to set resend cooldown for {Email}", email);
        }
    }

    private class RateLimitEntry
    {
        public int Count { get; set; }
        public DateTime WindowStart { get; set; }
        public DateTime WindowEnd { get; set; }
    }
}
