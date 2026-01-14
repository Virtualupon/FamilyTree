namespace FamilyTreeApi.DTOs;

/// <summary>
/// DTO for uploading an avatar image
/// </summary>
public class UploadAvatarDto
{
    /// <summary>Base64 encoded image data (with or without data URL prefix)</summary>
    public string Base64Data { get; set; } = string.Empty;

    /// <summary>Original filename</summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>MIME type (e.g., image/jpeg, image/png)</summary>
    public string MimeType { get; set; } = string.Empty;
}

/// <summary>
/// DTO for avatar response
/// </summary>
public class AvatarDto
{
    /// <summary>Media file ID</summary>
    public Guid MediaId { get; set; }

    /// <summary>Path to thumbnail (if available)</summary>
    public string? ThumbnailPath { get; set; }

    /// <summary>Storage URL/path</summary>
    public string? Url { get; set; }

    /// <summary>Original filename</summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>MIME type</summary>
    public string? MimeType { get; set; }

    /// <summary>File size in bytes</summary>
    public long FileSize { get; set; }
}

/// <summary>
/// DTO for avatar with Base64 data (for download)
/// </summary>
public class AvatarWithDataDto : AvatarDto
{
    /// <summary>Base64 encoded image data</summary>
    public string? Base64Data { get; set; }
}
