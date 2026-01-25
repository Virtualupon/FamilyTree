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

    /// <summary>
    /// Optional family group this person belongs to.
    /// Part of Town->Org->Family->Person hierarchy.
    /// </summary>
    public Guid? FamilyId { get; set; }
    public Family? Family { get; set; }

    [MaxLength(200)]
    public string? PrimaryName { get; set; }

    /// <summary>
    /// Name in Arabic script
    /// </summary>
    [MaxLength(300)]
    public string? NameArabic { get; set; }

    /// <summary>
    /// Name in English/Latin script
    /// </summary>
    [MaxLength(300)]
    public string? NameEnglish { get; set; }

    /// <summary>
    /// Name in Nobiin (Coptic) script
    /// </summary>
    [MaxLength(300)]
    public string? NameNobiin { get; set; }

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

    /// <summary>
    /// Notes in English/default language
    /// </summary>
    public string? Notes { get; set; }

    /// <summary>
    /// Notes in Arabic
    /// </summary>
    public string? NotesAr { get; set; }

    /// <summary>
    /// Notes in Nobiin
    /// </summary>
    public string? NotesNob { get; set; }

    /// <summary>
    /// Reference to the profile picture/avatar media file.
    /// </summary>
    public Guid? AvatarMediaId { get; set; }
    public Media? Avatar { get; set; }

    [Column(TypeName = "tsvector")]
    public NpgsqlTsVector? SearchVector { get; set; }

    public bool IsVerified { get; set; } = false;
    public bool NeedsReview { get; set; } = false;
    public bool HasConflict { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Soft delete fields
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    public long? DeletedByUserId { get; set; }
    public ApplicationUser? DeletedByUser { get; set; }

    public ICollection<ParentChild> AsParent { get; set; } = new List<ParentChild>();
    public ICollection<ParentChild> AsChild { get; set; } = new List<ParentChild>();
    public ICollection<UnionMember> UnionMemberships { get; set; } = new List<UnionMember>();
}
