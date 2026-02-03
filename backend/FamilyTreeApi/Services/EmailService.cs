using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using FamilyTreeApi.Models.Configuration;
using Polly;
using Polly.Retry;

namespace FamilyTreeApi.Services;

/// <summary>
/// SMTP email service with retry logic and development mode support.
/// </summary>
public class EmailService : IEmailService
{
    private readonly EmailConfiguration _config;
    private readonly ILogger<EmailService> _logger;
    private readonly AsyncRetryPolicy _retryPolicy;

    public EmailService(
        IOptions<EmailConfiguration> config,
        ILogger<EmailService> logger)
    {
        _config = config.Value;
        _logger = logger;

        // Configure retry policy with exponential backoff
        _retryPolicy = Policy
            .Handle<SmtpException>()
            .Or<TimeoutException>()
            .WaitAndRetryAsync(
                _config.RetryCount,
                retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt) * _config.RetryDelaySeconds),
                (exception, timeSpan, retryCount, context) =>
                {
                    _logger.LogWarning(exception,
                        "Email send attempt {RetryCount} failed. Retrying in {Delay}s",
                        retryCount, timeSpan.TotalSeconds);
                });
    }

    public async Task<EmailSendResult> SendVerificationCodeAsync(string email, string code, string? userName)
    {
        var greeting = !string.IsNullOrEmpty(userName) ? $"Hi {userName}," : "Hi,";
        var subject = "Verify your email - Family Tree Platform";
        var body = $@"
{greeting}

Welcome to the Family Tree Platform! Please verify your email address using the code below:

{code}

This code will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

Best regards,
The Family Tree Team
";

        var htmlBody = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .code {{ font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }}
        .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class=""container"">
        <h2>Verify Your Email</h2>
        <p>{greeting}</p>
        <p>Welcome to the Family Tree Platform! Please verify your email address using the code below:</p>
        <div class=""code"">{code}</div>
        <p>This code will expire in <strong>1 hour</strong>.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <div class=""footer"">
            <p>Best regards,<br>The Family Tree Team</p>
        </div>
    </div>
</body>
</html>
";

        return await SendEmailAsync(email, subject, body, htmlBody);
    }

    public async Task<EmailSendResult> SendPasswordResetCodeAsync(string email, string code, string? userName)
    {
        var greeting = !string.IsNullOrEmpty(userName) ? $"Hi {userName}," : "Hi,";
        var subject = "Reset your password - Family Tree Platform";
        var body = $@"
{greeting}

We received a request to reset your password. Use the code below to reset it:

{code}

This code will expire in 1 hour.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The Family Tree Team
";

        var htmlBody = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .code {{ font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }}
        .warning {{ background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 4px; margin: 15px 0; }}
        .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class=""container"">
        <h2>Reset Your Password</h2>
        <p>{greeting}</p>
        <p>We received a request to reset your password. Use the code below to reset it:</p>
        <div class=""code"">{code}</div>
        <p>This code will expire in <strong>1 hour</strong>.</p>
        <div class=""warning"">
            <strong>Didn't request this?</strong> Please ignore this email. Your password will remain unchanged.
        </div>
        <div class=""footer"">
            <p>Best regards,<br>The Family Tree Team</p>
        </div>
    </div>
</body>
</html>
";

        return await SendEmailAsync(email, subject, body, htmlBody);
    }

    public async Task<EmailSendResult> SendExistingAccountNotificationAsync(string email)
    {
        var subject = "Sign-in attempt - Family Tree Platform";
        var body = @"
Hi,

Someone tried to create a new account using this email address, but an account already exists.

If this was you, please sign in to your existing account instead of creating a new one.
If you've forgotten your password, use the ""Forgot Password"" option to reset it.

If you didn't attempt to register, you can safely ignore this email.

Best regards,
The Family Tree Team
";

        var htmlBody = @"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .info { background: #d1ecf1; border: 1px solid #bee5eb; padding: 10px; border-radius: 4px; margin: 15px 0; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class=""container"">
        <h2>Sign-in Attempt Detected</h2>
        <p>Hi,</p>
        <p>Someone tried to create a new account using this email address, but an account already exists.</p>
        <div class=""info"">
            <strong>If this was you:</strong> Please sign in to your existing account instead. If you've forgotten your password, use the ""Forgot Password"" option.
        </div>
        <p>If you didn't attempt to register, you can safely ignore this email.</p>
        <div class=""footer"">
            <p>Best regards,<br>The Family Tree Team</p>
        </div>
    </div>
</body>
</html>
";

        return await SendEmailAsync(email, subject, body, htmlBody);
    }

    private async Task<EmailSendResult> SendEmailAsync(string to, string subject, string textBody, string htmlBody)
    {
        // Development mode - log instead of sending
        if (!_config.Enabled || _config.LogToConsole)
        {
            _logger.LogInformation(
                "EMAIL (Dev Mode) To: {To}, Subject: {Subject}\n{Body}",
                to, subject, textBody);
            return new EmailSendResult(true);
        }

        try
        {
            return await _retryPolicy.ExecuteAsync(async () =>
            {
                using var client = new SmtpClient(_config.SmtpHost, _config.SmtpPort)
                {
                    EnableSsl = _config.UseSsl,
                    Timeout = _config.TimeoutSeconds * 1000
                };

                if (!string.IsNullOrEmpty(_config.SmtpUsername))
                {
                    client.Credentials = new NetworkCredential(_config.SmtpUsername, _config.SmtpPassword);
                }

                using var message = new MailMessage
                {
                    From = new MailAddress(_config.FromEmail, _config.FromName),
                    Subject = subject,
                    Body = textBody,
                    IsBodyHtml = false
                };

                message.To.Add(to);

                // Add HTML alternative view
                var htmlView = AlternateView.CreateAlternateViewFromString(htmlBody, null, "text/html");
                message.AlternateViews.Add(htmlView);

                await client.SendMailAsync(message);

                _logger.LogInformation("Email sent successfully to {To}: {Subject}", to, subject);
                return new EmailSendResult(true);
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {To}: {Subject}", to, subject);
            return new EmailSendResult(false, ex.Message);
        }
    }
}
