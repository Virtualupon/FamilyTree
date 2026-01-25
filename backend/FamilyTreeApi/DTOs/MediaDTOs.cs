using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// ============================================
// Base64 Upload (for MediaUploadController)
// ============================================

/// <summary>
/// Request for uploading media as Base64 (person-level)
/// </summary>
public class UploadMediaBase64Request
{
    [Required]
    public Guid PersonId { get; set; }

    [Required]
    public string Base64Data { get; set; } = string.Empty;

    [Required]
    public string FileName { get; set; } = string.Empty;

    public string? MimeType { get; set; }
    public string? Caption { get; set; }
    public string? Copyright { get; set; }
}

/// <summary>
/// Response for person-level media
/// </summary>
public class PersonMediaResponse
{
    public Guid Id { get; set; }
    public Guid PersonId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? MimeType { get; set; }
    public long FileSize { get; set; }
    public string MediaType { get; set; } = string.Empty;
    public string? Caption { get; set; }
    public string? Copyright { get; set; }
    public DateTime UploadedAt { get; set; }
    public string? ThumbnailUrl { get; set; }
}

/// <summary>
/// Response for downloading media as Base64
/// </summary>
public class MediaDownloadResponse
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? MimeType { get; set; }
    public string Base64Data { get; set; } = string.Empty;
}

// ============================================
// FormFile Upload (for MediaController)
// ============================================

/// <summary>
/// Request for uploading media via FormFile (organization-level)
/// </summary>
public class MediaUploadRequest
{
    public MediaKind Kind { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public DateTime? CaptureDate { get; set; }
    public Guid? CapturePlaceId { get; set; }
    public PrivacyLevel Visibility { get; set; } = PrivacyLevel.FamilyOnly;
    public string? Copyright { get; set; }
    public string? MetadataJson { get; set; }
}

/// <summary>
/// Request for updating media metadata
/// </summary>
public class MediaUpdateRequest
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public DateTime? CaptureDate { get; set; }
    public Guid? CapturePlaceId { get; set; }
    public PrivacyLevel? Visibility { get; set; }
    public string? Copyright { get; set; }
    public string? MetadataJson { get; set; }
}

/// <summary>
/// Response for organization-level media
/// </summary>
public class MediaResponse
{
    public Guid Id { get; set; }
    public Guid OrgId { get; set; }
    public Guid? PersonId { get; set; }
    public MediaKind Kind { get; set; }
    public string Url { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? MimeType { get; set; }
    public long FileSize { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public DateTime? CaptureDate { get; set; }
    public Guid? CapturePlaceId { get; set; }
    public string? PlaceName { get; set; }
    public PrivacyLevel Visibility { get; set; }
    public string? Copyright { get; set; }
    public string? ThumbnailPath { get; set; }
    public string? MetadataJson { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>Persons linked to this media (populated via projection)</summary>
    public List<LinkedPersonDto> LinkedPersons { get; set; } = new();
}

// ============================================
// Search
// ============================================

/// <summary>
/// Request for searching media
/// </summary>
public class MediaSearchRequest
{
    public MediaKind? Kind { get; set; }
    public Guid? PersonId { get; set; }
    public DateTime? CaptureDateFrom { get; set; }
    public DateTime? CaptureDateTo { get; set; }
    public Guid? CapturePlaceId { get; set; }
    public string? SearchTerm { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;

    /// <summary>
    /// Exclude media files that are used as person avatars (profile pictures).
    /// Defaults to true so Media Gallery shows only actual media, not profile pictures.
    /// </summary>
    public bool ExcludeAvatars { get; set; } = true;
}

/// <summary>
/// Response for media search results
/// </summary>
public class MediaSearchResponse
{
    public List<MediaResponse> Media { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages { get; set; }
}

// ============================================
// PersonMedia DTOs (Many-to-Many Linking)
// ============================================

/// <summary>
/// Request for uploading media with linked persons
/// </summary>
public class MediaUploadWithPersonsDto
{
    /// <summary>Base64 encoded file data</summary>
    [Required]
    public string Base64Data { get; set; } = string.Empty;

    /// <summary>Original file name</summary>
    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    /// <summary>MIME type (e.g., "image/jpeg", "audio/mpeg")</summary>
    [Required]
    [MaxLength(100)]
    public string MimeType { get; set; } = string.Empty;

    /// <summary>Optional title for the media</summary>
    [MaxLength(200)]
    public string? Title { get; set; }

    /// <summary>Optional description</summary>
    public string? Description { get; set; }

    /// <summary>Person IDs to link this media to</summary>
    [Required]
    public List<Guid> PersonIds { get; set; } = new();
}

/// <summary>
/// Represents a linked person in a media response
/// </summary>
public record LinkedPersonDto(
    Guid PersonId,
    string? PersonName,
    bool IsPrimary,
    string? Notes,
    string? NotesAr,
    string? NotesNob,
    DateTime LinkedAt
);

/// <summary>
/// Response for a media file with linked persons (list view - no Base64)
/// </summary>
public record MediaWithPersonsDto(
    Guid Id,
    string FileName,
    string? MimeType,
    long FileSize,
    string MediaKind,
    string? Title,
    string? Description,
    string? DescriptionAr,
    string? DescriptionNob,
    string? ThumbnailPath,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<LinkedPersonDto> LinkedPersons
);

/// <summary>
/// Response for a media file with Base64 data and linked persons
/// </summary>
public record MediaWithDataDto(
    Guid Id,
    string FileName,
    string? MimeType,
    long FileSize,
    string MediaKind,
    string? Title,
    string? Description,
    string? DescriptionAr,
    string? DescriptionNob,
    string Base64Data,
    DateTime CreatedAt,
    List<LinkedPersonDto> LinkedPersons
);

/// <summary>
/// List item for person's media (without Base64 data for efficiency)
/// </summary>
public record PersonMediaListItemDto(
    Guid MediaId,
    string FileName,
    string? MimeType,
    long FileSize,
    string MediaKind,
    string? Title,
    string? Description,
    string? DescriptionAr,
    string? DescriptionNob,
    string? ThumbnailPath,
    bool IsPrimary,
    int SortOrder,
    DateTime LinkedAt,
    List<LinkedPersonDto> LinkedPersons
);

/// <summary>
/// Grouped media response by type
/// </summary>
public class PersonMediaGroupedDto
{
    public List<PersonMediaListItemDto> Images { get; set; } = new();
    public List<PersonMediaListItemDto> Audio { get; set; } = new();
    public List<PersonMediaListItemDto> Videos { get; set; } = new();
}

/// <summary>
/// Request to link a person to existing media
/// </summary>
public class LinkPersonToMediaDto
{
    /// <summary>Mark as primary photo for this person</summary>
    public bool IsPrimary { get; set; } = false;

    /// <summary>Notes about this person in the media</summary>
    public string? Notes { get; set; }
}

/// <summary>
/// Request to link multiple persons to existing media
/// </summary>
public class LinkPersonsToMediaDto
{
    /// <summary>Person IDs to link</summary>
    [Required]
    public List<Guid> PersonIds { get; set; } = new();
}

// ============================================
// Signed URL DTOs
// ============================================

/// <summary>
/// Response for signed URL generation.
/// Contains the URL, expiration time, and content type for secure media streaming.
/// </summary>
public class SignedMediaUrlDto
{
    /// <summary>The signed URL for secure access</summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>When the URL expires</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>The content type of the media (e.g., "image/webp", "video/mp4")</summary>
    public string ContentType { get; set; } = string.Empty;
}

/// <summary>
/// Request for getting a signed URL
/// </summary>
public class SignedUrlRequest
{
    /// <summary>Expiration time in seconds (default: 3600 = 1 hour, max: 86400 = 24 hours)</summary>
    public int ExpiresInSeconds { get; set; } = 3600;
}
