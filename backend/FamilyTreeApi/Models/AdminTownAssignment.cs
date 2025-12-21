using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Assigns an Admin-level user to manage specific towns and all trees within them.
/// This enables town-scoped access control for the hierarchy: Town → Tree → Family → Person
/// </summary>
public class AdminTownAssignment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The admin user being assigned to the town</summary>
    [Required]
    public long UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    /// <summary>The town the admin can manage (and all trees within it)</summary>
    [Required]
    public Guid TownId { get; set; }
    public Town Town { get; set; } = null!;

    /// <summary>Who made this assignment (typically SuperAdmin)</summary>
    public long? AssignedByUserId { get; set; }
    public ApplicationUser? AssignedByUser { get; set; }

    /// <summary>When this assignment was created</summary>
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Soft delete flag - inactive assignments are ignored</summary>
    public bool IsActive { get; set; } = true;
}
