namespace FamilyTreeApi.DTOs;

/// <summary>
/// Request DTO for uploading town image (Base64)
/// Same pattern as UploadAvatarDto
/// </summary>
public record UploadTownImageRequest
{
    public Guid TownId { get; init; }

    /// <summary>Base64 encoded image data (with or without data URL prefix)</summary>
    public string Base64Data { get; init; } = string.Empty;

    /// <summary>Original filename</summary>
    public string FileName { get; init; } = string.Empty;

    /// <summary>MIME type (e.g., image/webp, image/jpeg)</summary>
    public string? MimeType { get; init; }

    // Multilingual: Default + Nobiin + Arabic + English
    public string? Title { get; init; }
    public string? TitleNb { get; init; }  // Nobiin (Nubian)
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionNb { get; init; }  // Nobiin (Nubian)
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int DisplayOrder { get; init; } = 0;
}

/// <summary>
/// Full town image DTO for admin operations
/// </summary>
public record TownImageDto
{
    public Guid Id { get; init; }
    public Guid TownId { get; init; }
    public string TownName { get; init; } = string.Empty;
    public string? TownNameNb { get; init; }  // Nobiin (Nubian)
    public string? TownNameAr { get; init; }
    public string? TownNameEn { get; init; }
    public string ImageUrl { get; init; } = string.Empty;

    // Storage fields
    public string? FileName { get; init; }
    public string? MimeType { get; init; }
    public long FileSize { get; init; }

    // Multilingual: Default + Nobiin + Arabic + English
    public string? Title { get; init; }
    public string? TitleNb { get; init; }  // Nobiin (Nubian)
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionNb { get; init; }  // Nobiin (Nubian)
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }

    public int DisplayOrder { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

/// <summary>
/// Request DTO for creating a new town image (URL-based, legacy)
/// </summary>
public record CreateTownImageRequest
{
    public Guid TownId { get; init; }
    public string ImageUrl { get; init; } = string.Empty;

    // Multilingual: Default + Nobiin + Arabic + English
    public string? Title { get; init; }
    public string? TitleNb { get; init; }  // Nobiin (Nubian)
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionNb { get; init; }  // Nobiin (Nubian)
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int DisplayOrder { get; init; } = 0;
    public bool IsActive { get; init; } = true;
}

/// <summary>
/// Request DTO for updating an existing town image
/// </summary>
public record UpdateTownImageRequest
{
    // Multilingual: Default + Nobiin + Arabic + English
    public string? Title { get; init; }
    public string? TitleNb { get; init; }  // Nobiin (Nubian)
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionNb { get; init; }  // Nobiin (Nubian)
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int? DisplayOrder { get; init; }
    public bool? IsActive { get; init; }
}

/// <summary>
/// Request for bulk reordering images
/// </summary>
public record ReorderTownImagesRequest
{
    public List<ImageOrderItem> Images { get; init; } = new();
}

/// <summary>
/// Individual image order item for reordering
/// </summary>
public record ImageOrderItem
{
    public Guid ImageId { get; init; }
    public int DisplayOrder { get; init; }
}

/// <summary>
/// Simplified DTO for town carousel display
/// </summary>
public record TownCarouselImageDto
{
    public Guid Id { get; init; }
    public Guid TownId { get; init; }
    public string TownName { get; init; } = string.Empty;
    public string? TownNameNb { get; init; }  // Nobiin (Nubian)
    public string? TownNameAr { get; init; }
    public string? TownNameEn { get; init; }
    public string ImageUrl { get; init; } = string.Empty;

    // Multilingual: Default + Nobiin + Arabic + English
    public string? Title { get; init; }
    public string? TitleNb { get; init; }  // Nobiin (Nubian)
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionNb { get; init; }  // Nobiin (Nubian)
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
}

/// <summary>
/// Response wrapper for landing page images
/// </summary>
public record LandingPageImagesResponse
{
    public List<TownCarouselImageDto> Images { get; init; } = new();
    public int TotalCount { get; init; }
}
