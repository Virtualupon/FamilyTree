using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Represents an image used in the onboarding carousel.
/// Managed by SuperAdmins only.
/// </summary>
public class CarouselImage
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// URL to the image (can be external URL or internal storage path)
    /// </summary>
    [Required]
    [MaxLength(1000)]
    public string ImageUrl { get; set; } = string.Empty;

    /// <summary>
    /// Storage key for internally stored images
    /// </summary>
    [MaxLength(500)]
    public string? StorageKey { get; set; }

    /// <summary>
    /// Title/caption for the image (optional)
    /// </summary>
    [MaxLength(200)]
    public string? Title { get; set; }

    /// <summary>
    /// Description or alt text for accessibility
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Display order (lower numbers display first)
    /// </summary>
    public int DisplayOrder { get; set; } = 0;

    /// <summary>
    /// Whether this image is currently active/visible
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Storage type (1=External URL, 2=Local, 3=Cloudflare, etc.)
    /// </summary>
    public int StorageType { get; set; } = 1;

    /// <summary>
    /// Original filename if uploaded
    /// </summary>
    [MaxLength(255)]
    public string? FileName { get; set; }

    /// <summary>
    /// File size in bytes (for uploaded files)
    /// </summary>
    public long? FileSize { get; set; }

    /// <summary>
    /// User who created/uploaded this image
    /// </summary>
    public long CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
