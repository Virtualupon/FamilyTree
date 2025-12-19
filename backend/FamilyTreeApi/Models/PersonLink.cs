using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

/// <summary>
/// Links a person in one tree to a person in another tree
/// Useful for shared ancestors across family branches
/// </summary>
public class PersonLink
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Person in the source tree requesting the link</summary>
    [Required]
    public Guid SourcePersonId { get; set; }
    public Person SourcePerson { get; set; } = null!;

    /// <summary>Person in the target tree being linked to</summary>
    [Required]
    public Guid TargetPersonId { get; set; }
    public Person TargetPerson { get; set; } = null!;

    /// <summary>Type of link (SamePerson, Ancestor, Related)</summary>
    public PersonLinkType LinkType { get; set; } = PersonLinkType.SamePerson;

    /// <summary>Confidence level 0-100%</summary>
    public int Confidence { get; set; } = 100;

    public string? Notes { get; set; }

    /// <summary>User who created the link request</summary>
    public long? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }

    /// <summary>User who approved/rejected the link</summary>
    public long? ApprovedByUserId { get; set; }
    public ApplicationUser? ApprovedByUser { get; set; }

    /// <summary>Approval status</summary>
    public PersonLinkStatus Status { get; set; } = PersonLinkStatus.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
