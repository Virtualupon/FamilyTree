namespace FamilyTreeApi.Models;

/// <summary>
/// Represents an image associated with a town.
/// Used for carousels on landing page and town selection page.
/// </summary>
public class TownImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TownId { get; set; }

    // Storage fields (same pattern as Media entity)
    public string ImageUrl { get; set; } = string.Empty;  // Public URL/path
    public string? StorageKey { get; set; }               // Storage key for retrieval
    public string? FileName { get; set; }                 // Original filename
    public string? MimeType { get; set; }                 // e.g., image/webp
    public long FileSize { get; set; }                    // Size in bytes
    public int StorageType { get; set; }                  // 1=Local, 2=Linode, etc.

    // Multilingual title (Default + Nobiin + Arabic + English)
    public string? Title { get; set; }
    public string? TitleNb { get; set; }      // Nobiin (Nubian)
    public string? TitleAr { get; set; }
    public string? TitleEn { get; set; }

    // Multilingual description (Default + Nobiin + Arabic + English)
    public string? Description { get; set; }
    public string? DescriptionNb { get; set; }  // Nobiin (Nubian)
    public string? DescriptionAr { get; set; }
    public string? DescriptionEn { get; set; }

    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public long CreatedBy { get; set; }
    public long? UpdatedBy { get; set; }

    // Navigation properties
    public virtual Town Town { get; set; } = null!;
    public virtual ApplicationUser CreatedByUser { get; set; } = null!;
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}
