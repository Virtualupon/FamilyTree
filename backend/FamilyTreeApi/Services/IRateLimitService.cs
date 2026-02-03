namespace FamilyTreeApi.Services;

/// <summary>
/// Rate limiting service for protecting registration, verification, and password reset flows.
/// Uses Redis for distributed rate limiting with database fallback.
/// </summary>
public interface IRateLimitService
{
    /// <summary>
    /// Check if an action is allowed under rate limits and increment the counter atomically.
    /// </summary>
    /// <param name="key">Rate limit key (e.g., "register:ip:192.168.1.1")</param>
    /// <param name="maxAttempts">Maximum allowed attempts in the window</param>
    /// <param name="window">Time window for the rate limit</param>
    /// <returns>Result indicating if action is allowed and remaining attempts</returns>
    Task<RateLimitResult> CheckAndIncrementAsync(string key, int maxAttempts, TimeSpan window);

    /// <summary>
    /// Reset rate limit for a key (e.g., after successful verification).
    /// </summary>
    /// <param name="key">Rate limit key to reset</param>
    Task ResetAsync(string key);

    /// <summary>
    /// Check if an email is temporarily locked due to too many failed attempts.
    /// </summary>
    /// <param name="email">Normalized email address</param>
    /// <returns>True if email is locked, false otherwise</returns>
    Task<bool> IsEmailLockedAsync(string email);

    /// <summary>
    /// Increment failed attempt counter for an email and check for lockout.
    /// </summary>
    /// <param name="email">Normalized email address</param>
    /// <returns>True if email is now locked, false otherwise</returns>
    Task<bool> IncrementEmailFailureAsync(string email);

    /// <summary>
    /// Get the remaining cooldown time for a resend operation.
    /// </summary>
    /// <param name="email">Normalized email address</param>
    /// <param name="purpose">Verification purpose (Registration/PasswordReset)</param>
    /// <returns>Remaining seconds, or 0 if no cooldown</returns>
    Task<int> GetResendCooldownSecondsAsync(string email, string purpose);

    /// <summary>
    /// Set the resend cooldown for an email/purpose combination.
    /// </summary>
    /// <param name="email">Normalized email address</param>
    /// <param name="purpose">Verification purpose</param>
    /// <param name="cooldownSeconds">Cooldown duration in seconds</param>
    Task SetResendCooldownAsync(string email, string purpose, int cooldownSeconds);
}

/// <summary>
/// Result of a rate limit check.
/// </summary>
public record RateLimitResult(
    /// <summary>Whether the action is allowed under rate limits.</summary>
    bool IsAllowed,

    /// <summary>Current count of attempts in the window.</summary>
    int CurrentCount,

    /// <summary>Maximum allowed attempts.</summary>
    int MaxAttempts,

    /// <summary>Seconds until the rate limit window resets (for Retry-After header).</summary>
    int? RetryAfterSeconds
);
