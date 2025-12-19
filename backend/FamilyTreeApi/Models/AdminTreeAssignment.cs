using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Assigns an Admin-level user to manage specific family trees
/// </summary>
public class AdminTreeAssignment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The admin user being assigned</summary>
    [Required]
    public long UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    /// <summary>The tree they can manage</summary>
    [Required]
    public Guid TreeId { get; set; }
    public Org Tree { get; set; } = null!;

    /// <summary>Who made this assignment (typically SuperAdmin)</summary>
    public long? AssignedByUserId { get; set; }
    public ApplicationUser? AssignedByUser { get; set; }

    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}
