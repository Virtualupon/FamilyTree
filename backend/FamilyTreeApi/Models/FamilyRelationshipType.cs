using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Lookup table for family relationship types with trilingual support (Arabic, English, Nubian).
/// Contains 38 standard relationship types like Father, Mother, Brother, Sister, etc.
/// </summary>
public class FamilyRelationshipType
{
    [Key]
    public int Id { get; set; }

    /// <summary>Arabic name of the relationship</summary>
    [Required]
    [MaxLength(100)]
    public string NameArabic { get; set; } = string.Empty;

    /// <summary>English name of the relationship</summary>
    [Required]
    [MaxLength(100)]
    public string NameEnglish { get; set; } = string.Empty;

    /// <summary>Nubian name of the relationship</summary>
    [Required]
    [MaxLength(100)]
    public string NameNubian { get; set; } = string.Empty;

    /// <summary>Category for grouping (e.g., "Immediate", "Grandparents", "Uncles/Aunts", "Cousins", "Nephews/Nieces", "In-Laws", "Step")</summary>
    [MaxLength(50)]
    public string? Category { get; set; }

    /// <summary>Display order within category</summary>
    public int SortOrder { get; set; } = 0;

    /// <summary>Whether this relationship type is active and available for selection</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>When this record was created</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
