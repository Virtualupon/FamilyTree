using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class UnionMember
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UnionId { get; set; }
    public Union Union { get; set; } = null!;

    [Required]
    public Guid PersonId { get; set; }
    public Person Person { get; set; } = null!;

    [MaxLength(50)]
    public string Role { get; set; } = "Spouse";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Soft delete fields
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    public long? DeletedByUserId { get; set; }
    public ApplicationUser? DeletedByUser { get; set; }
}
