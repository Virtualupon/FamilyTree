using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

public class Union
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }
    public Org? Org { get; set; }

    public UnionType Type { get; set; } = UnionType.Marriage;

    public DateTime? StartDate { get; set; }
    public DatePrecision StartPrecision { get; set; } = DatePrecision.Unknown;
    public Guid? StartPlaceId { get; set; }
    public Place? StartPlace { get; set; }

    public DateTime? EndDate { get; set; }
    public DatePrecision EndPrecision { get; set; } = DatePrecision.Unknown;
    public Guid? EndPlaceId { get; set; }
    public Place? EndPlace { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Soft delete fields
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    public long? DeletedByUserId { get; set; }
    public ApplicationUser? DeletedByUser { get; set; }

    public ICollection<UnionMember> Members { get; set; } = new List<UnionMember>();
}
