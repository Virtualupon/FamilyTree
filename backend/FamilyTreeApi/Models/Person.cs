using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using FamilyTreeApi.Models.Enums;
using NpgsqlTypes;

namespace FamilyTreeApi.Models;

public class Person
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }
    public Org Org { get; set; } = null!;

    [MaxLength(200)]
    public string? PrimaryName { get; set; }

    public Sex Sex { get; set; } = Sex.Unknown;

    [MaxLength(50)]
    public string? Gender { get; set; }

    public DateTime? BirthDate { get; set; }
    public DatePrecision BirthPrecision { get; set; } = DatePrecision.Unknown;
    public Guid? BirthPlaceId { get; set; }
    public Place? BirthPlace { get; set; }

    public DateTime? DeathDate { get; set; }
    public DatePrecision DeathPrecision { get; set; } = DatePrecision.Unknown;
    public Guid? DeathPlaceId { get; set; }
    public Place? DeathPlace { get; set; }

    public PrivacyLevel PrivacyLevel { get; set; } = PrivacyLevel.FamilyOnly;

    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Religion { get; set; }
    public string? Nationality { get; set; }
    public string? Ethnicity { get; set; }

    public string? Notes { get; set; }

    [Column(TypeName = "tsvector")]
    public NpgsqlTsVector? SearchVector { get; set; }

    public bool IsVerified { get; set; } = false;
    public bool NeedsReview { get; set; } = false;
    public bool HasConflict { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PersonName> Names { get; set; } = new List<PersonName>();
    public ICollection<ParentChild> AsParent { get; set; } = new List<ParentChild>();
    public ICollection<ParentChild> AsChild { get; set; } = new List<ParentChild>();
    public ICollection<UnionMember> UnionMemberships { get; set; } = new List<UnionMember>();
}
