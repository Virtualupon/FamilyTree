using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FamilyTreeApi.Models;

public class AuditLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// User ID of the actor who performed the action. Nullable for system-generated entries.
    /// </summary>
    public long? ActorId { get; set; }
    public ApplicationUser? Actor { get; set; }

    [Required]
    [MaxLength(100)]
    public string EntityType { get; set; } = string.Empty;

    [Required]
    public Guid EntityId { get; set; }

    [Required]
    [MaxLength(50)]
    public string Action { get; set; } = string.Empty;

    public string? ChangeJson { get; set; }

    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string? IpAddress { get; set; }

    /// <summary>
    /// Reference to the suggestion that triggered this change (if applicable).
    /// </summary>
    public Guid? SuggestionId { get; set; }
    public RelationshipSuggestion? Suggestion { get; set; }

    /// <summary>
    /// JSON snapshot of entity state before the change. Used for rollback.
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? PreviousValuesJson { get; set; }

    /// <summary>
    /// JSON snapshot of entity state after the change.
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? NewValuesJson { get; set; }
}
