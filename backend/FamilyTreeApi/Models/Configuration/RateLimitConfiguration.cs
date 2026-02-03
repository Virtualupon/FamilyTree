namespace FamilyTreeApi.Models.Configuration;

/// <summary>
/// Configuration for rate limiting security controls.
/// Configurable via appsettings.json under "RateLimiting" section.
/// </summary>
public class RateLimitConfiguration
{
    public const string SectionName = "RateLimiting";

    // ============================================================================
    // Per-Email Limits
    // ============================================================================

    /// <summary>
    /// Maximum verification codes that can be sent to a single email per day.
    /// Prevents abuse of email sending.
    /// </summary>
    public int MaxCodesPerEmailPerDay { get; set; } = 10;

    /// <summary>
    /// Maximum failed verification attempts per code before it's invalidated.
    /// Prevents brute force on individual codes.
    /// </summary>
    public int MaxVerificationAttemptsPerCode { get; set; } = 5;

    /// <summary>
    /// Minimum seconds between resend requests for the same email.
    /// Prevents rapid-fire resend abuse.
    /// </summary>
    public int ResendCooldownSeconds { get; set; } = 60;

    // ============================================================================
    // Per-IP Limits (Brute Force Protection)
    // ============================================================================

    /// <summary>
    /// Maximum registration initiations per IP per hour.
    /// Prevents mass registration attacks.
    /// </summary>
    public int MaxRegistrationsPerIpPerHour { get; set; } = 10;

    /// <summary>
    /// Maximum verification attempts per IP per hour.
    /// Prevents distributed brute force across multiple emails.
    /// </summary>
    public int MaxVerificationAttemptsPerIpPerHour { get; set; } = 30;

    /// <summary>
    /// Maximum forgot password requests per IP per hour.
    /// Prevents email enumeration via forgot password.
    /// </summary>
    public int MaxForgotPasswordPerIpPerHour { get; set; } = 10;

    // ============================================================================
    // Global / Account-Level Limits
    // ============================================================================

    /// <summary>
    /// Maximum total failed attempts for an email before temporary lockout.
    /// Aggregated across all codes for that email.
    /// </summary>
    public int MaxFailedAttemptsBeforeEmailLock { get; set; } = 15;

    /// <summary>
    /// Duration of temporary email lockout after max failures.
    /// </summary>
    public TimeSpan EmailLockDuration { get; set; } = TimeSpan.FromHours(1);

    // ============================================================================
    // Verification Code Settings
    // ============================================================================

    /// <summary>
    /// How long verification codes remain valid.
    /// </summary>
    public TimeSpan CodeValidityDuration { get; set; } = TimeSpan.FromHours(1);

    /// <summary>
    /// How long registration tokens remain valid.
    /// </summary>
    public TimeSpan RegistrationTokenValidityDuration { get; set; } = TimeSpan.FromHours(1);
}
