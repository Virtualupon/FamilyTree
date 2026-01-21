using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.DTOs;

/// <summary>
/// DTO for returning carousel image data
/// </summary>
public record CarouselImageDto(
    Guid Id,
    string ImageUrl,
    string? Title,
    string? Description,
    int DisplayOrder,
    bool IsActive,
    int StorageType,
    string? FileName,
    long? FileSize,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>
/// DTO for creating a new carousel image via URL
/// </summary>
public record CreateCarouselImageRequest
{
    [Required]
    [MaxLength(1000)]
    public string ImageUrl { get; init; } = string.Empty;

    [MaxLength(200)]
    public string? Title { get; init; }

    [MaxLength(500)]
    public string? Description { get; init; }

    public int DisplayOrder { get; init; } = 0;

    public bool IsActive { get; init; } = true;
}

/// <summary>
/// DTO for updating an existing carousel image
/// </summary>
public record UpdateCarouselImageRequest
{
    [MaxLength(1000)]
    public string? ImageUrl { get; init; }

    [MaxLength(200)]
    public string? Title { get; init; }

    [MaxLength(500)]
    public string? Description { get; init; }

    public int? DisplayOrder { get; init; }

    public bool? IsActive { get; init; }
}

/// <summary>
/// DTO for reordering carousel images
/// </summary>
public record ReorderCarouselImagesRequest
{
    [Required]
    public List<Guid> ImageIds { get; init; } = new();
}

/// <summary>
/// Response for public carousel images (used by town-selection page)
/// </summary>
public record PublicCarouselImagesResponse(
    List<PublicCarouselImageDto> Images
);

/// <summary>
/// Public-facing carousel image DTO (minimal data)
/// </summary>
public record PublicCarouselImageDto(
    string ImageUrl,
    string? Title,
    string? Description
);
