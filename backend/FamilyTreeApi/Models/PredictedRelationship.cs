using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FamilyTreeApi.Models;

/// <summary>
/// System-generated prediction for a missing relationship in a family tree.
/// Created by the prediction engine scanning rules and reviewed by admins.
/// </summary>
public class PredictedRelationship
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TreeId { get; set; }
    public Org Tree { get; set; } = null!;

    /// <summary>Rule that generated this prediction (e.g. 'spouse_child_gap')</summary>
    [Required, MaxLength(50)]
    public string RuleId { get; set; } = null!;

    /// <summary>Type of predicted relationship: 'parent_child' or 'union'</summary>
    [Required, MaxLength(30)]
    public string PredictedType { get; set; } = null!;

    [Required]
    public Guid SourcePersonId { get; set; }
    public Person SourcePerson { get; set; } = null!;

    [Required]
    public Guid TargetPersonId { get; set; }
    public Person TargetPerson { get; set; } = null!;

    /// <summary>Numeric confidence 0-100</summary>
    [Column(TypeName = "decimal(5,2)")]
    public decimal Confidence { get; set; }

    /// <summary>'High', 'Medium', or 'Low'</summary>
    [Required, MaxLength(20)]
    public string ConfidenceLevel { get; set; } = null!;

    /// <summary>Human-readable explanation of the prediction</summary>
    [Required]
    public string Explanation { get; set; } = null!;

    /// <summary>0=New, 1=Confirmed, 2=Dismissed, 3=Applied</summary>
    public PredictionStatus Status { get; set; } = PredictionStatus.New;

    public long? ResolvedByUserId { get; set; }
    public ApplicationUser? ResolvedByUser { get; set; }

    public DateTime? ResolvedAt { get; set; }

    [MaxLength(500)]
    public string? DismissReason { get; set; }

    /// <summary>When accepted, tracks the created entity type ('ParentChild' or 'Union')</summary>
    [MaxLength(50)]
    public string? AppliedEntityType { get; set; }

    /// <summary>When accepted, tracks the created entity ID</summary>
    public Guid? AppliedEntityId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Groups predictions from the same scan run</summary>
    public Guid? ScanBatchId { get; set; }
}

public enum PredictionStatus
{
    New = 0,
    Confirmed = 1,
    Dismissed = 2,
    Applied = 3
}
