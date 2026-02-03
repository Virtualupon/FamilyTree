using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FamilyTreeApi.Models;

/// <summary>
/// Stores email verification codes for registration and password reset.
/// Uses optimistic concurrency via RowVersion for race condition protection.
/// </summary>
public class EmailVerificationCode
{
    public long Id { get; set; }

    /// <summary>
    /// Normalized lowercase email address.
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// User ID - NULL for pre-registration codes (two-phase registration).
    /// Set after user is created for existing user verification flows.
    /// </summary>
    public long? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    /// <summary>
    /// 6-digit verification code. Stored as hash for security.
    /// </summary>
    [Required]
    [MaxLength(64)]
    public string CodeHash { get; set; } = string.Empty;

    /// <summary>
    /// Purpose of the verification code.
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Purpose { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public bool IsUsed { get; set; }
    public DateTime? UsedAt { get; set; }

    /// <summary>
    /// Track failed verification attempts per code.
    /// Max 5 attempts before code is invalidated.
    /// </summary>
    public int AttemptCount { get; set; }

    /// <summary>
    /// Client IP address for rate limiting auditing.
    /// </summary>
    [MaxLength(45)]
    public string? IpAddress { get; set; }

    /// <summary>
    /// Optimistic concurrency token.
    /// EF Core will check this value on updates to prevent race conditions.
    /// </summary>
    [ConcurrencyCheck]
    [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
    public uint RowVersion { get; set; }
}

/// <summary>
/// Purpose types for verification codes.
/// </summary>
public enum VerificationPurpose
{
    Registration,
    PasswordReset
}
