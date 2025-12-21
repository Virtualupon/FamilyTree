using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Stores verified name transliterations between Arabic, English, and Nobiin scripts.
/// Used to ensure consistent spelling across the family tree and avoid repeated AI calls.
/// </summary>
public class NameMapping
{
    [Key]
    public int Id { get; set; }

    /// <summary>Arabic script representation of the name</summary>
    [MaxLength(200)]
    public string? Arabic { get; set; }

    /// <summary>Normalized Arabic for lookup (lowercase, no diacritics)</summary>
    [MaxLength(200)]
    public string? ArabicNormalized { get; set; }

    /// <summary>English/Latin script representation</summary>
    [MaxLength(200)]
    public string? English { get; set; }

    /// <summary>Normalized English for lookup (lowercase, no hyphens)</summary>
    [MaxLength(200)]
    public string? EnglishNormalized { get; set; }

    /// <summary>Nobiin (Old Nubian/Coptic script) representation</summary>
    [MaxLength(200)]
    public string? Nobiin { get; set; }

    /// <summary>Normalized Nobiin for lookup</summary>
    [MaxLength(200)]
    public string? NobiinNormalized { get; set; }

    /// <summary>IPA phonetic representation used for Nobiin mapping</summary>
    [MaxLength(200)]
    public string? Ipa { get; set; }

    /// <summary>Whether this mapping has been verified by a user</summary>
    public bool IsVerified { get; set; }

    /// <summary>Source of the mapping: "user", "ged", "ai"</summary>
    [MaxLength(50)]
    public string? Source { get; set; }

    /// <summary>AI confidence score (0.0 - 1.0) if source is "ai"</summary>
    public double? Confidence { get; set; }

    /// <summary>Whether this mapping needs human review</summary>
    public bool NeedsReview { get; set; }

    /// <summary>Timestamp when the mapping was created</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Timestamp when the mapping was last updated</summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>User ID who confirmed/verified this mapping</summary>
    public long? ConfirmedByUserId { get; set; }

    /// <summary>Navigation property to the confirming user</summary>
    public ApplicationUser? ConfirmedByUser { get; set; }

    /// <summary>Organization/tree this mapping belongs to (null for global mappings)</summary>
    public Guid? OrgId { get; set; }

    /// <summary>Navigation property to the organization</summary>
    public Org? Org { get; set; }
}
