using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Represents a Family group within a family tree.
/// Families are used to group people together (e.g., by surname or lineage).
/// Hierarchy: Town -> Org (Family Tree) -> Family -> Person
/// </summary>
public class Family
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Primary/default family name</summary>
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>English name</summary>
    [MaxLength(200)]
    public string? NameEn { get; set; }

    /// <summary>Arabic name</summary>
    [MaxLength(200)]
    public string? NameAr { get; set; }

    /// <summary>Nobiin/local language name</summary>
    [MaxLength(200)]
    public string? NameLocal { get; set; }

    /// <summary>Description of the family</summary>
    public string? Description { get; set; }

    /// <summary>
    /// The family tree (Org) this family belongs to.
    /// REQUIRED - every family must belong to a tree.
    /// </summary>
    [Required]
    public Guid OrgId { get; set; }
    public Org Org { get; set; } = null!;

    /// <summary>
    /// Town this family is associated with (denormalized for easier queries).
    /// REQUIRED - inherited from the Org.
    /// </summary>
    [Required]
    public Guid TownId { get; set; }
    public Town Town { get; set; } = null!;

    /// <summary>Optional reference to the founding male ancestor</summary>
    public Guid? PatriarchId { get; set; }
    public Person? Patriarch { get; set; }

    /// <summary>Optional reference to the founding female ancestor</summary>
    public Guid? MatriarchId { get; set; }
    public Person? Matriarch { get; set; }

    /// <summary>Hex color for UI display (e.g., #FF5733)</summary>
    [MaxLength(7)]
    public string? Color { get; set; }

    /// <summary>Sort order for custom ordering in lists</summary>
    public int SortOrder { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<Person> Members { get; set; } = new List<Person>();
}
