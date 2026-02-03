namespace FamilyTreeApi.Models.Configuration;

/// <summary>
/// SMTP email configuration.
/// SECURITY: Use environment variables or secrets manager for credentials.
/// </summary>
public class EmailConfiguration
{
    public const string SectionName = "EmailSettings";

    /// <summary>
    /// SMTP server hostname.
    /// </summary>
    public string SmtpHost { get; set; } = "smtp.example.com";

    /// <summary>
    /// SMTP server port (typically 587 for TLS, 465 for SSL).
    /// </summary>
    public int SmtpPort { get; set; } = 587;

    /// <summary>
    /// SMTP authentication username.
    /// SECURITY: Load from environment variable ${SMTP_USERNAME}
    /// </summary>
    public string? SmtpUsername { get; set; }

    /// <summary>
    /// SMTP authentication password.
    /// SECURITY: Load from environment variable ${SMTP_PASSWORD}
    /// </summary>
    public string? SmtpPassword { get; set; }

    /// <summary>
    /// From email address for outgoing messages.
    /// </summary>
    public string FromEmail { get; set; } = "noreply@familytree.com";

    /// <summary>
    /// Display name for outgoing messages.
    /// </summary>
    public string FromName { get; set; } = "Family Tree Platform";

    /// <summary>
    /// Use SSL/TLS for SMTP connection.
    /// </summary>
    public bool UseSsl { get; set; } = true;

    /// <summary>
    /// Number of retry attempts for failed email sends.
    /// </summary>
    public int RetryCount { get; set; } = 3;

    /// <summary>
    /// Delay between retry attempts in seconds.
    /// </summary>
    public int RetryDelaySeconds { get; set; } = 2;

    /// <summary>
    /// Connection timeout in seconds.
    /// </summary>
    public int TimeoutSeconds { get; set; } = 30;

    /// <summary>
    /// Whether email sending is enabled.
    /// Set to false for development to skip actual email sending.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Log emails to console instead of sending (for development).
    /// </summary>
    public bool LogToConsole { get; set; } = false;
}
