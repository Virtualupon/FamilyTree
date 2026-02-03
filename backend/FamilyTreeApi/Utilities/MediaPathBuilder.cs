using System.Globalization;
using System.Text;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Utilities;

/// <summary>
/// Builds descriptive, URL-safe storage paths for media files.
/// All paths are validated against Cloudflare R2 constraints.
/// </summary>
public static class MediaPathBuilder
{
    /// <summary>
    /// Maximum storage key length in UTF-8 bytes (Cloudflare R2 limit)
    /// </summary>
    public const int MaxStorageKeyBytes = 1024;

    /// <summary>
    /// Allowed file extensions (lowercase, with leading dot)
    /// AUDIT FIX: Whitelist to prevent path traversal
    /// </summary>
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        // Images
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tiff", ".tif",
        // Documents
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".odt",
        // Audio
        ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma",
        // Video
        ".mp4", ".avi", ".mov", ".wmv", ".mkv", ".webm", ".m4v",
        // Archives (if needed)
        ".zip"
    };

    /// <summary>
    /// Allowed media kinds - derived from MediaKind enum at startup.
    /// AUDIT FIX v2: Synced with actual enum to prevent mismatch.
    /// </summary>
    private static readonly HashSet<string> AllowedMediaKinds = new(
        Enum.GetNames<MediaKind>().Select(n => n.ToLowerInvariant()),
        StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Build descriptive storage key for media file.
    /// </summary>
    /// <exception cref="ArgumentException">
    /// Thrown when extension is not allowed, mediaKind is invalid, mediaId is empty, or path exceeds R2 limits.
    /// </exception>
    public static (string[] pathSegments, string fileName) BuildDescriptivePath(
        string orgName,
        string personName,
        string mediaKind,
        DateTime date,
        Guid mediaId,
        string extension)
    {
        // AUDIT FIX v2: Validate mediaId is not empty
        if (mediaId == Guid.Empty)
            throw new ArgumentException("Media ID cannot be empty.", nameof(mediaId));

        // AUDIT FIX: Validate and sanitize extension
        var safeExtension = ValidateAndNormalizeExtension(extension);

        // AUDIT FIX: Validate mediaKind against allowlist
        var safeMediaKind = ValidateMediaKind(mediaKind);

        var orgSlug = SlugGenerator.GenerateSlug(orgName, 30);
        var personSlug = SlugGenerator.GenerateSlug(personName, 30);

        // AUDIT FIX: Use InvariantCulture for date formatting
        var yearMonth = date.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var dateStr = date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var shortId = mediaId.ToString("N")[..8];

        var fileName = $"{personSlug}_{safeMediaKind}_{dateStr}_{shortId}{safeExtension}";

        var pathSegments = new[]
        {
            orgSlug,
            personSlug,
            safeMediaKind,
            yearMonth
        };

        // AUDIT FIX: Validate total path length in UTF-8 bytes
        var fullPath = BuildStorageKey(pathSegments, fileName);
        ValidatePathLength(fullPath);

        return (pathSegments, fileName);
    }

    /// <summary>
    /// Build full storage key from segments and filename.
    /// </summary>
    public static string BuildStorageKey(string[] pathSegments, string fileName)
    {
        return string.Join("/", pathSegments) + "/" + fileName;
    }

    /// <summary>
    /// Validate extension against allowlist and normalize.
    /// AUDIT FIX: Prevents path traversal attacks.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when extension is not allowed.</exception>
    private static string ValidateAndNormalizeExtension(string? extension)
    {
        if (string.IsNullOrWhiteSpace(extension))
            throw new ArgumentException("Extension is required.", nameof(extension));

        // Normalize: ensure lowercase and starts with dot
        var normalized = extension.Trim().ToLowerInvariant();
        if (!normalized.StartsWith('.'))
            normalized = "." + normalized;

        // SECURITY: Strip any path separators or traversal attempts
        normalized = normalized
            .Replace("/", "")
            .Replace("\\", "")
            .Replace("..", "");

        // Validate against allowlist
        // AUDIT FIX v2: Generic error message to avoid information disclosure
        if (!AllowedExtensions.Contains(normalized))
            throw new ArgumentException("File type is not supported.", nameof(extension));

        return normalized;
    }

    /// <summary>
    /// Validate mediaKind against allowlist.
    /// AUDIT FIX: Prevents path injection via mediaKind parameter.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when mediaKind is not allowed.</exception>
    private static string ValidateMediaKind(string? mediaKind)
    {
        if (string.IsNullOrWhiteSpace(mediaKind))
            throw new ArgumentException("Media kind is required.", nameof(mediaKind));

        var normalized = mediaKind.Trim().ToLowerInvariant();

        // SECURITY: Strip any path separators
        normalized = normalized
            .Replace("/", "")
            .Replace("\\", "");

        // AUDIT FIX v2: Generic error message to avoid information disclosure
        if (!AllowedMediaKinds.Contains(normalized))
            throw new ArgumentException("Invalid media kind.", nameof(mediaKind));

        return normalized;
    }

    /// <summary>
    /// Validate that path length does not exceed R2 limits.
    /// AUDIT FIX: Uses UTF-8 byte count, not char count.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when path exceeds 1024 bytes.</exception>
    private static void ValidatePathLength(string fullPath)
    {
        var byteCount = Encoding.UTF8.GetByteCount(fullPath);
        if (byteCount > MaxStorageKeyBytes)
            throw new ArgumentException(
                "File path is too long. Please use shorter names.",
                nameof(fullPath));
    }
}
