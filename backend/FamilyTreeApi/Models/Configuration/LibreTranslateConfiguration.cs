namespace FamilyTreeApi.Models.Configuration;

/// <summary>
/// Configuration for LibreTranslate service connection.
/// </summary>
public class LibreTranslateConfiguration
{
    /// <summary>
    /// Configuration section name in appsettings.json
    /// </summary>
    public const string SectionName = "LibreTranslate";

    /// <summary>
    /// Base URL for LibreTranslate API (e.g., "http://localhost:5000")
    /// </summary>
    public string BaseUrl { get; set; } = "http://localhost:5000";

    /// <summary>
    /// Optional API key for authenticated LibreTranslate instances.
    /// Leave null or empty for unauthenticated instances.
    /// </summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// HTTP request timeout in seconds
    /// </summary>
    public int TimeoutSeconds { get; set; } = 10;

    /// <summary>
    /// Number of retry attempts for failed requests
    /// </summary>
    public int RetryCount { get; set; } = 3;

    /// <summary>
    /// Number of failures before circuit breaker opens
    /// </summary>
    public int CircuitBreakerFailureThreshold { get; set; } = 5;

    /// <summary>
    /// Duration in seconds circuit breaker stays open before allowing a test request
    /// </summary>
    public int CircuitBreakerDurationSeconds { get; set; } = 30;

    /// <summary>
    /// Whether LibreTranslate is enabled. If false, falls back to AI translation.
    /// </summary>
    public bool Enabled { get; set; } = true;
}
