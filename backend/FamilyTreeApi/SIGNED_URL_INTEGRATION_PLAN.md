# FamilyTreeApi Signed URL Integration Plan

## Overview
Integrate the **VirtualUpon.Storage** library's signed URL features into FamilyTreeApi for secure media streaming.

**Working Directory:** `C:\Dev\Repo\FamilyTree\backend\FamilyTreeApi`
**Storage Library:** `VirtualUpon.Storage` (namespace: `VirtualUpon.Storage.*`)

---

## Current State Analysis

### Critical Finding: Duplicate IStorageService
FamilyTreeApi has its **own local** `IStorageService` interface that is **separate** from `VirtualUpon.Storage.Factories.IStorageService`.

| Namespace | Interface | Methods |
|-----------|-----------|---------|
| `FamilyTreeApi.Storage` | `IStorageService` | `UploadFileAsync`, `DownloadFileAsync`, `DeleteFileAsync` |
| `VirtualUpon.Storage.Factories` | `IStorageService` | Same + `GetSignedUrlAsync`, `ValidateSignedToken`, `GetLocalFilePath` |

### Services Using Storage
| Service | File | Current Usage |
|---------|------|---------------|
| `MediaManagementService` | `Services/MediaManagementService.cs` | `FamilyTreeApi.Storage.IStorageService` |
| `MediaService` | `Services/MediaService.cs` | `FamilyTreeApi.Storage.IStorageService` + Factory |
| `TownImageService` | `Services/TownImageService.cs` | `FamilyTreeApi.Storage.IStorageService` + Factory |

### Current Factory Implementation
`FamilyTreeApi.Storage.StorageServiceFactory` creates **only LocalStorageService** for all storage types (AWS, Linode, Cloudflare, NextCloud all return LocalStorageService with TODO comments).

### Existing Media Controllers
| Controller | Route | Purpose | Auth |
|------------|-------|---------|------|
| `MediaController` | `/api/media` | Org-level media (FormFile) | Required |
| `MediaUploadController` | `/api/media/person` | Person-level media (Base64) | Required |
| `TownImageController` | `/api/town-images` | Town carousel images | Public/Admin |
| `PersonMediaController` | `/api/media` | Media-person linking | Required |

### Architecture: Controllers → Services → Storage

```
Controllers                     Services                          VirtualUpon.Storage
───────────                     ────────                          ───────────────────
MediaUploadController      →    MediaService                  →   IStorageService
  POST upload/base64              UploadMediaAsync()               UploadFileAsync(bytes)
  GET {id}/base64                 GetMediaAsBase64Async()          DownloadFileAsync()
  GET {id}/download               GetMediaBytesAsync()             DownloadFileAsync()
  DELETE {id}                     DeleteMediaAsync()               DeleteFileAsync()
  [NEW] GET {id}/signed-url       GetSignedUrlAsync()              GetSignedUrlAsync()

TownImageController        →    TownImageService              →   IStorageService
  POST upload/base64              UploadImageAsync()               UploadFileAsync(bytes)
  GET {id}/base64                 GetImageAsBase64Async()          DownloadFileAsync()
  GET {id}/download               GetImageBytesAsync()             DownloadFileAsync()
  DELETE {id}                     DeleteImageAsync()               DeleteFileAsync()
  [NEW] GET {id}/signed-url       GetSignedUrlAsync()              GetSignedUrlAsync()

MediaController            →    MediaManagementService        →   IStorageService
  POST upload (FormFile)          UploadMediaAsync()               UploadFileAsync(bytes)
  GET {id}/download               DownloadMediaAsync()             DownloadFileAsync()
  DELETE {id}                     DeleteMediaAsync()               DeleteFileAsync()
  [NEW] GET {id}/signed-url       GetSignedUrlAsync()              GetSignedUrlAsync()

[NEW] MediaStreamController →   (Direct)                      →   IStorageService
  GET stream/{*fileName}          -                                ValidateSignedToken()
                                                                   GetLocalFilePath()
```

### Base64 Handling (No Changes Required)

Base64 conversion happens **in the Services**, not the Controllers:

| Service | Method | Base64 Handling |
|---------|--------|-----------------|
| `MediaService` | `UploadMediaAsync()` | `Base64ToBytes()` before storage |
| `MediaService` | `GetMediaAsBase64Async()` | `BytesToBase64()` after download |
| `TownImageService` | `UploadImageAsync()` | `Base64ToBytes()` before storage |
| `TownImageService` | `GetImageAsBase64Async()` | `BytesToBase64()` after download |

**Controllers don't change** because they only pass Base64 strings to services. The services handle conversion internally.

---

## Implementation Plan

### Phase 1: Switch to VirtualUpon.Storage

**Goal:** Replace FamilyTreeApi's local storage implementation with VirtualUpon.Storage library.

#### 1.1 Update Program.cs DI Registration

**File:** `FamilyTreeApi\Program.cs`

**Change imports:**
```csharp
// Remove:
using FamilyTreeApi.Storage;

// Add:
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;
```

**Update the service registration (around line 295-322):**
```csharp
// Replace the IStorageService registration with VirtualUpon.Storage:
services.AddScoped<VirtualUpon.Storage.Factories.IStorageService>(provider =>
{
    var config = provider.GetRequiredService<IConfiguration>()
        .GetSection("StorageConfiguration").Get<StorageConfiguration>()
        ?? throw new InvalidOperationException("Storage configuration missing.");

    int storageTypeInt = VirtualUpon.Storage.Utilities.StorageTypeHelper.ConvertStorageTypeToInt(config.StorageType);
    var cache = provider.GetService<IDistributedCache>();

    return storageTypeInt switch
    {
        1 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLocalStorageService(config, cache),
        2 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLinodeStorageService(config, cache),
        3 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateAwsStorageService(config, cache),
        4 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateNextCloudStorageService(config, new WebDav.WebDavClient(), new HttpClient(), cache),
        5 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateCloudflareStorageService(config, cache),
        _ => throw new ArgumentException($"Unsupported storage type: {config.StorageType}")
    };
});
```

---

### Phase 2: Update MediaManagementService

**File:** `FamilyTreeApi\Services\MediaManagementService.cs`

#### 2.1 Change namespace import
```csharp
// Remove:
using FamilyTreeApi.Storage;

// Add:
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Utilities;
```

#### 2.2 Update field type
```csharp
// Line 20 - change type:
private readonly VirtualUpon.Storage.Factories.IStorageService _storageService;
```

#### 2.3 Update UploadMediaAsync method (around line 270-274)
```csharp
// Current:
var savedMediaInfo = await _storageService.UploadFileAsync(pathSegments, uniqueFileName, fileBytes);
fileUrl = savedMediaInfo.ImagePath;

// VirtualUpon.Storage returns SavedImageInfoDto with same property name, no change needed
```

#### 2.4 Update DownloadMediaAsync method (around line 462)
```csharp
// Current returns DownloadResponse with FileData
// VirtualUpon.Storage returns DownloadFileResponseDto with same FileData property
// Add IsSuccessful check:
var response = await _storageService.DownloadFileAsync(media.Url);
if (!response.IsSuccessful || response.FileData == null)
{
    return ServiceResult<(byte[], string, string)>.NotFound("Media file data not found");
}
```

#### 2.5 Update DeleteMediaAsync method (around line 416)
```csharp
// VirtualUpon.Storage returns DeleteFileResponseDto
var deleteResult = await _storageService.DeleteFileAsync(media.Url);
if (!deleteResult.IsSuccessful)
{
    _logger.LogWarning("Failed to delete media file: {Error}", deleteResult.ErrorMessage);
}
```

#### 2.6 Add new GetSignedUrlAsync method
```csharp
public async Task<ServiceResult<SignedMediaUrlDto>> GetSignedUrlAsync(
    Guid id,
    int expiresInSeconds,
    UserContext userContext,
    CancellationToken cancellationToken = default)
{
    try
    {
        if (userContext.OrgId == null)
        {
            return ServiceResult<SignedMediaUrlDto>.Failure("You must be a member of an organization.");
        }

        var media = await _context.MediaFiles
            .FirstOrDefaultAsync(m => m.Id == id && m.OrgId == userContext.OrgId.Value, cancellationToken);

        if (media == null)
        {
            return ServiceResult<SignedMediaUrlDto>.NotFound("Media not found");
        }

        var result = await _storageService.GetSignedUrlAsync(media.Url, expiresInSeconds);
        if (!result.IsSuccessful)
        {
            return ServiceResult<SignedMediaUrlDto>.Failure(result.ErrorMessage ?? "Failed to generate signed URL");
        }

        return ServiceResult<SignedMediaUrlDto>.Success(new SignedMediaUrlDto
        {
            Url = result.Url!,
            ExpiresAt = result.ExpiresAt!.Value,
            ContentType = result.ContentType ?? media.MimeType ?? "application/octet-stream"
        });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error generating signed URL for media {MediaId}", id);
        return ServiceResult<SignedMediaUrlDto>.InternalError("Error generating signed URL");
    }
}
```

---

### Phase 3: Update MediaService

**File:** `FamilyTreeApi\Services\MediaService.cs`

#### 3.1 Change namespace import
```csharp
// Remove:
using FamilyTreeApi.Storage;

// Add:
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Utilities;
```

#### 3.2 Update field and constructor
```csharp
private readonly VirtualUpon.Storage.Factories.IStorageService _storageService;

// Line 32 - update StorageTypeHelper reference:
_currentStorageType = VirtualUpon.Storage.Utilities.StorageTypeHelper.ConvertStorageTypeToInt(storageConfig.StorageType);
```

#### 3.3 Update GetStorageServiceByType method (lines 214-227)
```csharp
private VirtualUpon.Storage.Factories.IStorageService GetStorageServiceByType(int storageType)
{
    var cache = _cache;

    return storageType switch
    {
        1 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLocalStorageService(_storageConfig, cache),
        2 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLinodeStorageService(_storageConfig, cache),
        3 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateAwsStorageService(_storageConfig, cache),
        4 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateNextCloudStorageService(_storageConfig, new WebDav.WebDavClient(), new HttpClient(), cache),
        5 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateCloudflareStorageService(_storageConfig, cache),
        _ => throw new ArgumentException($"Unsupported storage type: {storageType}")
    };
}
```

#### 3.4 Update download methods to check IsSuccessful
```csharp
// In GetMediaAsBase64Async (line 129):
var response = await storageService.DownloadFileAsync(media.Url);
if (!response.IsSuccessful || response.FileData == null)
    return null;

// In GetMediaBytesAsync (line 155):
var response = await storageService.DownloadFileAsync(media.Url);
if (!response.IsSuccessful || response.FileData == null)
    return null;
```

#### 3.5 Add new GetSignedUrlAsync method
```csharp
public async Task<SignedUrlResponseDto> GetSignedUrlAsync(Guid mediaId, int expiresInSeconds = 3600)
{
    var media = await _context.MediaFiles
        .AsNoTracking()
        .FirstOrDefaultAsync(m => m.Id == mediaId);

    if (media == null || string.IsNullOrEmpty(media.Url))
    {
        return new SignedUrlResponseDto
        {
            IsSuccessful = false,
            ErrorMessage = "Media not found"
        };
    }

    var storageService = GetStorageServiceByType(media.StorageType);
    return await storageService.GetSignedUrlAsync(media.Url, expiresInSeconds);
}
```

---

### Phase 4: Update TownImageService

**File:** `FamilyTreeApi\Services\TownImageService.cs`

#### 4.1 Change namespace import
```csharp
// Remove:
using FamilyTreeApi.Storage;

// Add:
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Utilities;
```

#### 4.2 Update field type and StorageTypeHelper reference
```csharp
private readonly VirtualUpon.Storage.Factories.IStorageService _storageService;

// Line 40:
_currentStorageType = VirtualUpon.Storage.Utilities.StorageTypeHelper.ConvertStorageTypeToInt(storageConfig.StorageType);
```

#### 4.3 Update GetStorageServiceByType method (lines 368-381)
```csharp
private VirtualUpon.Storage.Factories.IStorageService GetStorageServiceByType(int storageType)
{
    return storageType switch
    {
        1 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLocalStorageService(_storageConfig, _cache),
        2 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLinodeStorageService(_storageConfig, _cache),
        3 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateAwsStorageService(_storageConfig, _cache),
        4 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateNextCloudStorageService(_storageConfig, new WebDav.WebDavClient(), new HttpClient(), _cache),
        5 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateCloudflareStorageService(_storageConfig, _cache),
        _ => throw new ArgumentException($"Unsupported storage type: {storageType}")
    };
}
```

#### 4.4 Update download methods to check IsSuccessful
```csharp
// In GetImageAsBase64Async (line 156):
var response = await storageService.DownloadFileAsync(image.ImageUrl);
if (!response.IsSuccessful || response.FileData == null)
    return null;

// In GetImageBytesAsync (line 182):
var response = await storageService.DownloadFileAsync(image.ImageUrl);
if (!response.IsSuccessful || response.FileData == null)
    return null;
```

#### 4.5 Add new GetSignedUrlAsync method
```csharp
public async Task<SignedUrlResponseDto> GetSignedUrlAsync(Guid imageId, int expiresInSeconds = 3600)
{
    var image = await _context.TownImages
        .AsNoTracking()
        .FirstOrDefaultAsync(i => i.Id == imageId);

    if (image == null || string.IsNullOrEmpty(image.ImageUrl))
    {
        return new SignedUrlResponseDto
        {
            IsSuccessful = false,
            ErrorMessage = "Image not found"
        };
    }

    var storageService = GetStorageServiceByType(image.StorageType);
    return await storageService.GetSignedUrlAsync(image.ImageUrl, expiresInSeconds);
}
```

---

### Phase 5: Update Service Interfaces

#### 5.1 Update IMediaService

**File:** `FamilyTreeApi\Services\IMediaService.cs`

Add:
```csharp
using VirtualUpon.Storage.Dto;

// Add method:
Task<SignedUrlResponseDto> GetSignedUrlAsync(Guid mediaId, int expiresInSeconds = 3600);
```

#### 5.2 Update IMediaManagementService

**File:** `FamilyTreeApi\Services\IMediaManagementService.cs`

Add:
```csharp
using FamilyTreeApi.DTOs;

// Add method:
Task<ServiceResult<SignedMediaUrlDto>> GetSignedUrlAsync(
    Guid id,
    int expiresInSeconds,
    UserContext userContext,
    CancellationToken cancellationToken = default);
```

#### 5.3 Update ITownImageService

**File:** `FamilyTreeApi\Services\ITownImageService.cs`

Add:
```csharp
using VirtualUpon.Storage.Dto;

// Add method:
Task<SignedUrlResponseDto> GetSignedUrlAsync(Guid imageId, int expiresInSeconds = 3600);
```

---

### Phase 6: Update appsettings.json Configuration

**File:** `FamilyTreeApi\appsettings.json`

Update StorageConfiguration section (lines 109-138):

```json
"StorageConfiguration": {
  "StorageType": "LocalStorage",
  "CompressionEnabled": true,
  "StorageCacheEnabled": true,
  "SmartCompressionEnabled": true,

  "LocalStorage": {
    "BasePath": "/var/www/familytree/media/",
    "BaseUrl": "https://api.yourapp.com",
    "SignedUrlPathTemplate": "/api/media/stream/{fileName}?token={token}&expires={expires}",
    "TokenSecret": "your-secret-key-minimum-32-characters-long!"
  },
  "AWS": {
    "AccessKey": "",
    "SecretKey": "",
    "Region": "us-east-1",
    "BucketName": "familytree-media",
    "BasePath": "uploads"
  },
  "Linode": {
    "AccessKey": "",
    "SecretKey": "",
    "S3Endpoint": "https://us-east-1.linodeobjects.com",
    "BucketName": "familytree-media",
    "BasePath": "uploads"
  },
  "Cloudflare": {
    "AccountId": "",
    "AccessKey": "",
    "SecretKey": "",
    "BucketName": "familytree-media",
    "BasePath": "uploads"
  }
}
```

**New properties added:**
- `SmartCompressionEnabled` (root level)
- `LocalStorage.BaseUrl`
- `LocalStorage.SignedUrlPathTemplate`
- `LocalStorage.TokenSecret`

---

### Phase 7: Create New DTOs

#### 7.1 SignedMediaUrlDto

**New File:** `FamilyTreeApi\DTOs\SignedMediaUrlDto.cs`

```csharp
namespace FamilyTreeApi.DTOs;

/// <summary>
/// Response DTO for signed URL requests.
/// </summary>
public class SignedMediaUrlDto
{
    public string Url { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string ContentType { get; set; } = string.Empty;
}
```

---

### Phase 8: Create MediaStreamController

**New File:** `FamilyTreeApi\Controllers\MediaStreamController.cs`

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Controller for streaming media files with signed URL token validation.
/// </summary>
[ApiController]
[Route("api/media")]
public class MediaStreamController : ControllerBase
{
    private readonly IStorageService _storageService;
    private readonly ILogger<MediaStreamController> _logger;

    public MediaStreamController(
        IStorageService storageService,
        ILogger<MediaStreamController> logger)
    {
        _storageService = storageService;
        _logger = logger;
    }

    /// <summary>
    /// Stream a file with signed URL token validation.
    /// Supports HTTP Range requests for video seeking.
    /// </summary>
    /// <param name="fileName">The file path/name to stream</param>
    /// <param name="token">HMAC token for validation</param>
    /// <param name="expires">Unix timestamp when token expires</param>
    [HttpGet("stream/{*fileName}")]
    [AllowAnonymous]  // Token provides authentication
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status206PartialContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult StreamFile(
        string fileName,
        [FromQuery] string token,
        [FromQuery] long expires)
    {
        // Validate parameters
        if (string.IsNullOrEmpty(fileName) || string.IsNullOrEmpty(token))
        {
            return BadRequest("Missing required parameters");
        }

        // Validate token using VirtualUpon.Storage
        if (!_storageService.ValidateSignedToken(fileName, token, expires))
        {
            _logger.LogWarning("Invalid or expired token for file: {FileName}", fileName);
            return Unauthorized("Invalid or expired token");
        }

        // Get local file path (with path traversal protection)
        var filePath = _storageService.GetLocalFilePath(fileName);
        if (filePath == null)
        {
            _logger.LogWarning("File not found or invalid path: {FileName}", fileName);
            return NotFound("File not found");
        }

        // Get content type using VirtualUpon.Storage helper
        var contentType = MediaTypeHelper.GetContentType(fileName);

        // Stream file with HTTP Range support for video seeking
        return PhysicalFile(filePath, contentType, enableRangeProcessing: true);
    }
}
```

---

### Phase 9: Add Signed URL Endpoints to Controllers

**Note:** Existing endpoints (Base64 upload/download, FormFile upload, delete) remain **unchanged**.
Controllers only call service methods - all VirtualUpon.Storage changes are in the Services layer.

Only **new** `/signed-url` endpoints are added to controllers.

#### 9.1 MediaUploadController

**File:** `FamilyTreeApi\Controllers\MediaUploadController.cs`

**Existing endpoints (NO CHANGES):**
- `POST upload/base64` - Upload media as Base64
- `GET {mediaId}/base64` - Get media as Base64
- `GET {mediaId}/download` - Download binary
- `GET {personId}/list` - List person's media
- `DELETE {mediaId}` - Delete media

**Add new endpoint:**
```csharp
using FamilyTreeApi.DTOs;

/// <summary>
/// Get a signed URL for secure media streaming.
/// </summary>
[HttpGet("{mediaId:guid}/signed-url")]
[ProducesResponseType(typeof(SignedMediaUrlDto), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> GetSignedUrl(
    Guid mediaId,
    [FromQuery] int expiresInSeconds = 3600)
{
    var result = await _mediaService.GetSignedUrlAsync(mediaId, expiresInSeconds);

    if (!result.IsSuccessful)
        return NotFound(result.ErrorMessage);

    return Ok(new SignedMediaUrlDto
    {
        Url = result.Url!,
        ExpiresAt = result.ExpiresAt!.Value,
        ContentType = result.ContentType ?? "application/octet-stream"
    });
}
```

#### 9.2 TownImageController

**File:** `FamilyTreeApi\Controllers\TownImageController.cs`

**Existing endpoints (NO CHANGES):**
- `GET landing` - Get landing page carousel images
- `GET town/{townId}` - Get images for specific town
- `GET {imageId}/base64` - Get image as Base64
- `GET {imageId}/download` - Download binary
- `POST upload/base64` - Upload new image (SuperAdmin)
- `PUT {id}` - Update metadata (SuperAdmin)
- `DELETE {id}` - Delete image (SuperAdmin)
- `PUT town/{townId}/reorder` - Reorder images (SuperAdmin)
- `PATCH {id}/toggle-active` - Toggle active status (SuperAdmin)

**Add new endpoint:**
```csharp
using FamilyTreeApi.DTOs;

/// <summary>
/// Get a signed URL for secure town image access.
/// </summary>
[HttpGet("{imageId:guid}/signed-url")]
[AllowAnonymous]  // Town images are public
[ProducesResponseType(typeof(SignedMediaUrlDto), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> GetSignedUrl(
    Guid imageId,
    [FromQuery] int expiresInSeconds = 3600)
{
    var result = await _townImageService.GetSignedUrlAsync(imageId, expiresInSeconds);

    if (!result.IsSuccessful)
        return NotFound(result.ErrorMessage);

    return Ok(new SignedMediaUrlDto
    {
        Url = result.Url!,
        ExpiresAt = result.ExpiresAt!.Value,
        ContentType = result.ContentType ?? "image/webp"
    });
}
```

#### 9.3 MediaController

**File:** `FamilyTreeApi\Controllers\MediaController.cs`

**Existing endpoints (NO CHANGES):**
- `GET` - Search media with filters
- `GET {id}` - Get specific media
- `POST upload` - Upload media (FormFile)
- `PUT {id}` - Update metadata
- `DELETE {id}` - Delete media
- `GET {id}/download` - Download file

**Add new endpoint:**
```csharp
using FamilyTreeApi.DTOs;

/// <summary>
/// Get a signed URL for secure media streaming.
/// </summary>
[HttpGet("{id:guid}/signed-url")]
[ProducesResponseType(typeof(SignedMediaUrlDto), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> GetSignedUrl(
    Guid id,
    [FromQuery] int expiresInSeconds = 3600)
{
    var result = await _mediaManagementService.GetSignedUrlAsync(id, expiresInSeconds, _userContext);

    if (!result.Succeeded)
        return StatusCode(result.StatusCode, new { error = result.Error });

    return Ok(result.Data);
}
```

---

### Phase 10: Remove Local Storage Implementation (After Verification)

After successful integration and testing, delete these files:

| File | Reason |
|------|--------|
| `storage/IStorageService.cs` | Replaced by `VirtualUpon.Storage.Factories.IStorageService` |
| `storage/LocalStorageService.cs` | Replaced by `VirtualUpon.Storage.Services.LocalStorageService` |
| `storage/StorageServiceFactory.cs` | Replaced by `VirtualUpon.Storage.Factories.StorageServiceFactory` |

**Note:** Keep these files during initial testing. Remove only after full verification.

---

## Files Summary

### New Files (2)
| File | Description |
|------|-------------|
| `Controllers/MediaStreamController.cs` | Streaming endpoint with token validation |
| `DTOs/SignedMediaUrlDto.cs` | Response DTO for signed URL endpoints |

### Modified Files (12)
| File | Changes |
|------|---------|
| `appsettings.json` | Add SmartCompressionEnabled, LocalStorage URL config |
| `Program.cs` | Update DI to use VirtualUpon.Storage |
| `Services/MediaManagementService.cs` | Switch to VirtualUpon.Storage, add GetSignedUrlAsync |
| `Services/MediaService.cs` | Switch to VirtualUpon.Storage, add GetSignedUrlAsync |
| `Services/TownImageService.cs` | Switch to VirtualUpon.Storage, add GetSignedUrlAsync |
| `Services/IMediaService.cs` | Add GetSignedUrlAsync interface method |
| `Services/IMediaManagementService.cs` | Add GetSignedUrlAsync interface method |
| `Services/ITownImageService.cs` | Add GetSignedUrlAsync interface method |
| `Controllers/MediaUploadController.cs` | Add signed-url endpoint |
| `Controllers/TownImageController.cs` | Add signed-url endpoint |
| `Controllers/MediaController.cs` | Add signed-url endpoint |

### Files to Delete (after verification)
| File | Reason |
|------|--------|
| `storage/IStorageService.cs` | Replaced by VirtualUpon.Storage |
| `storage/LocalStorageService.cs` | Replaced by VirtualUpon.Storage |
| `storage/StorageServiceFactory.cs` | Replaced by VirtualUpon.Storage |

---

## New API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/media/stream/{*fileName}` | Token | Stream file with signed token |
| GET | `/api/media/person/{mediaId}/signed-url` | JWT | Get signed URL for person media |
| GET | `/api/town-images/{imageId}/signed-url` | Public | Get signed URL for town image |
| GET | `/api/media/{id}/signed-url` | JWT | Get signed URL for org media |

**Query Parameters:**
- `expiresInSeconds` (optional, default: 3600, max: 86400)

---

## DTO Mapping

### VirtualUpon.Storage DTOs → FamilyTreeApi

| VirtualUpon.Storage DTO | Usage |
|-------------------------|-------|
| `SavedImageInfoDto` | Upload response (property: `ImagePath`) |
| `DownloadFileResponseDto` | Download response (properties: `FileData`, `IsSuccessful`) |
| `DeleteFileResponseDto` | Delete response (properties: `IsSuccessful`, `ErrorMessage`) |
| `SignedUrlResponseDto` | Map to `SignedMediaUrlDto` for API response |

---

## Usage Examples

### 1. Get Signed URL for Person Media
```http
GET /api/media/person/550e8400-e29b-41d4-a716-446655440000/signed-url?expiresInSeconds=7200
Authorization: Bearer <jwt-token>

Response:
{
  "url": "https://api.yourapp.com/api/media/stream/family-tree/people/550e.../Image_abc.jpg?token=xyz123&expires=1706123456",
  "expiresAt": "2024-01-25T14:30:00Z",
  "contentType": "image/jpeg"
}
```

### 2. Stream File with Signed Token
```http
GET /api/media/stream/family-tree/people/550e.../Image_abc.jpg?token=xyz123&expires=1706123456

Response: Binary file stream with HTTP 206 Partial Content support
```

### 3. Cloud Storage (AWS/Cloudflare/Linode)
```http
GET /api/media/person/550e8400-e29b-41d4-a716-446655440000/signed-url

Response:
{
  "url": "https://bucket.r2.cloudflarestorage.com/uploads/family-tree/...?X-Amz-Signature=...",
  "expiresAt": "2024-01-25T14:30:00Z",
  "contentType": "image/jpeg"
}
```

---

## Verification Steps

1. **Build:** `dotnet build` - ensure no compilation errors
2. **Test DI:** Verify `VirtualUpon.Storage.Factories.IStorageService` resolves correctly
3. **Test Upload:** Upload a file and verify it works with VirtualUpon.Storage
4. **Test Download:** Download a file and verify response format
5. **Test Signed URL Generation:** Get signed URL for uploaded file
6. **Test Streaming:** Access streaming endpoint with valid token
7. **Test Token Expiration:** Verify expired tokens are rejected
8. **Test Video Seeking:** Test HTTP Range headers for video files
9. **Test Cloud Storage:** If configured, verify pre-signed URLs work

---

## Security Notes

1. **TokenSecret:** Must be at least 32 characters, store in secrets manager
2. **HTTPS:** BaseUrl must use HTTPS in production
3. **Expiration:** Default 1 hour, max 24 hours enforced by VirtualUpon.Storage
4. **Path Traversal:** Protected by `VirtualUpon.Storage.LocalStorageService.GetLocalFilePath()`
5. **Timing Attacks:** Token validation uses constant-time comparison

---

## Optional: Nginx X-Accel-Redirect (Production)

For better performance with large video files, use Nginx internal redirect:

**MediaStreamController update:**
```csharp
// Instead of PhysicalFile(), use:
Response.Headers["X-Accel-Redirect"] = $"/internal-media/{fileName}";
Response.ContentType = contentType;
return new EmptyResult();
```

**Nginx config:**
```nginx
location /internal-media/ {
    internal;
    alias /var/www/familytree/media/;
}
```
