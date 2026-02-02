# Implementation Plan: Media Gallery Fixes

## Overview
This plan addresses the audit findings to fix avatar filtering in Media Gallery and add proper document display support.

---

## Issue Summary

| Issue | Root Cause | Fix |
|-------|------------|-----|
| Avatars appear in Media Gallery | Non-atomic avatar upload: media created but `Person.AvatarMediaId` not set if 2nd API call fails | Create atomic backend endpoint |
| Frontend doesn't send `excludeAvatars` | `MediaSearchParams` missing the property | Add property and send explicitly |
| Documents show infinite spinner | Lightbox has no Document handler | Add PDF iframe + download fallback |
| No error state for unpreviewable docs | Missing UI branch | Add error/download UI |

---

## Phase 1: Atomic Avatar Upload Endpoint (Backend)

### 1.1 Create New DTO for Avatar Upload

**File:** `backend/FamilyTreeApi/DTOs/AvatarDTOs.cs`

Add new request DTO:

```csharp
/// <summary>
/// Request for uploading an avatar and setting it on a person atomically
/// </summary>
public class UploadPersonAvatarRequest
{
    /// <summary>Base64 encoded image data (with or without data URL prefix)</summary>
    [Required]
    public string Base64Data { get; set; } = string.Empty;

    /// <summary>Original filename</summary>
    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    /// <summary>MIME type (e.g., image/jpeg, image/png, image/webp)</summary>
    [Required]
    [MaxLength(100)]
    public string MimeType { get; set; } = string.Empty;
}

/// <summary>
/// Response after successful avatar upload
/// </summary>
public class UploadPersonAvatarResponse
{
    public Guid PersonId { get; set; }
    public Guid MediaId { get; set; }
    public string? ThumbnailUrl { get; set; }
}
```

### 1.2 Add Avatar Upload Endpoint to PersonController

**File:** `backend/FamilyTreeApi/Controllers/PersonController.cs`

Add new endpoint:

```csharp
/// <summary>
/// Upload avatar for a person (atomic: creates media + sets AvatarMediaId in one transaction)
/// </summary>
[HttpPost("{id}/avatar")]
[Authorize(Roles = "0,1,2,3")]
[RequestSizeLimit(5 * 1024 * 1024)] // 5MB max for avatars
public async Task<ActionResult<UploadPersonAvatarResponse>> UploadAvatar(
    Guid id,
    [FromBody] UploadPersonAvatarRequest request)
{
    var userContext = BuildUserContext();
    var result = await _personService.UploadAvatarAsync(id, request, userContext);

    if (!result.IsSuccess)
    {
        return HandleError(result);
    }

    return Ok(result.Data);
}

/// <summary>
/// Remove avatar from a person (clears AvatarMediaId, optionally deletes media)
/// </summary>
[HttpDelete("{id}/avatar")]
[Authorize(Roles = "0,1,2")]
public async Task<IActionResult> RemoveAvatar(Guid id, [FromQuery] bool deleteMedia = true)
{
    var userContext = BuildUserContext();
    var result = await _personService.RemoveAvatarAsync(id, deleteMedia, userContext);

    if (!result.IsSuccess)
    {
        return HandleError(result);
    }

    return NoContent();
}
```

### 1.3 Add Service Methods to IPersonService

**File:** `backend/FamilyTreeApi/Services/IPersonService.cs`

```csharp
Task<ServiceResult<UploadPersonAvatarResponse>> UploadAvatarAsync(
    Guid personId,
    UploadPersonAvatarRequest request,
    UserContext userContext,
    CancellationToken cancellationToken = default);

Task<ServiceResult> RemoveAvatarAsync(
    Guid personId,
    bool deleteMedia,
    UserContext userContext,
    CancellationToken cancellationToken = default);
```

### 1.4 Implement Service Methods in PersonService

**File:** `backend/FamilyTreeApi/Services/PersonService.cs`

```csharp
public async Task<ServiceResult<UploadPersonAvatarResponse>> UploadAvatarAsync(
    Guid personId,
    UploadPersonAvatarRequest request,
    UserContext userContext,
    CancellationToken cancellationToken = default)
{
    if (!userContext.CanContribute())
    {
        return ServiceResult<UploadPersonAvatarResponse>.Forbidden();
    }

    // Validate MIME type
    var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp", "image/gif" };
    if (!allowedTypes.Contains(request.MimeType.ToLower()))
    {
        return ServiceResult<UploadPersonAvatarResponse>.Failure(
            $"Invalid image type. Allowed: {string.Join(", ", allowedTypes)}");
    }

    // Get person with tracking (we need to update it)
    var person = await _context.People
        .Where(p => p.Id == personId && p.OrgId == userContext.OrgId)
        .FirstOrDefaultAsync(cancellationToken);

    if (person == null)
    {
        return ServiceResult<UploadPersonAvatarResponse>.NotFound("Person not found");
    }

    // Use transaction to ensure atomicity
    using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

    try
    {
        // Delete old avatar media if exists
        if (person.AvatarMediaId.HasValue)
        {
            var oldMedia = await _context.MediaFiles
                .FirstOrDefaultAsync(m => m.Id == person.AvatarMediaId.Value, cancellationToken);

            if (oldMedia != null)
            {
                // Delete from storage
                await _storageService.DeleteFileAsync(oldMedia.Url);
                _context.MediaFiles.Remove(oldMedia);
            }
        }

        // Upload new avatar to storage
        var mediaBytes = Convert.FromBase64String(
            request.Base64Data.Contains(',')
                ? request.Base64Data.Split(',')[1]
                : request.Base64Data);

        var extension = GetExtensionFromMimeType(request.MimeType);
        var uniqueFileName = $"avatar_{Guid.NewGuid()}{extension}";
        var pathSegments = new[] { "family-tree", "avatars", person.OrgId.ToString() };

        var savedMediaInfo = await _storageService.UploadFileAsync(
            pathSegments, uniqueFileName, mediaBytes);

        // Create media record
        var media = new Media
        {
            Id = Guid.NewGuid(),
            OrgId = person.OrgId,
            PersonId = personId,
            Kind = MediaKind.Image,
            Url = savedMediaInfo.ImagePath,
            StorageKey = $"{string.Join("/", pathSegments)}/{uniqueFileName}",
            FileName = request.FileName,
            MimeType = request.MimeType,
            FileSize = mediaBytes.Length,
            Title = "Avatar",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.MediaFiles.Add(media);

        // Update person's AvatarMediaId
        person.AvatarMediaId = media.Id;
        person.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        _logger.LogInformation("Avatar uploaded for person {PersonId}, media {MediaId}", personId, media.Id);

        return ServiceResult<UploadPersonAvatarResponse>.Success(new UploadPersonAvatarResponse
        {
            PersonId = personId,
            MediaId = media.Id,
            ThumbnailUrl = savedMediaInfo.ImagePath
        });
    }
    catch (Exception ex)
    {
        await transaction.RollbackAsync(cancellationToken);
        _logger.LogError(ex, "Failed to upload avatar for person {PersonId}", personId);
        return ServiceResult<UploadPersonAvatarResponse>.InternalError("Failed to upload avatar");
    }
}

public async Task<ServiceResult> RemoveAvatarAsync(
    Guid personId,
    bool deleteMedia,
    UserContext userContext,
    CancellationToken cancellationToken = default)
{
    if (!userContext.CanEdit())
    {
        return ServiceResult.Forbidden();
    }

    var person = await _context.People
        .Where(p => p.Id == personId && p.OrgId == userContext.OrgId)
        .FirstOrDefaultAsync(cancellationToken);

    if (person == null)
    {
        return ServiceResult.NotFound("Person not found");
    }

    if (!person.AvatarMediaId.HasValue)
    {
        return ServiceResult.Success(); // No avatar to remove
    }

    var mediaId = person.AvatarMediaId.Value;

    // Clear AvatarMediaId first
    person.AvatarMediaId = null;
    person.UpdatedAt = DateTime.UtcNow;

    if (deleteMedia)
    {
        var media = await _context.MediaFiles
            .FirstOrDefaultAsync(m => m.Id == mediaId, cancellationToken);

        if (media != null)
        {
            await _storageService.DeleteFileAsync(media.Url);
            _context.MediaFiles.Remove(media);
        }
    }

    await _context.SaveChangesAsync(cancellationToken);

    _logger.LogInformation("Avatar removed for person {PersonId}", personId);
    return ServiceResult.Success();
}

private static string GetExtensionFromMimeType(string mimeType)
{
    return mimeType.ToLower() switch
    {
        "image/jpeg" or "image/jpg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        _ => ".bin"
    };
}
```

---

## Phase 2: Frontend - Use Atomic Avatar Endpoint

### 2.1 Add Avatar Service Method

**File:** `frontend/src/app/core/services/person.service.ts`

Add methods:

```typescript
/**
 * Upload avatar atomically (creates media + sets AvatarMediaId in one call)
 */
uploadAvatar(personId: string, request: UploadAvatarRequest): Observable<UploadAvatarResponse> {
  return this.http.post<UploadAvatarResponse>(
    `${this.apiUrl}/person/${personId}/avatar`,
    request
  );
}

/**
 * Remove avatar from person
 */
removeAvatar(personId: string, deleteMedia = true): Observable<void> {
  return this.http.delete<void>(
    `${this.apiUrl}/person/${personId}/avatar`,
    { params: { deleteMedia: deleteMedia.toString() } }
  );
}
```

### 2.2 Add Types

**File:** `frontend/src/app/core/models/person.models.ts`

```typescript
export interface UploadAvatarRequest {
  base64Data: string;
  fileName: string;
  mimeType: string;
}

export interface UploadAvatarResponse {
  personId: string;
  mediaId: string;
  thumbnailUrl?: string;
}
```

### 2.3 Update PersonAvatarComponent to Use Atomic Endpoint

**File:** `frontend/src/app/shared/components/person-avatar/person-avatar.component.ts`

Replace the two-step upload (lines 206-238) with single atomic call:

```typescript
// OLD (non-atomic - TWO API calls):
// this.mediaService.uploadMedia(payload).subscribe({
//   next: (media) => {
//     this.personService.updatePerson(this.person!.id, { avatarMediaId: media.id })...
//   }
// });

// NEW (atomic - ONE API call):
this.personService.uploadAvatar(this.person!.id, {
  base64Data: base64,
  fileName: file.name.replace(/\.[^.]+$/, extension),
  mimeType: mimeType
}).subscribe({
  next: (response) => {
    console.log('[AvatarUpload] Avatar uploaded atomically:', response);
    this.uploading = false;
    (this.person as any).avatarMediaId = response.mediaId;
    this.displayUrl.set(base64);
    this.lastLoadedMediaId = response.mediaId;
    this.avatarChanged.emit();
    this.snackBar.open('Avatar updated', 'Close', { duration: 2000 });
  },
  error: (err) => {
    this.uploading = false;
    console.error('[AvatarUpload] Atomic avatar upload failed:', err);
    this.snackBar.open('Failed to upload avatar', 'Close', { duration: 4000 });
  }
});
```

Similarly update `removeAvatar()` to use the new atomic endpoint.

---

## Phase 3: Frontend - Add excludeAvatars to Media Search

### 3.1 Update MediaSearchParams Interface

**File:** `frontend/src/app/core/models/media.models.ts`

```typescript
export interface MediaSearchParams {
  kind?: MediaKind;
  personId?: string;
  captureDateFrom?: string;
  captureDateTo?: string;
  capturePlaceId?: string;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
  excludeAvatars?: boolean;  // ADD THIS
}
```

### 3.2 Update MediaService to Send excludeAvatars

**File:** `frontend/src/app/core/services/media.service.ts`

```typescript
searchMedia(params: MediaSearchParams): Observable<MediaSearchResult> {
  let httpParams = new HttpParams();

  if (params.kind) httpParams = httpParams.set('kind', params.kind);
  if (params.personId) httpParams = httpParams.set('personId', params.personId);
  if (params.captureDateFrom) httpParams = httpParams.set('captureDateFrom', params.captureDateFrom);
  if (params.captureDateTo) httpParams = httpParams.set('captureDateTo', params.captureDateTo);
  if (params.capturePlaceId) httpParams = httpParams.set('capturePlaceId', params.capturePlaceId);
  if (params.searchTerm) httpParams = httpParams.set('searchTerm', params.searchTerm);
  if (params.page) httpParams = httpParams.set('page', params.page.toString());
  if (params.pageSize) httpParams = httpParams.set('pageSize', params.pageSize.toString());

  // ADD: Explicitly send excludeAvatars (default to true)
  const excludeAvatars = params.excludeAvatars !== false; // Default true
  httpParams = httpParams.set('excludeAvatars', excludeAvatars.toString());

  return this.http.get<MediaSearchResult>('/api/media', { params: httpParams });
}
```

---

## Phase 4: Frontend - Add Document Support to Lightbox

### 4.1 Update MediaKind Type (if not already present)

**File:** `frontend/src/app/core/models/media.models.ts`

Ensure Document is included:

```typescript
export type MediaKind = 'Image' | 'Audio' | 'Video' | 'Document';
```

### 4.2 Add Document Filter Option

**File:** `frontend/src/app/features/media/media-gallery.component.ts`

Update `kindOptions` to include Document:

```typescript
readonly kindOptions: (MediaKind | null)[] = [null, 'Image', 'Audio', 'Video', 'Document'];
```

Add helper method to check if document is previewable:

```typescript
/**
 * Check if a document can be previewed in browser (PDF only)
 */
isPreviewableDocument(item: MediaItem): boolean {
  return item.kind === 'Document' && item.mimeType === 'application/pdf';
}
```

### 4.3 Update Lightbox Template for Documents

**File:** `frontend/src/app/features/media/media-gallery.component.html`

Add Document handling after Audio section (around line 255):

```html
<!-- Document (PDF) -->
@if (lightboxSignedUrl() && lightboxMedia()?.kind === 'Document') {
  <div class="media-lightbox__document">
    @if (lightboxMedia()?.mimeType === 'application/pdf') {
      <!-- PDF Preview -->
      <iframe
        [src]="lightboxSignedUrl()"
        class="media-lightbox__pdf"
        title="PDF Preview">
      </iframe>
    } @else {
      <!-- Non-PDF Document: Download Only -->
      <div class="media-lightbox__document-fallback">
        <mat-icon class="media-lightbox__doc-icon">description</mat-icon>
        <p class="media-lightbox__doc-name">{{ lightboxMedia()?.fileName }}</p>
        <p class="media-lightbox__doc-info">
          {{ 'media.documentCannotPreview' | translate }}
        </p>
        <a
          [href]="lightboxSignedUrl()"
          download
          mat-raised-button
          color="primary"
          class="media-lightbox__download-btn">
          <mat-icon>download</mat-icon>
          {{ 'media.download' | translate }}
        </a>
      </div>
    }
  </div>
}
```

### 4.4 Add Styles for Document Lightbox

**File:** `frontend/src/app/features/media/media-gallery.component.scss`

```scss
.media-lightbox__document {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-lightbox__pdf {
  width: 90%;
  height: 90%;
  max-width: 1200px;
  border: none;
  background: white;
  border-radius: 4px;
}

.media-lightbox__document-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: white;
}

.media-lightbox__doc-icon {
  font-size: 64px;
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  opacity: 0.8;
}

.media-lightbox__doc-name {
  font-size: 1.25rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.media-lightbox__doc-info {
  opacity: 0.7;
  margin-bottom: 1.5rem;
}

.media-lightbox__download-btn {
  mat-icon {
    margin-right: 0.5rem;
  }
}
```

### 4.5 Add Translation Keys

**File:** `frontend/src/assets/i18n/en.json`

```json
{
  "media": {
    "documentCannotPreview": "This document type cannot be previewed. Click below to download.",
    "download": "Download",
    "documents": "Documents"
  }
}
```

**File:** `frontend/src/assets/i18n/ar.json`

```json
{
  "media": {
    "documentCannotPreview": "لا يمكن معاينة هذا النوع من المستندات. انقر أدناه للتنزيل.",
    "download": "تحميل",
    "documents": "مستندات"
  }
}
```

---

## Phase 5: Database Index Verification

### 5.1 Verify Index Exists

The index already exists in `ApplicationDbContext.cs:191`:

```csharp
entity.HasIndex(e => e.AvatarMediaId);
```

### 5.2 Create Migration to Verify (Optional)

If you want to explicitly ensure the index exists, create a migration:

```bash
cd backend/FamilyTreeApi
dotnet ef migrations add EnsureAvatarMediaIdIndex
```

Then verify the generated migration includes:

```csharp
migrationBuilder.CreateIndex(
    name: "IX_People_AvatarMediaId",
    table: "People",
    column: "AvatarMediaId");
```

---

## Testing Checklist

### Backend Tests
- [ ] `POST /api/person/{id}/avatar` creates media AND sets `AvatarMediaId` atomically
- [ ] `POST /api/person/{id}/avatar` rolls back on storage failure
- [ ] `POST /api/person/{id}/avatar` deletes old avatar media when replacing
- [ ] `DELETE /api/person/{id}/avatar` clears `AvatarMediaId` and optionally deletes media
- [ ] `GET /api/media?excludeAvatars=true` excludes media linked via `AvatarMediaId`
- [ ] `GET /api/media?excludeAvatars=false` includes all media

### Frontend Tests
- [ ] Avatar upload uses single atomic endpoint
- [ ] Avatar upload shows error on failure (no orphaned media)
- [ ] Media Gallery excludes avatars by default
- [ ] PDF documents open in iframe preview
- [ ] Non-PDF documents show download fallback
- [ ] Document filter option appears in dropdown

### Integration Tests
- [ ] Upload avatar → verify it does NOT appear in Media Gallery
- [ ] Remove avatar → verify media is deleted from storage
- [ ] Click PDF in gallery → verify it renders in lightbox
- [ ] Click DOCX in gallery → verify download fallback shown

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/FamilyTreeApi/DTOs/AvatarDTOs.cs` | MODIFY | Add `UploadPersonAvatarRequest`, `UploadPersonAvatarResponse` |
| `backend/FamilyTreeApi/Controllers/PersonController.cs` | MODIFY | Add `POST /{id}/avatar`, `DELETE /{id}/avatar` |
| `backend/FamilyTreeApi/Services/IPersonService.cs` | MODIFY | Add `UploadAvatarAsync`, `RemoveAvatarAsync` |
| `backend/FamilyTreeApi/Services/PersonService.cs` | MODIFY | Implement atomic avatar methods |
| `frontend/src/app/core/models/person.models.ts` | MODIFY | Add avatar request/response types |
| `frontend/src/app/core/models/media.models.ts` | MODIFY | Add `excludeAvatars` to `MediaSearchParams` |
| `frontend/src/app/core/services/person.service.ts` | MODIFY | Add `uploadAvatar`, `removeAvatar` methods |
| `frontend/src/app/core/services/media.service.ts` | MODIFY | Send `excludeAvatars` param explicitly |
| `frontend/src/app/shared/components/person-avatar/person-avatar.component.ts` | MODIFY | Use atomic endpoint |
| `frontend/src/app/features/media/media-gallery.component.ts` | MODIFY | Add Document to filter options |
| `frontend/src/app/features/media/media-gallery.component.html` | MODIFY | Add Document lightbox handling |
| `frontend/src/app/features/media/media-gallery.component.scss` | MODIFY | Add Document styles |
| `frontend/src/assets/i18n/en.json` | MODIFY | Add document translation keys |
| `frontend/src/assets/i18n/ar.json` | MODIFY | Add document translation keys |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing orphaned avatars still appear | Run one-time data fix script to link orphans by filename pattern |
| PDF iframe blocked by CSP | Ensure `frame-src` allows blob: and same-origin |
| Large PDF causes memory issues | Add max file size check before iframe load |
| Transaction deadlock on high concurrency | Use `IsolationLevel.ReadCommitted` (EF default) |

---

## Rollback Plan

1. If atomic endpoint fails: Frontend can fall back to two-step upload
2. If Document lightbox fails: Remove Document from `kindOptions` filter
3. If `excludeAvatars` causes issues: Remove param from frontend (backend default is `true`)
