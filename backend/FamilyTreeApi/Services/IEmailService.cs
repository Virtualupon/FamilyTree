namespace FamilyTreeApi.Services;

/// <summary>
/// Email service for sending verification codes and notifications.
/// </summary>
public interface IEmailService
{
    /// <summary>
    /// Send a verification code email for registration.
    /// </summary>
    /// <param name="email">Recipient email address</param>
    /// <param name="code">6-digit verification code</param>
    /// <param name="userName">Optional user's first name for personalization</param>
    /// <returns>Result indicating success or failure</returns>
    Task<EmailSendResult> SendVerificationCodeAsync(string email, string code, string? userName);

    /// <summary>
    /// Send a password reset code email.
    /// </summary>
    /// <param name="email">Recipient email address</param>
    /// <param name="code">6-digit reset code</param>
    /// <param name="userName">Optional user's first name for personalization</param>
    /// <returns>Result indicating success or failure</returns>
    Task<EmailSendResult> SendPasswordResetCodeAsync(string email, string code, string? userName);

    /// <summary>
    /// Send notification when someone tries to register with an existing email.
    /// This prevents email enumeration while alerting the legitimate owner.
    /// </summary>
    /// <param name="email">Recipient email address</param>
    /// <returns>Result indicating success or failure</returns>
    Task<EmailSendResult> SendExistingAccountNotificationAsync(string email);
}

/// <summary>
/// Result of an email send operation.
/// </summary>
public record EmailSendResult(
    /// <summary>Whether the email was sent successfully.</summary>
    bool Success,

    /// <summary>Error message if sending failed.</summary>
    string? ErrorMessage = null
);
