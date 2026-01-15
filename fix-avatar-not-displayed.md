# Fix: Avatar Uploaded But Not Displayed + Old Avatars Not Deleted

## TWO Problems

1. **Avatar not displayed** - UI shows initials instead of uploaded image
2. **Old avatars not deleted** - Multiple image files created (should only be 1)

---

## Problem 1: Avatar Not Displayed

### Root Cause
Person API doesn't return `avatarUrl` when fetching person details.

### Fix Backend - Include Avatar in PersonDto

**Step 1: Add AvatarUrl to PersonDto**

```csharp
// DTOs/PersonDto.cs or PersonDetailDto.cs
public class PersonDto
{
    public Guid Id { get; set; }
    public string? PrimaryName { get; set; }
    // ... other fields ...
    
    // ADD THIS:
    public string? AvatarUrl { get; set; }
}
```

**Step 2: Include Avatar when loading Person**

```csharp
// In PersonService or Repository - wherever person is loaded
var person = await _context.People
    .Include(p => p.Avatar)  // ADD THIS LINE
    .FirstOrDefaultAsync(p => p.Id == personId);
```

**Step 3: Map Avatar URL in response**

```csharp
// When mapping Person to PersonDto
var dto = new PersonDto
{
    Id = person.Id,
    PrimaryName = person.PrimaryName,
    // ... other fields ...
    
    // ADD THIS:
    AvatarUrl = person.Avatar?.ThumbnailPath ?? person.Avatar?.Url
};
```

**Step 4: Verify Navigation Property in Model**

```csharp
// Models/Person.cs - ensure these exist:
public Guid? AvatarMediaId { get; set; }
public MediaFile? Avatar { get; set; }
```

---

## Problem 2: Old Avatars Not Deleted

### Root Cause
When uploading new avatar, the old one is NOT deleted first.

### Find and Fix Avatar Upload Method

```bash
# Find avatar upload method
grep -rn "UploadAvatar\|avatar" --include="*.cs" Services/
grep -rn "AvatarMediaId" --include="*.cs" .
```

### Fix: Delete Old Avatar Before Uploading New

```csharp
public async Task<ServiceResult<AvatarDto>> UploadAvatarAsync(
    Guid personId,
    UploadAvatarDto dto,
    UserContext userContext)
{
    var person = await _context.People
        .Include(p => p.Avatar)  // Include current avatar
        .FirstOrDefaultAsync(p => p.Id == personId);
    
    if (person == null)
        return ServiceResult<AvatarDto>.NotFound("Person not found");

    // ========================================
    // DELETE OLD AVATAR FIRST (if exists)
    // ========================================
    if (person.AvatarMediaId.HasValue)
    {
        var oldAvatarId = person.AvatarMediaId.Value;
        
        // Clear reference first (to avoid FK constraint)
        person.AvatarMediaId = null;
        await _context.SaveChangesAsync();
        
        // Delete old media file (both DB record and physical file)
        await _mediaService.DeleteMediaAsync(oldAvatarId);
        
        _logger.LogInformation("Deleted old avatar {OldAvatarId} for person {PersonId}", 
            oldAvatarId, personId);
    }

    // ========================================
    // UPLOAD NEW AVATAR
    // ========================================
    var media = await _mediaService.UploadMediaAsync(
        personId,
        dto.Base64Data,
        dto.FileName,
        dto.MimeType,
        "Avatar",
        null,
        null
    );

    if (media == null)
        return ServiceResult<AvatarDto>.InternalError("Failed to upload avatar");

    // Update person with new avatar
    person.AvatarMediaId = media.Id;
    person.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    _logger.LogInformation("Uploaded new avatar {MediaId} for person {PersonId}", 
        media.Id, personId);

    return ServiceResult<AvatarDto>.Success(new AvatarDto
    {
        MediaId = media.Id,
        ThumbnailPath = media.ThumbnailPath,
        Url = media.Url,
        FileName = media.FileName
    });
}
```

### Also: Clean Up Existing Orphan Avatars

Run this SQL to find and clean up orphan avatar files:

```sql
-- Find orphan media files in avatar folder that aren't linked to any person
SELECT m.* 
FROM "MediaFiles" m
LEFT JOIN "People" p ON p."AvatarMediaId" = m."Id"
WHERE m."StorageKey" LIKE '%/image/%'  -- Avatar path pattern
  AND p."Id" IS NULL;

-- Delete orphans (careful - verify first!)
-- DELETE FROM "MediaFiles" 
-- WHERE "Id" IN (
--     SELECT m."Id" 
--     FROM "MediaFiles" m
--     LEFT JOIN "People" p ON p."AvatarMediaId" = m."Id"
--     WHERE m."StorageKey" LIKE '%/image/%'
--       AND p."Id" IS NULL
-- );
```

And delete the physical files from disk:
```
media/family-tree/people/{personId}/image/
```
Keep only the file that matches current `AvatarMediaId`.

---

## Summary

| Issue | Fix |
|-------|-----|
| **Not displayed** | Add `.Include(p => p.Avatar)` + map `AvatarUrl` in DTO |
| **Old not deleted** | Call `DeleteMediaAsync(oldAvatarId)` before uploading new |

---

## Verify Fix

After implementing:

1. **Delete test**: Upload avatar → Upload again → Check folder has only 1 image
2. **Display test**: Refresh page → Avatar should show (not initials)
3. **API test**: Check person API response includes `avatarUrl` field
