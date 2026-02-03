using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FamilyTreeApi.Models;

/// <summary>
/// Secure one-time token for two-phase registration.
/// Replaces storing password in Redis/sessionStorage.
///
/// SECURITY FIX: Instead of storing password hash in Redis with enumerable keys,
/// we store an encrypted blob with a cryptographically random token as the key.
/// The token is non-enumerable and the data is encrypted.
/// </summary>
public class RegistrationToken
{
    public long Id { get; set; }

    /// <summary>
    /// Cryptographically random token (64 bytes base64).
    /// Used as lookup key - NOT enumerable like email addresses.
    /// </summary>
    [Required]
    [MaxLength(128)]
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// Normalized lowercase email for the pending registration.
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Encrypted registration data (contains password hash, name, etc).
    /// Encrypted with Data Protection API or AES-256.
    /// </summary>
    [Required]
    public byte[] EncryptedData { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Initialization vector for AES decryption.
    /// </summary>
    [Required]
    [MaxLength(32)]
    public byte[] IV { get; set; } = Array.Empty<byte>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public bool IsUsed { get; set; }
    public DateTime? UsedAt { get; set; }

    /// <summary>
    /// Client IP address for auditing.
    /// </summary>
    [MaxLength(45)]
    public string? IpAddress { get; set; }

    /// <summary>
    /// Optimistic concurrency token.
    /// </summary>
    [ConcurrencyCheck]
    [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
    public uint RowVersion { get; set; }
}

/// <summary>
/// Decrypted registration data structure.
/// Serialized to JSON then encrypted before storage.
/// </summary>
public class PendingRegistrationData
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public Guid? HomeTownId { get; set; }
    public DateTime CreatedAt { get; set; }
}
