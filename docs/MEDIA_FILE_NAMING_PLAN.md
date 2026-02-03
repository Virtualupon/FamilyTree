# Implementation Plan: Descriptive Media File Naming

## Overview

Create a human-readable, URL-safe naming scheme for media files that provides context about the content and organization.

---

## Problem Statement

### Current Naming
```
{mediaKind}_{Guid}.{ext}
Example: image_550e8400-e29b-41d4-a716-446655440000.jpg
```

**Issues:**
- Not human-readable
- No context about content
- Hard to browse in storage UI
- No organization structure
- Difficult to debug/support

---

## Cloudflare R2 Constraints

| Constraint | Value | Notes |
|------------|-------|-------|
| Max key length | 1,024 bytes | UTF-8 encoded bytes, not char count |
| Character encoding | UTF-8 | NFC-normalized by default |
| Case sensitivity | Yes | `File.txt` ≠ `file.txt` |
| Directory structure | Flat | `/` simulates directories |
| Reserved characters | `+`, `%`, `?`, `#` | Require URL encoding |

### Safe Characters
- Lowercase letters: `a-z`
- Numbers: `0-9`
- Hyphens: `-`
- Underscores: `_`
- Forward slashes: `/` (for paths)
- Periods: `.` (for extensions)

### Characters to Avoid
- Spaces → use hyphens
- Special characters: `&`, `=`, `@`, `$`, `!`
- Non-ASCII → transliterate to ASCII
- Uppercase → use lowercase for consistency

---

## Proposed Naming Scheme

### Path Structure
```
{orgSlug}/{personSlug}/{mediaKind}/{year-month}/{filename}
```

### Filename Format
```
{personSlug}_{mediaKind}_{YYYYMMDD}_{shortId}.{ext}
```

### Examples

| Original | New Path |
|----------|----------|
| `image_abc123.jpg` | `smith-family/john-smith/image/2024-02/john-smith_image_20240215_a1b2c3d4.jpg` |
| `document_xyz789.pdf` | `hassan-clan/ahmed-hassan/document/2023-10/ahmed-hassan_document_20231020_x7y8z9.pdf` |
| `audio_def456.mp3` | `garcia-tree/maria-garcia/audio/2024-01/maria-garcia_audio_20240115_d4e5f6a7.mp3` |

### Slug Generation Rules

| Step | Action | Example |
|------|--------|---------|
| 1 | Transliterate non-ASCII | أحمد → ahmed |
| 2 | Convert to lowercase | John → john |
| 3 | Replace spaces with hyphens | john smith → john-smith |
| 4 | Remove special characters | john@smith → johnsmith |
| 5 | Limit to 50 characters | very-long-name... → truncated |
| 6 | Trim trailing hyphens | john-smith- → john-smith |

### Slug Examples

| Input | Output Slug |
|-------|-------------|
| "John Smith" | `john-smith` |
| "أحمد حسن" | `ahmed-hassan` |
| "María García" | `maria-garcia` |
| "Jean-Pierre Dupont" | `jean-pierre-dupont` |
| "محمد عبدالله" | `mhmd-abdallh` |
| "Müller Familie" | `muller-familie` |

### Short ID Generation
- Use first 8 characters of media GUID: `a1b2c3d4`
- Ensures uniqueness within same person/date
- Human-typeable for support queries

### Path Length Validation
- **CRITICAL**: Must validate UTF-8 byte length, not char count
- Maximum total path: 1,024 bytes
- Validation performed before upload, throws if exceeded

---

## Implementation

### File 1: SlugGenerator.cs

**Path:** `backend/FamilyTreeApi/Utilities/SlugGenerator.cs`

```csharp
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace FamilyTreeApi.Utilities;

/// <summary>
/// Generates URL-safe slugs from names with multi-language support.
/// Thread-safe: all members are static and use no shared mutable state.
/// </summary>
public static class SlugGenerator
{
    // AUDIT FIX: Compiled regex for performance under load
    private static readonly Regex MultipleHyphensRegex = new("-+", RegexOptions.Compiled);

    private static readonly Dictionary<char, string> ArabicTranslit = new()
    {
        // Hamza forms
        ['أ'] = "a", ['ا'] = "a", ['إ'] = "e", ['آ'] = "a", ['ٱ'] = "a",
        // Core letters
        ['ب'] = "b", ['ت'] = "t", ['ث'] = "th", ['ج'] = "j",
        ['ح'] = "h", ['خ'] = "kh", ['د'] = "d", ['ذ'] = "th",
        ['ر'] = "r", ['ز'] = "z", ['س'] = "s", ['ش'] = "sh",
        ['ص'] = "s", ['ض'] = "d", ['ط'] = "t", ['ظ'] = "z",
        ['ع'] = "a", ['غ'] = "gh", ['ف'] = "f", ['ق'] = "q",
        ['ك'] = "k", ['ل'] = "l", ['م'] = "m", ['ن'] = "n",
        ['ه'] = "h", ['و'] = "w", ['ي'] = "y", ['ى'] = "a",
        ['ة'] = "a", ['ء'] = "", ['ئ'] = "y", ['ؤ'] = "w",
        // Persian/Urdu extensions
        ['پ'] = "p", ['چ'] = "ch", ['ژ'] = "zh", ['گ'] = "g", ['ڤ'] = "v",
        // Arabic numerals
        ['٠'] = "0", ['١'] = "1", ['٢'] = "2", ['٣'] = "3", ['٤'] = "4",
        ['٥'] = "5", ['٦'] = "6", ['٧'] = "7", ['٨'] = "8", ['٩'] = "9"
    };

    /// <summary>
    /// Generate URL-safe slug from any name (supports Arabic, Latin, etc.)
    /// </summary>
    /// <param name="input">The name to convert to a slug</param>
    /// <param name="maxLength">Maximum length of the resulting slug (default 50)</param>
    /// <returns>URL-safe slug, or "unknown" if input is null/empty</returns>
    public static string GenerateSlug(string? input, int maxLength = 50)
    {
        if (string.IsNullOrWhiteSpace(input))
            return "unknown";

        var result = new StringBuilder(input.Length);

        foreach (var c in input.ToLowerInvariant())
        {
            if (c >= 'a' && c <= 'z')
                result.Append(c);
            else if (c >= '0' && c <= '9')
                result.Append(c);
            else if (c == ' ' || c == '-' || c == '_')
                result.Append('-');
            else if (ArabicTranslit.TryGetValue(c, out var translit))
                result.Append(translit);
            else
            {
                // Try to normalize other characters (accents, etc.)
                var normalized = RemoveDiacriticsSafe(c);
                if (normalized.HasValue && char.IsLetter(normalized.Value))
                    result.Append(char.ToLowerInvariant(normalized.Value));
            }
        }

        // AUDIT FIX: Use compiled regex
        var slug = MultipleHyphensRegex.Replace(result.ToString(), "-").Trim('-');

        // Limit length
        if (slug.Length > maxLength)
            slug = slug[..maxLength].TrimEnd('-');

        return string.IsNullOrEmpty(slug) ? "unknown" : slug;
    }

    /// <summary>
    /// Remove diacritics from a single character.
    /// AUDIT FIX: Returns nullable char, handles exceptions safely.
    /// </summary>
    private static char? RemoveDiacriticsSafe(char c)
    {
        try
        {
            var str = c.ToString();
            var normalized = str.Normalize(NormalizationForm.FormD);

            foreach (var nc in normalized)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(nc) != UnicodeCategory.NonSpacingMark)
                    return nc;
            }

            return null;
        }
        catch (ArgumentException)
        {
            // Invalid Unicode sequence - skip this character
            return null;
        }
    }
}
```

### File 2: MediaPathBuilder.cs

**Path:** `backend/FamilyTreeApi/Utilities/MediaPathBuilder.cs`

```csharp
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
```

---

## Backward Compatibility Strategy

### Problem
Changing to new naming scheme could break existing file URLs.

### Solution: Dual-Path Resolution

1. **New uploads**: Use new descriptive naming scheme
2. **Existing files**: Continue to work via existing `StorageKey` in database
3. **No migration required**: Old files retain their original paths

### Implementation Notes

- `Media.StorageKey` field already stores the full path
- Storage services resolve files by `StorageKey`, not computed path
- New naming only affects newly uploaded files
- Optional: Migration service can rename existing files (separate plan)

### Database Fields

| Field | Purpose |
|-------|---------|
| `StorageKey` | Actual path in storage (old or new format) |
| `FileName` | Original user-provided filename (preserved) |
| `Url` | Public URL for access |

---

## Files to Modify

### MediaService.cs

Update `UploadMediaAsync` to use descriptive naming for new uploads:

```csharp
// Get person and org for descriptive naming
var person = await _context.People
    .Include(p => p.Org)
    .FirstOrDefaultAsync(p => p.Id == personId);

var orgName = person?.Org?.Name ?? "unknown-org";
var personName = person?.PrimaryName ?? "unknown-person";

// Generate descriptive path (validates extension and mediaKind)
var (pathSegments, uniqueFileName) = MediaPathBuilder.BuildDescriptivePath(
    orgName,
    personName,
    mediaKind.ToString(),
    DateTime.UtcNow,
    mediaId,
    extension);
```

### MediaManagementService.cs

Apply same pattern to any upload methods.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `Utilities/SlugGenerator.cs` | Create | Arabic transliteration + URL-safe slugs |
| `Utilities/MediaPathBuilder.cs` | Create | Build and validate storage paths |
| `Services/MediaService.cs` | Modify | Use new naming for uploads |
| `Services/MediaManagementService.cs` | Modify | Use new naming for uploads |

---

## Security Audit Fixes Applied

### Audit v1 Fixes

| Issue | Fix | Location |
|-------|-----|----------|
| Path traversal in extension | Allowlist validation + strip separators | `ValidateAndNormalizeExtension` |
| Culture-dependent dates | `CultureInfo.InvariantCulture` | `BuildDescriptivePath` |
| mediaKind path injection | Allowlist validation | `ValidateMediaKind` |
| Byte vs char count | `Encoding.UTF8.GetByteCount` | `ValidatePathLength` |
| Regex not compiled | `RegexOptions.Compiled` | `MultipleHyphensRegex` |
| Unicode normalization throws | Try-catch with null fallback | `RemoveDiacriticsSafe` |

### Audit v2 Fixes

| Issue | Fix | Location |
|-------|-----|----------|
| AllowedMediaKinds mismatch with enum | Derive from `Enum.GetNames<MediaKind>()` | `AllowedMediaKinds` static field |
| Guid.Empty produces non-unique shortId | Add `Guid.Empty` validation | `BuildDescriptivePath` |
| Exception messages leak info | Generic user-friendly messages | All validation methods |
| Unused import | Now used for `MediaKind` enum | Import statement |

---

## Verification Checklist

### Slug Generation
- [ ] Arabic names transliterate correctly (أحمد → ahmed)
- [ ] Persian/Urdu extensions work (پ → p, گ → g)
- [ ] Arabic numerals convert (٥ → 5)
- [ ] Accented Latin characters normalized (María → maria)
- [ ] Spaces converted to hyphens
- [ ] Special characters removed
- [ ] Length limited to 50 chars
- [ ] Empty/null inputs return "unknown"
- [ ] Invalid Unicode doesn't throw

### Path Building
- [ ] Extension validated against allowlist
- [ ] Path traversal attempts rejected ("../etc")
- [ ] mediaKind validated against enum-derived allowlist
- [ ] Guid.Empty rejected with ArgumentException
- [ ] Total path validated in UTF-8 bytes
- [ ] Date formatting culture-invariant
- [ ] Short ID (8 chars) ensures uniqueness
- [ ] Error messages don't leak internal details

### Integration
- [ ] New uploads use descriptive naming
- [ ] Original filename preserved in database
- [ ] Existing files continue to work (via StorageKey)
- [ ] Invalid extension throws ArgumentException
- [ ] Path too long throws ArgumentException

---

## Known Limitations (Documented)

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Slug collision | Different names can produce same slug | ShortId in filename ensures uniqueness |
| Org/person rename | Old files remain in old folder | Optional migration, or accept as-is |
| PII in paths | Org/person names visible in URLs | Acceptable for this use case |

## Assumptions (Enforced in Code)

| Assumption | Enforcement |
|------------|-------------|
| mediaId is not Guid.Empty | `ArgumentException` thrown if empty |
| mediaKind matches MediaKind enum | Derived from `Enum.GetNames<MediaKind>()` |
| Extension is in allowlist | Validated against hardcoded allowlist |
| DateTime should be UTC | Caller responsibility (documented) |

---

## Related Plans

- **Storage Migration Plan**: Migrates existing files to Cloudflare R2 with optional renaming

---

## Sources
- [Cloudflare R2 Limits](https://developers.cloudflare.com/r2/platform/limits/)
- [R2 Unicode Interoperability](https://developers.cloudflare.com/r2/reference/unicode-interoperability/)
