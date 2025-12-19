using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

/// <summary>
/// Invitation to join a family tree with a specific role
/// </summary>
public class TreeInvitation
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The tree being invited to</summary>
    [Required]
    public Guid TreeId { get; set; }
    public Org Tree { get; set; } = null!;

    /// <summary>Email address of the invitee</summary>
    [Required]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    /// <summary>Role the invitee will have when they accept</summary>
    public OrgRole Role { get; set; } = OrgRole.Viewer;

    /// <summary>Unique token for the invitation link</summary>
    [Required]
    [MaxLength(100)]
    public string Token { get; set; } = string.Empty;

    /// <summary>User who sent the invitation</summary>
    [Required]
    public long InvitedByUserId { get; set; }
    public ApplicationUser InvitedByUser { get; set; } = null!;

    /// <summary>When the invitation expires</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>When the invitation was accepted (null if not yet)</summary>
    public DateTime? AcceptedAt { get; set; }

    /// <summary>User who accepted (may be different email if they had existing account)</summary>
    public long? AcceptedByUserId { get; set; }
    public ApplicationUser? AcceptedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Check if invitation is still valid</summary>
    public bool IsValid => AcceptedAt == null && ExpiresAt > DateTime.UtcNow;
}
