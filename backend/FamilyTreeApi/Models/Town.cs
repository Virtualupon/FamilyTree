using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Represents a Town/City that can contain multiple family trees.
/// This is the top-level geographic container in the hierarchy.
/// </summary>
public class Town
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Default/primary name of the town</summary>
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>English name</summary>
    [MaxLength(200)]
    public string? NameEn { get; set; }

    /// <summary>Arabic name</summary>
    [MaxLength(200)]
    public string? NameAr { get; set; }

    /// <summary>Local language name</summary>
    [MaxLength(200)]
    public string? NameLocal { get; set; }

    /// <summary>Description of the town</summary>
    public string? Description { get; set; }

    /// <summary>Country the town belongs to</summary>
    [MaxLength(100)]
    public string? Country { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<Org> FamilyTrees { get; set; } = new List<Org>();
}
