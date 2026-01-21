using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

/// <summary>
/// Stores structured relationship suggestions from viewers.
/// Only Admins can approve and apply changes to canonical tree.
/// </summary>
public class RelationshipSuggestion
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    // Scope
    [Required]
    public Guid TownId { get; set; }
    public Town Town { get; set; } = null!;

    [Required]
    public Guid TreeId { get; set; }
    public Org Tree { get; set; } = null!;

    // Type and targets
    [Required]
    public SuggestionType Type { get; set; }

    public Guid? TargetPersonId { get; set; }
    public Person? TargetPerson { get; set; }

    public Guid? SecondaryPersonId { get; set; }
    public Person? SecondaryPerson { get; set; }

    public Guid? TargetUnionId { get; set; }
    public Union? TargetUnion { get; set; }

    /// <summary>
    /// JSON object containing proposed field values (names, dates, places, etc.)
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string ProposedValuesJson { get; set; } = "{}";

    // Relationship-specific fields
    public RelationshipType? RelationshipType { get; set; }
    public UnionType? UnionType { get; set; }
    public ConfidenceLevel Confidence { get; set; } = ConfidenceLevel.Probable;

    // Status workflow
    [Required]
    public SuggestionStatus Status { get; set; } = SuggestionStatus.Pending;

    [MaxLength(500)]
    public string? StatusReason { get; set; }

    // Submitter
    [Required]
    public long SubmittedByUserId { get; set; }
    public ApplicationUser SubmittedByUser { get; set; } = null!;

    [Required]
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(1000)]
    public string? SubmitterNotes { get; set; }

    // Reviewer
    public long? ReviewedByUserId { get; set; }
    public ApplicationUser? ReviewedByUser { get; set; }

    public DateTime? ReviewedAt { get; set; }

    [MaxLength(1000)]
    public string? ReviewerNotes { get; set; }

    // Applied change tracking (for approved suggestions)
    /// <summary>
    /// Type of entity created/modified when approved (Person, ParentChild, Union)
    /// </summary>
    [MaxLength(50)]
    public string? AppliedEntityType { get; set; }

    /// <summary>
    /// ID of entity created/modified when approved. Used for rollback.
    /// </summary>
    public Guid? AppliedEntityId { get; set; }

    /// <summary>
    /// JSON snapshot of entity state before approval. Used for rollback.
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? PreviousValuesJson { get; set; }

    // Soft delete
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    public long? DeletedByUserId { get; set; }
    public ApplicationUser? DeletedByUser { get; set; }

    // Timestamps
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<SuggestionEvidence> Evidence { get; set; } = new List<SuggestionEvidence>();
    public ICollection<SuggestionComment> Comments { get; set; } = new List<SuggestionComment>();
}
