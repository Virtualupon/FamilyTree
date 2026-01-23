using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

public class Media
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }
    public Org Org { get; set; } = null!;

    // Person association (for family tree media)
    public Guid? PersonId { get; set; }
    public Person? Person { get; set; }

    [Required]
    [MaxLength(500)]
    public string Url { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string StorageKey { get; set; } = string.Empty;

    // File information
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? MimeType { get; set; }

    public long FileSize { get; set; }

    public MediaKind Kind { get; set; } = MediaKind.Image;

    // Storage provider type (1=Local, 2=Linode, 3=AWS, 4=Nextcloud, 5=Cloudflare)
    public int StorageType { get; set; } = 1;

    [MaxLength(200)]
    public string? Title { get; set; }

    /// <summary>Description in English (or original input language)</summary>
    public string? Description { get; set; }

    /// <summary>Description in Arabic (auto-translated)</summary>
    public string? DescriptionAr { get; set; }

    /// <summary>Description in Nobiin (auto-translated)</summary>
    public string? DescriptionNob { get; set; }

    public DateTime? CaptureDate { get; set; }
    public Guid? CapturePlaceId { get; set; }
    public Place? CapturePlace { get; set; }

    public PrivacyLevel Visibility { get; set; } = PrivacyLevel.FamilyOnly;

    public string? Copyright { get; set; }

    // Thumbnail for images/videos
    [MaxLength(500)]
    public string? ThumbnailPath { get; set; }

    public string? MetadataJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // User who uploaded this media
    public long? UploadedByUserId { get; set; }

    // Category for organizing media
    [MaxLength(50)]
    public string? Category { get; set; }

    /// <summary>Persons linked to this media (many-to-many via PersonMedia junction)</summary>
    public ICollection<PersonMedia> PersonLinks { get; set; } = new List<PersonMedia>();
}
