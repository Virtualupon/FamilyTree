using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

public class ParentChild
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ParentId { get; set; }
    public Person Parent { get; set; } = null!;

    [Required]
    public Guid ChildId { get; set; }
    public Person Child { get; set; } = null!;

    public RelationshipType RelationshipType { get; set; } = RelationshipType.Biological;

    [MaxLength(50)]
    public string? Certainty { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
