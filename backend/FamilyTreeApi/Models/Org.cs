using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Represents a Family Tree (organization/workspace)
/// </summary>
public class Org
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Description of the family tree</summary>
    public string? Description { get; set; }

    /// <summary>JSON settings for the tree (theme, preferences, etc.)</summary>
    public string? SettingsJson { get; set; }

    /// <summary>Is this tree publicly viewable?</summary>
    public bool IsPublic { get; set; } = false;

    /// <summary>Allow linking to persons in other trees?</summary>
    public bool AllowCrossTreeLinking { get; set; } = true;

    /// <summary>Cover image URL for the tree</summary>
    [MaxLength(500)]
    public string? CoverImageUrl { get; set; }

    /// <summary>Primary owner of the tree</summary>
    public long? OwnerId { get; set; }
    public ApplicationUser? Owner { get; set; }

    /// <summary>
    /// Town/City this tree belongs to (REQUIRED).
    /// Per hierarchy rules: Every family tree must belong to a town.
    /// </summary>
    [Required]
    public Guid TownId { get; set; }
    public Town Town { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<OrgUser> OrgUsers { get; set; } = new List<OrgUser>();
    public ICollection<Person> People { get; set; } = new List<Person>();
    public ICollection<Family> Families { get; set; } = new List<Family>();
    public ICollection<Media> MediaFiles { get; set; } = new List<Media>();
    public ICollection<Place> Places { get; set; } = new List<Place>();
    public ICollection<AdminTreeAssignment> AdminAssignments { get; set; } = new List<AdminTreeAssignment>();
    public ICollection<TreeInvitation> Invitations { get; set; } = new List<TreeInvitation>();
}
