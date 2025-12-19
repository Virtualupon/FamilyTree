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
