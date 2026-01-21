# Implementation Prompt: Town Images Feature with Carousel & SuperAdmin CRUD

## Overview

Implement a town-based image system where:
1. Each **Town** has multiple images stored in the database
2. **SuperAdmin** can Create, Read, Update, Delete (CRUD) town images
3. **Landing Page** displays a carousel of images from ALL towns
4. **Town Selection Page** displays a carousel of images from user's available towns only
5. **Nubian theme** is applied consistently throughout the application

---

## IMAGE SPECIFICATIONS

### Required Format & Dimensions

| Property | Value |
|----------|-------|
| **Format** | WebP (preferred) or JPEG fallback |
| **Dimensions** | 1920 x 1080 pixels |
| **Aspect Ratio** | 16:9 |
| **Quality** | 80-85% |
| **Max File Size** | 500 KB (target), 2 MB (hard limit) |
| **Color Space** | sRGB |

### Why Single Size?
- Upload ONE size (1920x1080), CSS handles responsive scaling automatically
- Simpler for SuperAdmin to manage
- Modern browsers efficiently scale images
- Can add CDN auto-resize later if needed

### CSS for Responsive Background Images

All carousel slides should use this CSS pattern - the browser handles scaling:

```scss
.carousel-slide {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;       // Scales to cover entire container
  background-position: center;  // Centers the focal point
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 1.5s ease-in-out;

  &.active {
    opacity: 1;
  }
}
```

### HTML Usage

```html
<div class="background-carousel">
  @for (img of carouselImages(); track img.id; let i = $index) {
    <div 
      class="carousel-slide"
      [class.active]="i === currentSlide()"
      [style.background-image]="'url(' + img.imageUrl + ')'"
    ></div>
  }
  <div class="carousel-overlay"></div>
</div>
```

### Image Upload Validation (Backend)

```csharp
public static class ImageValidation
{
    public const int RequiredWidth = 1920;
    public const int RequiredHeight = 1080;
    public const long MaxFileSize = 2 * 1024 * 1024; // 2MB
    public static readonly string[] AllowedMimeTypes = { "image/webp", "image/jpeg", "image/png" };
    
    public static (bool IsValid, string? Error) Validate(IFormFile file)
    {
        if (file.Length > MaxFileSize)
            return (false, "File size must be under 2MB");
            
        if (!AllowedMimeTypes.Contains(file.ContentType.ToLower()))
            return (false, "File must be WebP, JPEG, or PNG");
            
        return (true, null);
    }
}
```

---

## PHASE 1: Database Schema

### 1.1 Create TownImages Table

**Table:** `TownImages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| Id | UUID | PRIMARY KEY | Unique identifier |
| TownId | UUID | FOREIGN KEY → Towns(Id), NOT NULL | Reference to town |
| ImageUrl | VARCHAR(500) | NOT NULL | URL/path to the image |
| Title | VARCHAR(200) | NULL | Optional image title |
| TitleAr | VARCHAR(200) | NULL | Arabic title |
| TitleEn | VARCHAR(200) | NULL | English title |
| Description | VARCHAR(500) | NULL | Optional description |
| DescriptionAr | VARCHAR(500) | NULL | Arabic description |
| DescriptionEn | VARCHAR(500) | NULL | English description |
| DisplayOrder | INT | NOT NULL, DEFAULT 0 | Sort order for carousel |
| IsActive | BOOLEAN | NOT NULL, DEFAULT TRUE | Soft delete / visibility |
| CreatedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| UpdatedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| CreatedBy | BIGINT | FOREIGN KEY → AspNetUsers(Id) | User who created |
| UpdatedBy | BIGINT | NULL | User who last updated |

**Indexes:**
```sql
CREATE INDEX idx_townimages_townid ON "TownImages"("TownId");
CREATE INDEX idx_townimages_active ON "TownImages"("IsActive");
CREATE INDEX idx_townimages_order ON "TownImages"("TownId", "DisplayOrder");
```

**Migration SQL:**
```sql
CREATE TABLE "TownImages" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TownId" uuid NOT NULL,
    "ImageUrl" varchar(500) NOT NULL,
    "Title" varchar(200) NULL,
    "TitleAr" varchar(200) NULL,
    "TitleEn" varchar(200) NULL,
    "Description" varchar(500) NULL,
    "DescriptionAr" varchar(500) NULL,
    "DescriptionEn" varchar(500) NULL,
    "DisplayOrder" int NOT NULL DEFAULT 0,
    "IsActive" boolean NOT NULL DEFAULT true,
    "CreatedAt" timestamp NOT NULL DEFAULT now(),
    "UpdatedAt" timestamp NOT NULL DEFAULT now(),
    "CreatedBy" bigint NOT NULL,
    "UpdatedBy" bigint NULL,
    
    CONSTRAINT "FK_TownImages_Towns" FOREIGN KEY ("TownId") REFERENCES "Towns"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TownImages_CreatedBy" FOREIGN KEY ("CreatedBy") REFERENCES "AspNetUsers"("Id"),
    CONSTRAINT "FK_TownImages_UpdatedBy" FOREIGN KEY ("UpdatedBy") REFERENCES "AspNetUsers"("Id")
);

CREATE INDEX "IX_TownImages_TownId" ON "TownImages"("TownId");
CREATE INDEX "IX_TownImages_IsActive" ON "TownImages"("IsActive");
CREATE INDEX "IX_TownImages_TownId_DisplayOrder" ON "TownImages"("TownId", "DisplayOrder");
```

### 1.2 Entity Model

**File:** `backend/FamilyTreeApi/Models/TownImage.cs`

```csharp
namespace FamilyTreeApi.Models;

public class TownImage
{
    public Guid Id { get; set; }
    public Guid TownId { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? TitleAr { get; set; }
    public string? TitleEn { get; set; }
    public string? Description { get; set; }
    public string? DescriptionAr { get; set; }
    public string? DescriptionEn { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public long CreatedBy { get; set; }
    public long? UpdatedBy { get; set; }

    // Navigation properties
    public virtual Town Town { get; set; } = null!;
    public virtual ApplicationUser CreatedByUser { get; set; } = null!;
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}
```

### 1.3 Update Town Entity

Add navigation property to `Town.cs`:

```csharp
public class Town
{
    // ... existing properties ...
    
    // Add this navigation property
    public virtual ICollection<TownImage> Images { get; set; } = new List<TownImage>();
}
```

### 1.4 Update DbContext

Add to `ApplicationDbContext.cs`:

```csharp
public DbSet<TownImage> TownImages => Set<TownImage>();

// In OnModelCreating:
modelBuilder.Entity<TownImage>(entity =>
{
    entity.ToTable("TownImages");
    entity.HasKey(e => e.Id);
    
    entity.HasOne(e => e.Town)
        .WithMany(t => t.Images)
        .HasForeignKey(e => e.TownId)
        .OnDelete(DeleteBehavior.Cascade);
        
    entity.HasOne(e => e.CreatedByUser)
        .WithMany()
        .HasForeignKey(e => e.CreatedBy)
        .OnDelete(DeleteBehavior.Restrict);
        
    entity.HasOne(e => e.UpdatedByUser)
        .WithMany()
        .HasForeignKey(e => e.UpdatedBy)
        .OnDelete(DeleteBehavior.Restrict);
});
```

---

## PHASE 2: Backend API Endpoints

### 2.1 DTOs

**File:** `backend/FamilyTreeApi/DTOs/TownImageDtos.cs`

```csharp
namespace FamilyTreeApi.DTOs;

// Response DTO for public/read operations
public record TownImageDto
{
    public Guid Id { get; init; }
    public Guid TownId { get; init; }
    public string TownName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int DisplayOrder { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

// Request DTO for creating a new image
public record CreateTownImageRequest
{
    public Guid TownId { get; init; }
    public string ImageUrl { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int DisplayOrder { get; init; } = 0;
    public bool IsActive { get; init; } = true;
}

// Request DTO for updating an image
public record UpdateTownImageRequest
{
    public string? ImageUrl { get; init; }
    public string? Title { get; init; }
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int? DisplayOrder { get; init; }
    public bool? IsActive { get; init; }
}

// Request for bulk reordering
public record ReorderTownImagesRequest
{
    public List<ImageOrderItem> Images { get; init; } = new();
}

public record ImageOrderItem
{
    public Guid ImageId { get; init; }
    public int DisplayOrder { get; init; }
}

// Response for carousel (simplified)
public record CarouselImageDto
{
    public Guid Id { get; init; }
    public Guid TownId { get; init; }
    public string TownName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string? Description { get; init; }
}

// Response wrapper for landing page
public record LandingPageImagesResponse
{
    public List<CarouselImageDto> Images { get; init; } = new();
    public int TotalCount { get; init; }
}
```

### 2.2 TownImage Repository Interface

**File:** `backend/FamilyTreeApi/Repositories/ITownImageRepository.cs`

```csharp
namespace FamilyTreeApi.Repositories;

public interface ITownImageRepository
{
    // Read operations (public)
    Task<List<TownImage>> GetAllActiveImagesAsync(CancellationToken ct = default);
    Task<List<TownImage>> GetImagesByTownIdAsync(Guid townId, bool includeInactive = false, CancellationToken ct = default);
    Task<List<TownImage>> GetImagesByTownIdsAsync(IEnumerable<Guid> townIds, CancellationToken ct = default);
    Task<TownImage?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<TownImage>> GetAllImagesAsync(bool includeInactive = true, CancellationToken ct = default);
    
    // CRUD operations (SuperAdmin only)
    Task<TownImage> CreateAsync(TownImage image, CancellationToken ct = default);
    Task<TownImage> UpdateAsync(TownImage image, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
    Task<bool> ReorderAsync(Guid townId, List<ImageOrderItem> newOrder, CancellationToken ct = default);
}
```

### 2.3 TownImage Repository Implementation

**File:** `backend/FamilyTreeApi/Repositories/TownImageRepository.cs`

```csharp
namespace FamilyTreeApi.Repositories;

public class TownImageRepository : ITownImageRepository
{
    private readonly ApplicationDbContext _context;

    public TownImageRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<TownImage>> GetAllActiveImagesAsync(CancellationToken ct = default)
    {
        return await _context.TownImages
            .Include(i => i.Town)
            .Where(i => i.IsActive)
            .OrderBy(i => i.Town.Name)
            .ThenBy(i => i.DisplayOrder)
            .ToListAsync(ct);
    }

    public async Task<List<TownImage>> GetAllImagesAsync(bool includeInactive = true, CancellationToken ct = default)
    {
        var query = _context.TownImages.Include(i => i.Town).AsQueryable();
        
        if (!includeInactive)
        {
            query = query.Where(i => i.IsActive);
        }
        
        return await query
            .OrderBy(i => i.Town.Name)
            .ThenBy(i => i.DisplayOrder)
            .ToListAsync(ct);
    }

    public async Task<List<TownImage>> GetImagesByTownIdAsync(Guid townId, bool includeInactive = false, CancellationToken ct = default)
    {
        var query = _context.TownImages
            .Include(i => i.Town)
            .Where(i => i.TownId == townId);
            
        if (!includeInactive)
        {
            query = query.Where(i => i.IsActive);
        }
        
        return await query
            .OrderBy(i => i.DisplayOrder)
            .ToListAsync(ct);
    }

    public async Task<List<TownImage>> GetImagesByTownIdsAsync(IEnumerable<Guid> townIds, CancellationToken ct = default)
    {
        return await _context.TownImages
            .Include(i => i.Town)
            .Where(i => townIds.Contains(i.TownId) && i.IsActive)
            .OrderBy(i => i.Town.Name)
            .ThenBy(i => i.DisplayOrder)
            .ToListAsync(ct);
    }

    public async Task<TownImage?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.TownImages
            .Include(i => i.Town)
            .FirstOrDefaultAsync(i => i.Id == id, ct);
    }

    public async Task<TownImage> CreateAsync(TownImage image, CancellationToken ct = default)
    {
        _context.TownImages.Add(image);
        await _context.SaveChangesAsync(ct);
        return image;
    }

    public async Task<TownImage> UpdateAsync(TownImage image, CancellationToken ct = default)
    {
        image.UpdatedAt = DateTime.UtcNow;
        _context.TownImages.Update(image);
        await _context.SaveChangesAsync(ct);
        return image;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var image = await _context.TownImages.FindAsync(new object[] { id }, ct);
        if (image == null) return false;
        
        _context.TownImages.Remove(image);
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> ReorderAsync(Guid townId, List<ImageOrderItem> newOrder, CancellationToken ct = default)
    {
        var images = await _context.TownImages
            .Where(i => i.TownId == townId)
            .ToListAsync(ct);
            
        foreach (var orderItem in newOrder)
        {
            var image = images.FirstOrDefault(i => i.Id == orderItem.ImageId);
            if (image != null)
            {
                image.DisplayOrder = orderItem.DisplayOrder;
                image.UpdatedAt = DateTime.UtcNow;
            }
        }
        
        await _context.SaveChangesAsync(ct);
        return true;
    }
}
```

### 2.4 TownImage Controller

**File:** `backend/FamilyTreeApi/Controllers/TownImageController.cs`

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/town-images")]
public class TownImageController : ControllerBase
{
    private readonly ITownImageRepository _repository;
    private readonly ITownRepository _townRepository;
    private readonly ILogger<TownImageController> _logger;

    public TownImageController(
        ITownImageRepository repository,
        ITownRepository townRepository,
        ILogger<TownImageController> logger)
    {
        _repository = repository;
        _townRepository = townRepository;
        _logger = logger;
    }

    // ========================================================================
    // PUBLIC ENDPOINTS (No Auth Required)
    // ========================================================================

    /// <summary>
    /// Get all active images for landing page carousel (public)
    /// </summary>
    [HttpGet("landing")]
    [AllowAnonymous]
    public async Task<ActionResult<LandingPageImagesResponse>> GetLandingPageImages(CancellationToken ct)
    {
        var images = await _repository.GetAllActiveImagesAsync(ct);
        
        var response = new LandingPageImagesResponse
        {
            Images = images.Select(MapToCarouselDto).ToList(),
            TotalCount = images.Count
        };
        
        return Ok(response);
    }

    /// <summary>
    /// Get images for a specific town (public)
    /// </summary>
    [HttpGet("town/{townId}")]
    [AllowAnonymous]
    public async Task<ActionResult<List<CarouselImageDto>>> GetTownImages(Guid townId, CancellationToken ct)
    {
        var images = await _repository.GetImagesByTownIdAsync(townId, false, ct);
        return Ok(images.Select(MapToCarouselDto).ToList());
    }

    // ========================================================================
    // AUTHENTICATED ENDPOINTS
    // ========================================================================

    /// <summary>
    /// Get images for user's available towns (for town selection carousel)
    /// </summary>
    [HttpGet("available")]
    [Authorize]
    public async Task<ActionResult<List<CarouselImageDto>>> GetAvailableTownImages(CancellationToken ct)
    {
        var userRole = GetSystemRole();
        List<Guid> townIds;
        
        if (userRole == "SuperAdmin")
        {
            // SuperAdmin sees all images
            var allImages = await _repository.GetAllActiveImagesAsync(ct);
            return Ok(allImages.Select(MapToCarouselDto).ToList());
        }
        else if (userRole == "Admin")
        {
            // Admin sees images from assigned towns
            var userId = GetUserId();
            var assignedTowns = await _townRepository.GetTownsByAdminIdAsync(userId, ct);
            townIds = assignedTowns.Select(t => t.Id).ToList();
        }
        else
        {
            // User sees images from all public towns
            var allTowns = await _townRepository.GetAllAsync(ct);
            townIds = allTowns.Select(t => t.Id).ToList();
        }
        
        var images = await _repository.GetImagesByTownIdsAsync(townIds, ct);
        return Ok(images.Select(MapToCarouselDto).ToList());
    }

    // ========================================================================
    // SUPERADMIN CRUD ENDPOINTS
    // ========================================================================

    /// <summary>
    /// Get all images (including inactive) - SuperAdmin only
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<List<TownImageDto>>> GetAllImages(
        [FromQuery] Guid? townId,
        [FromQuery] bool includeInactive = true,
        CancellationToken ct = default)
    {
        List<TownImage> images;
        
        if (townId.HasValue)
        {
            images = await _repository.GetImagesByTownIdAsync(townId.Value, includeInactive, ct);
        }
        else
        {
            images = await _repository.GetAllImagesAsync(includeInactive, ct);
        }
        
        return Ok(images.Select(MapToDto).ToList());
    }

    /// <summary>
    /// Get single image by ID - SuperAdmin only
    /// </summary>
    [HttpGet("{id}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> GetImageById(Guid id, CancellationToken ct)
    {
        var image = await _repository.GetByIdAsync(id, ct);
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }
        
        return Ok(MapToDto(image));
    }

    /// <summary>
    /// Create new town image - SuperAdmin only
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> CreateImage(
        [FromBody] CreateTownImageRequest request,
        CancellationToken ct)
    {
        // Validate town exists
        var town = await _townRepository.GetByIdAsync(request.TownId, ct);
        if (town == null)
        {
            return BadRequest(new { message = "Town not found" });
        }
        
        var image = new TownImage
        {
            Id = Guid.NewGuid(),
            TownId = request.TownId,
            ImageUrl = request.ImageUrl,
            Title = request.Title,
            TitleAr = request.TitleAr,
            TitleEn = request.TitleEn,
            Description = request.Description,
            DescriptionAr = request.DescriptionAr,
            DescriptionEn = request.DescriptionEn,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive,
            CreatedBy = GetUserId(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        
        var created = await _repository.CreateAsync(image, ct);
        
        // Reload with navigation properties
        created = await _repository.GetByIdAsync(created.Id, ct);
        
        _logger.LogInformation("SuperAdmin {UserId} created town image {ImageId} for town {TownId}",
            GetUserId(), created!.Id, request.TownId);
        
        return CreatedAtAction(nameof(GetImageById), new { id = created.Id }, MapToDto(created));
    }

    /// <summary>
    /// Update town image - SuperAdmin only
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> UpdateImage(
        Guid id,
        [FromBody] UpdateTownImageRequest request,
        CancellationToken ct)
    {
        var image = await _repository.GetByIdAsync(id, ct);
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }
        
        // Update only provided fields
        if (request.ImageUrl != null) image.ImageUrl = request.ImageUrl;
        if (request.Title != null) image.Title = request.Title;
        if (request.TitleAr != null) image.TitleAr = request.TitleAr;
        if (request.TitleEn != null) image.TitleEn = request.TitleEn;
        if (request.Description != null) image.Description = request.Description;
        if (request.DescriptionAr != null) image.DescriptionAr = request.DescriptionAr;
        if (request.DescriptionEn != null) image.DescriptionEn = request.DescriptionEn;
        if (request.DisplayOrder.HasValue) image.DisplayOrder = request.DisplayOrder.Value;
        if (request.IsActive.HasValue) image.IsActive = request.IsActive.Value;
        
        image.UpdatedBy = GetUserId();
        image.UpdatedAt = DateTime.UtcNow;
        
        var updated = await _repository.UpdateAsync(image, ct);
        
        _logger.LogInformation("SuperAdmin {UserId} updated town image {ImageId}", GetUserId(), id);
        
        return Ok(MapToDto(updated));
    }

    /// <summary>
    /// Delete town image - SuperAdmin only
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult> DeleteImage(Guid id, CancellationToken ct)
    {
        var image = await _repository.GetByIdAsync(id, ct);
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }
        
        await _repository.DeleteAsync(id, ct);
        
        _logger.LogInformation("SuperAdmin {UserId} deleted town image {ImageId}", GetUserId(), id);
        
        return NoContent();
    }

    /// <summary>
    /// Reorder images for a town - SuperAdmin only
    /// </summary>
    [HttpPut("town/{townId}/reorder")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult> ReorderImages(
        Guid townId,
        [FromBody] ReorderTownImagesRequest request,
        CancellationToken ct)
    {
        var success = await _repository.ReorderAsync(townId, request.Images, ct);
        
        if (!success)
        {
            return BadRequest(new { message = "Failed to reorder images" });
        }
        
        _logger.LogInformation("SuperAdmin {UserId} reordered images for town {TownId}", GetUserId(), townId);
        
        return NoContent();
    }

    /// <summary>
    /// Toggle image active status - SuperAdmin only
    /// </summary>
    [HttpPatch("{id}/toggle-active")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> ToggleActive(Guid id, CancellationToken ct)
    {
        var image = await _repository.GetByIdAsync(id, ct);
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }
        
        image.IsActive = !image.IsActive;
        image.UpdatedBy = GetUserId();
        image.UpdatedAt = DateTime.UtcNow;
        
        var updated = await _repository.UpdateAsync(image, ct);
        
        _logger.LogInformation("SuperAdmin {UserId} toggled image {ImageId} to {IsActive}",
            GetUserId(), id, image.IsActive);
        
        return Ok(MapToDto(updated));
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private static TownImageDto MapToDto(TownImage image) => new()
    {
        Id = image.Id,
        TownId = image.TownId,
        TownName = image.Town?.Name ?? "",
        ImageUrl = image.ImageUrl,
        Title = image.Title,
        TitleAr = image.TitleAr,
        TitleEn = image.TitleEn,
        Description = image.Description,
        DescriptionAr = image.DescriptionAr,
        DescriptionEn = image.DescriptionEn,
        DisplayOrder = image.DisplayOrder,
        IsActive = image.IsActive,
        CreatedAt = image.CreatedAt,
        UpdatedAt = image.UpdatedAt
    };

    private static CarouselImageDto MapToCarouselDto(TownImage image) => new()
    {
        Id = image.Id,
        TownId = image.TownId,
        TownName = image.Town?.Name ?? "",
        ImageUrl = image.ImageUrl,
        Title = image.Title,
        Description = image.Description
    };

    private long GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return long.Parse(claim ?? "0");
    }

    private string GetSystemRole()
    {
        return User.FindFirst("systemRole")?.Value ?? "User";
    }
}
```

### 2.5 TownImage Service (Using Existing IStorageService)

**IMPORTANT:** Reuse the existing `IStorageService` and follow the same Base64 upload pattern used by `MediaService` for avatars and person media.

**File:** `backend/FamilyTreeApi/Services/ITownImageService.cs`

```csharp
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

public interface ITownImageService
{
    // Upload using Base64 (same pattern as MediaService/Avatar)
    Task<TownImage> UploadImageAsync(
        Guid townId,
        string base64Data,
        string fileName,
        string? mimeType = null,
        string? title = null,
        string? titleAr = null,
        string? titleEn = null,
        string? description = null,
        string? descriptionAr = null,
        string? descriptionEn = null,
        int displayOrder = 0,
        long createdBy = 0);

    // Download as Base64 (for frontend display)
    Task<string?> GetImageAsBase64Async(Guid imageId);

    // Download as bytes (for direct file download)
    Task<(byte[] data, string mimeType)?> GetImageBytesAsync(Guid imageId);

    // Delete image (removes from storage + database)
    Task<bool> DeleteImageAsync(Guid imageId);

    // Get all images for a town
    Task<IEnumerable<TownImage>> GetTownImagesAsync(Guid townId, bool includeInactive = false);

    // Get all active images (for landing page)
    Task<IEnumerable<TownImage>> GetAllActiveImagesAsync();

    // Update image metadata (not the file itself)
    Task<TownImage?> UpdateImageMetadataAsync(Guid imageId, UpdateTownImageRequest request, long updatedBy);

    // Reorder images
    Task<bool> ReorderImagesAsync(Guid townId, List<ImageOrderItem> newOrder);

    // Toggle active status
    Task<TownImage?> ToggleActiveAsync(Guid imageId, long updatedBy);
}
```

**File:** `backend/FamilyTreeApi/Services/TownImageService.cs`

```csharp
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.Storage;
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

public class TownImageService : ITownImageService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<TownImageService> _logger;
    private readonly StorageConfiguration _storageConfig;
    private readonly IStorageService _storageService;
    private readonly int _currentStorageType;

    public TownImageService(
        ApplicationDbContext context,
        ILogger<TownImageService> logger,
        StorageConfiguration storageConfig,
        IStorageService storageService)
    {
        _context = context;
        _logger = logger;
        _storageConfig = storageConfig;
        _storageService = storageService;
        _currentStorageType = StorageTypeHelper.ConvertStorageTypeToInt(storageConfig.StorageType);
    }

    public async Task<TownImage> UploadImageAsync(
        Guid townId,
        string base64Data,
        string fileName,
        string? mimeType = null,
        string? title = null,
        string? titleAr = null,
        string? titleEn = null,
        string? description = null,
        string? descriptionAr = null,
        string? descriptionEn = null,
        int displayOrder = 0,
        long createdBy = 0)
    {
        try
        {
            // Validate town exists
            var town = await _context.Towns.FindAsync(townId);
            if (town == null)
                throw new ArgumentException($"Town {townId} not found");

            // Convert Base64 to bytes (handle data URL prefix)
            var imageBytes = Base64ToBytes(base64Data);

            // Validate file size (max 2MB for town images)
            if (imageBytes.Length > 2 * 1024 * 1024)
                throw new ArgumentException("Image file size must be under 2MB");

            // Determine MIME type from filename if not provided
            if (string.IsNullOrEmpty(mimeType))
                mimeType = GetMimeTypeFromExtension(fileName);

            // Validate MIME type (images only)
            var allowedTypes = new[] { "image/webp", "image/jpeg", "image/png" };
            if (!allowedTypes.Contains(mimeType.ToLower()))
                throw new ArgumentException("Invalid file type. Allowed: WebP, JPEG, PNG");

            // Determine file extension
            var extension = Path.GetExtension(fileName);
            if (string.IsNullOrEmpty(extension))
                extension = GetExtensionFromMimeType(mimeType);

            // Generate unique filename
            var uniqueFileName = $"town-image_{Guid.NewGuid()}{extension}";

            // Define storage path: /uploads/family-tree/towns/{townId}/images/
            string[] pathSegments = new[] { "family-tree", "towns", townId.ToString(), "images" };

            // Upload to storage using existing IStorageService
            var savedMediaInfo = await _storageService.UploadFileAsync(
                pathSegments,
                uniqueFileName,
                imageBytes
            );

            // Create database record
            var townImage = new TownImage
            {
                Id = Guid.NewGuid(),
                TownId = townId,
                ImageUrl = savedMediaInfo.ImagePath,
                StorageKey = savedMediaInfo.StorageKey,
                FileName = fileName,
                MimeType = mimeType,
                FileSize = imageBytes.Length,
                StorageType = _currentStorageType,
                Title = title,
                TitleAr = titleAr,
                TitleEn = titleEn,
                Description = description,
                DescriptionAr = descriptionAr,
                DescriptionEn = descriptionEn,
                DisplayOrder = displayOrder,
                IsActive = true,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _context.TownImages.AddAsync(townImage);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Uploaded town image {FileName} for town {TownId} by user {UserId}",
                fileName, townId, createdBy);

            // Reload with navigation properties
            return await _context.TownImages
                .Include(i => i.Town)
                .FirstAsync(i => i.Id == townImage.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading town image for town {TownId}", townId);
            throw;
        }
    }

    public async Task<string?> GetImageAsBase64Async(Guid imageId)
    {
        try
        {
            var image = await _context.TownImages
                .AsNoTracking()
                .FirstOrDefaultAsync(i => i.Id == imageId);

            if (image == null || string.IsNullOrEmpty(image.ImageUrl))
                return null;

            var storageService = GetStorageServiceByType(image.StorageType);
            var response = await storageService.DownloadFileAsync(image.ImageUrl);

            if (response.FileData == null)
                return null;

            return BytesToBase64(response.FileData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving town image {ImageId} as Base64", imageId);
            return null;
        }
    }

    public async Task<(byte[] data, string mimeType)?> GetImageBytesAsync(Guid imageId)
    {
        try
        {
            var image = await _context.TownImages
                .AsNoTracking()
                .FirstOrDefaultAsync(i => i.Id == imageId);

            if (image == null || string.IsNullOrEmpty(image.ImageUrl))
                return null;

            var storageService = GetStorageServiceByType(image.StorageType);
            var response = await storageService.DownloadFileAsync(image.ImageUrl);

            if (response.FileData == null)
                return null;

            return (response.FileData, image.MimeType ?? "image/webp");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving town image bytes {ImageId}", imageId);
            return null;
        }
    }

    public async Task<bool> DeleteImageAsync(Guid imageId)
    {
        try
        {
            var image = await _context.TownImages.FindAsync(imageId);
            if (image == null)
                return false;

            // Delete from storage
            if (!string.IsNullOrEmpty(image.ImageUrl))
            {
                try
                {
                    var storageService = GetStorageServiceByType(image.StorageType);
                    await storageService.DeleteFileAsync(image.ImageUrl);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete town image file from storage: {Url}", image.ImageUrl);
                }
            }

            // Delete from database
            _context.TownImages.Remove(image);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Deleted town image {ImageId}", imageId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting town image {ImageId}", imageId);
            return false;
        }
    }

    public async Task<IEnumerable<TownImage>> GetTownImagesAsync(Guid townId, bool includeInactive = false)
    {
        var query = _context.TownImages
            .Include(i => i.Town)
            .Where(i => i.TownId == townId);

        if (!includeInactive)
            query = query.Where(i => i.IsActive);

        return await query
            .OrderBy(i => i.DisplayOrder)
            .ToListAsync();
    }

    public async Task<IEnumerable<TownImage>> GetAllActiveImagesAsync()
    {
        return await _context.TownImages
            .Include(i => i.Town)
            .Where(i => i.IsActive)
            .OrderBy(i => i.Town.Name)
            .ThenBy(i => i.DisplayOrder)
            .ToListAsync();
    }

    public async Task<TownImage?> UpdateImageMetadataAsync(Guid imageId, UpdateTownImageRequest request, long updatedBy)
    {
        var image = await _context.TownImages
            .Include(i => i.Town)
            .FirstOrDefaultAsync(i => i.Id == imageId);

        if (image == null)
            return null;

        // Update only provided fields
        if (request.Title != null) image.Title = request.Title;
        if (request.TitleAr != null) image.TitleAr = request.TitleAr;
        if (request.TitleEn != null) image.TitleEn = request.TitleEn;
        if (request.Description != null) image.Description = request.Description;
        if (request.DescriptionAr != null) image.DescriptionAr = request.DescriptionAr;
        if (request.DescriptionEn != null) image.DescriptionEn = request.DescriptionEn;
        if (request.DisplayOrder.HasValue) image.DisplayOrder = request.DisplayOrder.Value;
        if (request.IsActive.HasValue) image.IsActive = request.IsActive.Value;

        image.UpdatedBy = updatedBy;
        image.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated town image {ImageId} by user {UserId}", imageId, updatedBy);

        return image;
    }

    public async Task<bool> ReorderImagesAsync(Guid townId, List<ImageOrderItem> newOrder)
    {
        var images = await _context.TownImages
            .Where(i => i.TownId == townId)
            .ToListAsync();

        foreach (var orderItem in newOrder)
        {
            var image = images.FirstOrDefault(i => i.Id == orderItem.ImageId);
            if (image != null)
            {
                image.DisplayOrder = orderItem.DisplayOrder;
                image.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<TownImage?> ToggleActiveAsync(Guid imageId, long updatedBy)
    {
        var image = await _context.TownImages
            .Include(i => i.Town)
            .FirstOrDefaultAsync(i => i.Id == imageId);

        if (image == null)
            return null;

        image.IsActive = !image.IsActive;
        image.UpdatedBy = updatedBy;
        image.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Toggled town image {ImageId} active status to {IsActive}", imageId, image.IsActive);

        return image;
    }

    // ========================================================================
    // HELPER METHODS (same as MediaService)
    // ========================================================================

    private IStorageService GetStorageServiceByType(int storageType)
    {
        return storageType switch
        {
            1 => StorageServiceFactory.CreateLocalStorageService(_storageConfig, null),
            2 => StorageServiceFactory.CreateLinodeStorageService(_storageConfig, null),
            3 => StorageServiceFactory.CreateAwsStorageService(_storageConfig, null),
            4 => StorageServiceFactory.CreateNextCloudStorageService(_storageConfig, new WebDav.WebDavClient(), new HttpClient(), null),
            5 => StorageServiceFactory.CreateCloudflareStorageService(_storageConfig, null),
            _ => throw new ArgumentException($"Unsupported storage type: {storageType}")
        };
    }

    private static byte[] Base64ToBytes(string base64)
    {
        // Handle data URL prefix (e.g., "data:image/webp;base64,...")
        if (base64.Contains(','))
            base64 = base64.Split(',')[1];

        return Convert.FromBase64String(base64);
    }

    private static string BytesToBase64(byte[] bytes)
    {
        return Convert.ToBase64String(bytes);
    }

    private static string GetExtensionFromMimeType(string mimeType)
    {
        return mimeType.ToLower() switch
        {
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".webp"
        };
    }

    private static string GetMimeTypeFromExtension(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLower();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/webp"
        };
    }
}
```

### 2.6 Update TownImage Entity

Add storage-related fields to the entity:

**File:** `backend/FamilyTreeApi/Models/TownImage.cs`

```csharp
namespace FamilyTreeApi.Models;

public class TownImage
{
    public Guid Id { get; set; }
    public Guid TownId { get; set; }
    
    // Storage fields (same pattern as Media entity)
    public string ImageUrl { get; set; } = string.Empty;  // Public URL/path
    public string? StorageKey { get; set; }               // Storage key for retrieval
    public string? FileName { get; set; }                 // Original filename
    public string? MimeType { get; set; }                 // e.g., image/webp
    public long FileSize { get; set; }                    // Size in bytes
    public int StorageType { get; set; }                  // 1=Local, 2=Linode, etc.
    
    // Metadata
    public string? Title { get; set; }
    public string? TitleAr { get; set; }
    public string? TitleEn { get; set; }
    public string? Description { get; set; }
    public string? DescriptionAr { get; set; }
    public string? DescriptionEn { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    
    // Audit
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public long CreatedBy { get; set; }
    public long? UpdatedBy { get; set; }

    // Navigation properties
    public virtual Town Town { get; set; } = null!;
    public virtual ApplicationUser CreatedByUser { get; set; } = null!;
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}
```

### 2.7 Update Database Migration

Add the new storage fields:

```sql
CREATE TABLE "TownImages" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TownId" uuid NOT NULL,
    
    -- Storage fields (same pattern as MediaFiles table)
    "ImageUrl" varchar(500) NOT NULL,
    "StorageKey" varchar(500) NULL,
    "FileName" varchar(255) NULL,
    "MimeType" varchar(50) NULL,
    "FileSize" bigint NOT NULL DEFAULT 0,
    "StorageType" int NOT NULL DEFAULT 1,
    
    -- Metadata
    "Title" varchar(200) NULL,
    "TitleAr" varchar(200) NULL,
    "TitleEn" varchar(200) NULL,
    "Description" varchar(500) NULL,
    "DescriptionAr" varchar(500) NULL,
    "DescriptionEn" varchar(500) NULL,
    "DisplayOrder" int NOT NULL DEFAULT 0,
    "IsActive" boolean NOT NULL DEFAULT true,
    
    -- Audit
    "CreatedAt" timestamp NOT NULL DEFAULT now(),
    "UpdatedAt" timestamp NOT NULL DEFAULT now(),
    "CreatedBy" bigint NOT NULL,
    "UpdatedBy" bigint NULL,
    
    CONSTRAINT "FK_TownImages_Towns" FOREIGN KEY ("TownId") REFERENCES "Towns"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TownImages_CreatedBy" FOREIGN KEY ("CreatedBy") REFERENCES "AspNetUsers"("Id"),
    CONSTRAINT "FK_TownImages_UpdatedBy" FOREIGN KEY ("UpdatedBy") REFERENCES "AspNetUsers"("Id")
);

CREATE INDEX "IX_TownImages_TownId" ON "TownImages"("TownId");
CREATE INDEX "IX_TownImages_IsActive" ON "TownImages"("IsActive");
CREATE INDEX "IX_TownImages_TownId_DisplayOrder" ON "TownImages"("TownId", "DisplayOrder");
```

### 2.8 Controller Using Service

**File:** `backend/FamilyTreeApi/Controllers/TownImageController.cs`

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using FamilyTreeApi.Services;
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/town-images")]
public class TownImageController : ControllerBase
{
    private readonly ITownImageService _townImageService;
    private readonly ILogger<TownImageController> _logger;

    public TownImageController(
        ITownImageService townImageService,
        ILogger<TownImageController> logger)
    {
        _townImageService = townImageService;
        _logger = logger;
    }

    // ========================================================================
    // PUBLIC ENDPOINTS (No Auth Required)
    // ========================================================================

    /// <summary>
    /// Get all active images for landing page carousel (public)
    /// </summary>
    [HttpGet("landing")]
    [AllowAnonymous]
    public async Task<ActionResult<LandingPageImagesResponse>> GetLandingPageImages()
    {
        var images = await _townImageService.GetAllActiveImagesAsync();
        
        var response = new LandingPageImagesResponse
        {
            Images = images.Select(MapToCarouselDto).ToList(),
            TotalCount = images.Count()
        };
        
        return Ok(response);
    }

    /// <summary>
    /// Get images for a specific town (public)
    /// </summary>
    [HttpGet("town/{townId}")]
    [AllowAnonymous]
    public async Task<ActionResult<List<CarouselImageDto>>> GetTownImages(Guid townId)
    {
        var images = await _townImageService.GetTownImagesAsync(townId, false);
        return Ok(images.Select(MapToCarouselDto).ToList());
    }

    /// <summary>
    /// Download image as Base64 (for frontend display)
    /// </summary>
    [HttpGet("{imageId}/base64")]
    [AllowAnonymous]
    public async Task<ActionResult> GetImageAsBase64(Guid imageId)
    {
        var base64Data = await _townImageService.GetImageAsBase64Async(imageId);
        if (base64Data == null)
            return NotFound(new { message = "Image not found" });

        return Ok(new { base64Data });
    }

    /// <summary>
    /// Download image as file (direct binary download)
    /// </summary>
    [HttpGet("{imageId}/download")]
    [AllowAnonymous]
    public async Task<ActionResult> DownloadImage(Guid imageId)
    {
        var result = await _townImageService.GetImageBytesAsync(imageId);
        if (result == null)
            return NotFound(new { message = "Image not found" });

        var (data, mimeType) = result.Value;
        return File(data, mimeType);
    }

    // ========================================================================
    // SUPERADMIN CRUD ENDPOINTS
    // ========================================================================

    /// <summary>
    /// Upload new town image using Base64 - SuperAdmin only
    /// </summary>
    [HttpPost("upload/base64")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> UploadImage([FromBody] UploadTownImageRequest request)
    {
        try
        {
            var image = await _townImageService.UploadImageAsync(
                request.TownId,
                request.Base64Data,
                request.FileName,
                request.MimeType,
                request.Title,
                request.TitleAr,
                request.TitleEn,
                request.Description,
                request.DescriptionAr,
                request.DescriptionEn,
                request.DisplayOrder,
                GetUserId()
            );

            _logger.LogInformation("SuperAdmin {UserId} uploaded town image for town {TownId}", GetUserId(), request.TownId);

            return CreatedAtAction(nameof(GetImageAsBase64), new { imageId = image.Id }, MapToDto(image));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading town image");
            return StatusCode(500, new { message = "Failed to upload image" });
        }
    }

    /// <summary>
    /// Update image metadata - SuperAdmin only
    /// </summary>
    [HttpPut("{imageId}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> UpdateImage(Guid imageId, [FromBody] UpdateTownImageRequest request)
    {
        var image = await _townImageService.UpdateImageMetadataAsync(imageId, request, GetUserId());
        if (image == null)
            return NotFound(new { message = "Image not found" });

        return Ok(MapToDto(image));
    }

    /// <summary>
    /// Delete town image - SuperAdmin only
    /// </summary>
    [HttpDelete("{imageId}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult> DeleteImage(Guid imageId)
    {
        var success = await _townImageService.DeleteImageAsync(imageId);
        if (!success)
            return NotFound(new { message = "Image not found" });

        return NoContent();
    }

    /// <summary>
    /// Toggle image active status - SuperAdmin only
    /// </summary>
    [HttpPatch("{imageId}/toggle-active")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> ToggleActive(Guid imageId)
    {
        var image = await _townImageService.ToggleActiveAsync(imageId, GetUserId());
        if (image == null)
            return NotFound(new { message = "Image not found" });

        return Ok(MapToDto(image));
    }

    /// <summary>
    /// Reorder images for a town - SuperAdmin only
    /// </summary>
    [HttpPut("town/{townId}/reorder")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult> ReorderImages(Guid townId, [FromBody] ReorderTownImagesRequest request)
    {
        var success = await _townImageService.ReorderImagesAsync(townId, request.Images);
        if (!success)
            return BadRequest(new { message = "Failed to reorder images" });

        return NoContent();
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private static TownImageDto MapToDto(TownImage image) => new()
    {
        Id = image.Id,
        TownId = image.TownId,
        TownName = image.Town?.Name ?? "",
        ImageUrl = image.ImageUrl,
        FileName = image.FileName,
        MimeType = image.MimeType,
        FileSize = image.FileSize,
        Title = image.Title,
        TitleAr = image.TitleAr,
        TitleEn = image.TitleEn,
        Description = image.Description,
        DescriptionAr = image.DescriptionAr,
        DescriptionEn = image.DescriptionEn,
        DisplayOrder = image.DisplayOrder,
        IsActive = image.IsActive,
        CreatedAt = image.CreatedAt,
        UpdatedAt = image.UpdatedAt
    };

    private static CarouselImageDto MapToCarouselDto(TownImage image) => new()
    {
        Id = image.Id,
        TownId = image.TownId,
        TownName = image.Town?.Name ?? "",
        ImageUrl = image.ImageUrl,
        Title = image.Title,
        Description = image.Description
    };

    private long GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return long.Parse(claim ?? "0");
    }
}
```

### 2.9 DTOs for Town Images

**File:** `backend/FamilyTreeApi/DTOs/TownImageDtos.cs`

```csharp
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
    
    public string? Title { get; init; }
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int DisplayOrder { get; init; } = 0;
}

/// <summary>
/// Response DTO for town image
/// </summary>
public record TownImageDto
{
    public Guid Id { get; init; }
    public Guid TownId { get; init; }
    public string TownName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string? FileName { get; init; }
    public string? MimeType { get; init; }
    public long FileSize { get; init; }
    public string? Title { get; init; }
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int DisplayOrder { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

/// <summary>
/// Simplified DTO for carousel display
/// </summary>
public record CarouselImageDto
{
    public Guid Id { get; init; }
    public Guid TownId { get; init; }
    public string TownName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string? Description { get; init; }
}

/// <summary>
/// Request for updating image metadata (not the file)
/// </summary>
public record UpdateTownImageRequest
{
    public string? Title { get; init; }
    public string? TitleAr { get; init; }
    public string? TitleEn { get; init; }
    public string? Description { get; init; }
    public string? DescriptionAr { get; init; }
    public string? DescriptionEn { get; init; }
    public int? DisplayOrder { get; init; }
    public bool? IsActive { get; init; }
}

/// <summary>
/// Request for reordering images
/// </summary>
public record ReorderTownImagesRequest
{
    public List<ImageOrderItem> Images { get; init; } = new();
}

public record ImageOrderItem
{
    public Guid ImageId { get; init; }
    public int DisplayOrder { get; init; }
}

/// <summary>
/// Response for landing page
/// </summary>
public record LandingPageImagesResponse
{
    public List<CarouselImageDto> Images { get; init; } = new();
    public int TotalCount { get; init; }
}
```

### 2.10 Register Services

Add to `Program.cs`:

```csharp
builder.Services.AddScoped<ITownImageRepository, TownImageRepository>();
```

---

## PHASE 3: Frontend Implementation

### 3.1 Service (Using Base64 Upload Pattern)

**File:** `frontend/src/app/core/services/town-image.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TownImageDto,
  CarouselImageDto,
  UploadTownImageRequest,
  UpdateTownImageRequest,
  ReorderTownImagesRequest,
  LandingPageImagesResponse
} from '../models/town-image.models';

@Injectable({ providedIn: 'root' })
export class TownImageService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/town-images`;

  // ========================================
  // PUBLIC ENDPOINTS
  // ========================================

  /** Get all images for landing page carousel (public) */
  getLandingPageImages(): Observable<LandingPageImagesResponse> {
    return this.http.get<LandingPageImagesResponse>(`${this.apiUrl}/landing`);
  }

  /** Get images for a specific town (public) */
  getTownImages(townId: string): Observable<CarouselImageDto[]> {
    return this.http.get<CarouselImageDto[]>(`${this.apiUrl}/town/${townId}`);
  }

  /** Get image as Base64 (for display) */
  getImageAsBase64(imageId: string): Observable<{ base64Data: string }> {
    return this.http.get<{ base64Data: string }>(`${this.apiUrl}/${imageId}/base64`);
  }

  /** Get download URL for image */
  getImageDownloadUrl(imageId: string): string {
    return `${this.apiUrl}/${imageId}/download`;
  }

  // ========================================
  // AUTHENTICATED ENDPOINTS
  // ========================================

  /** Get images for user's available towns (town selection) */
  getAvailableTownImages(): Observable<CarouselImageDto[]> {
    return this.http.get<CarouselImageDto[]>(`${this.apiUrl}/available`);
  }

  // ========================================
  // SUPERADMIN CRUD ENDPOINTS (Base64 Upload)
  // ========================================

  /** 
   * Upload new image using Base64 (SuperAdmin)
   * Same pattern as avatar/media upload
   */
  uploadImage(request: UploadTownImageRequest): Observable<TownImageDto> {
    return this.http.post<TownImageDto>(`${this.apiUrl}/upload/base64`, request);
  }

  /** 
   * Helper: Convert File to Base64 and upload
   */
  uploadImageFile(
    townId: string,
    file: File,
    metadata?: {
      title?: string;
      titleAr?: string;
      titleEn?: string;
      description?: string;
      descriptionAr?: string;
      descriptionEn?: string;
      displayOrder?: number;
    }
  ): Observable<TownImageDto> {
    return new Observable(observer => {
      const reader = new FileReader();
      
      reader.onload = () => {
        const base64Data = reader.result as string;
        
        const request: UploadTownImageRequest = {
          townId,
          base64Data,
          fileName: file.name,
          mimeType: file.type,
          ...metadata
        };
        
        this.uploadImage(request).subscribe({
          next: (result) => {
            observer.next(result);
            observer.complete();
          },
          error: (err) => observer.error(err)
        });
      };
      
      reader.onerror = () => observer.error(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /** Get all images (SuperAdmin) */
  getAllImages(townId?: string, includeInactive = true): Observable<TownImageDto[]> {
    let url = this.apiUrl;
    const params: string[] = [];
    if (townId) params.push(`townId=${townId}`);
    if (includeInactive) params.push(`includeInactive=true`);
    if (params.length) url += `?${params.join('&')}`;
    return this.http.get<TownImageDto[]>(url);
  }

  /** Update image metadata (SuperAdmin) */
  updateImage(id: string, request: UpdateTownImageRequest): Observable<TownImageDto> {
    return this.http.put<TownImageDto>(`${this.apiUrl}/${id}`, request);
  }

  /** Delete image (SuperAdmin) */
  deleteImage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /** Reorder images for a town (SuperAdmin) */
  reorderImages(townId: string, request: ReorderTownImagesRequest): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/town/${townId}/reorder`, request);
  }

  /** Toggle image active status (SuperAdmin) */
  toggleActive(id: string): Observable<TownImageDto> {
    return this.http.patch<TownImageDto>(`${this.apiUrl}/${id}/toggle-active`, {});
  }
}
```

### 3.2 Models

**File:** `frontend/src/app/core/models/town-image.models.ts`

```typescript
export interface TownImageDto {
  id: string;
  townId: string;
  townName: string;
  imageUrl: string;
  fileName?: string;
  mimeType?: string;
  fileSize: number;
  title?: string;
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CarouselImageDto {
  id: string;
  townId: string;
  townName: string;
  imageUrl: string;
  title?: string;
  description?: string;
}

/**
 * Request for uploading town image (Base64)
 * Same pattern as avatar upload
 */
export interface UploadTownImageRequest {
  townId: string;
  /** Base64 encoded image data (with or without data URL prefix) */
  base64Data: string;
  /** Original filename */
  fileName: string;
  /** MIME type (e.g., image/webp) */
  mimeType?: string;
  title?: string;
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  displayOrder?: number;
}

export interface UpdateTownImageRequest {
  title?: string;
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface ReorderTownImagesRequest {
  images: { imageId: string; displayOrder: number }[];
}

export interface LandingPageImagesResponse {
  images: CarouselImageDto[];
  totalCount: number;
}
```

### 3.3 Update Town Selection to Use API Images

**File:** `frontend/src/app/features/onboarding/town-selection.component.ts`

Update to fetch images from API instead of hardcoded URLs:

```typescript
// Add import
import { TownImageService } from '../../core/services/town-image.service';
import { CarouselImageDto } from '../../core/models/town-image.models';

// Add to component
private townImageService = inject(TownImageService);

// Change carouselImages type
carouselImages = signal<CarouselImageDto[]>([]);

// Update ngOnInit
ngOnInit(): void {
  const user = this.authService.getCurrentUser();
  this.isAdmin = user?.systemRole === 'Admin';
  
  this.loadTowns();
  this.loadCarouselImages();
  this.startCarousel();
}

// Add method to load images
private loadCarouselImages(): void {
  this.townImageService.getAvailableTownImages().subscribe({
    next: (images) => {
      this.carouselImages.set(images);
    },
    error: (err) => {
      console.error('Failed to load carousel images:', err);
      // Fallback to empty array - carousel will show gradient background
    }
  });
}
```

### 3.4 Carousel CSS (Responsive Single-Image Approach)

**Critical CSS for background image carousels.** This handles all screen sizes with one image:

```scss
// ============================================
// CAROUSEL STYLES - RESPONSIVE SINGLE IMAGE
// ============================================
// Upload 1920x1080 WebP images. CSS handles scaling.

.background-carousel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  overflow: hidden;
}

.carousel-slide {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  
  // KEY: These properties handle responsive scaling
  background-size: cover;        // Scale to cover entire container
  background-position: center;   // Center the focal point
  background-repeat: no-repeat;  // No tiling
  
  // Smooth fade transition
  opacity: 0;
  transition: opacity 1.5s ease-in-out;
  
  // Hardware acceleration for smooth animations
  will-change: opacity;
  transform: translateZ(0);

  &.active {
    opacity: 1;
  }
}

// Gradient overlay for text readability (Nubian theme)
.carousel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(24, 117, 115, 0.85) 0%,    // Nubian Teal
    rgba(45, 45, 45, 0.9) 50%,       // Charcoal
    rgba(193, 126, 62, 0.85) 100%   // Nubian Gold
  );
  z-index: 1;
}

// Carousel indicators (dots)
.carousel-indicators {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
}

.indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0;

  &:hover {
    border-color: white;
    background: rgba(255, 255, 255, 0.3);
  }

  &.active {
    background: #C17E3E;      // Nubian Gold
    border-color: #C17E3E;
    transform: scale(1.2);
  }
}

// Loading state - show gradient while images load
.carousel-loading,
.carousel-fallback {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    #187573 0%,    // Nubian Teal
    #2D2D2D 50%,   // Charcoal
    #C17E3E 100%   // Nubian Gold
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

// ============================================
// RESPONSIVE ADJUSTMENTS
// ============================================

// Mobile: Adjust overlay opacity for better contrast
@media (max-width: 576px) {
  .carousel-overlay {
    background: linear-gradient(
      135deg,
      rgba(24, 117, 115, 0.9) 0%,
      rgba(45, 45, 45, 0.95) 50%,
      rgba(193, 126, 62, 0.9) 100%
    );
  }
  
  .carousel-indicators {
    bottom: 16px;
    gap: 6px;
  }
  
  .indicator {
    width: 8px;
    height: 8px;
  }
}

// Landscape mobile: Ensure full coverage
@media (max-width: 896px) and (orientation: landscape) {
  .carousel-slide {
    background-position: center center;
  }
}

// Large screens (4K): Still works with 1920x1080 source
@media (min-width: 2560px) {
  .carousel-slide {
    // Image will scale up - WebP handles this well
    // Consider adding a subtle blur for very large screens if quality degrades
    // filter: blur(0.5px); // Optional
  }
}
```

### 3.5 Carousel Template

```html
<div class="background-carousel">
  <!-- Loading state -->
  @if (loadingImages()) {
    <div class="carousel-loading">
      <mat-spinner diameter="40" color="accent"></mat-spinner>
    </div>
  } 
  <!-- No images fallback -->
  @else if (carouselImages().length === 0) {
    <div class="carousel-fallback"></div>
  } 
  <!-- Carousel slides -->
  @else {
    @for (img of carouselImages(); track img.id; let i = $index) {
      <div 
        class="carousel-slide"
        [class.active]="i === currentSlide()"
        [style.background-image]="'url(' + img.imageUrl + ')'"
      ></div>
    }
  }
  
  <!-- Overlay for text readability -->
  <div class="carousel-overlay"></div>
</div>

<!-- Carousel Indicators -->
@if (carouselImages().length > 1) {
  <div class="carousel-indicators">
    @for (img of carouselImages(); track img.id; let i = $index) {
      <button 
        class="indicator"
        [class.active]="i === currentSlide()"
        (click)="goToSlide(i)"
        [attr.aria-label]="'Slide ' + (i + 1)"
      ></button>
    }
  </div>
}
```

### 3.6 Create Landing Page Component

Create a public landing page that shows all town images.

### 3.7 Create SuperAdmin Image Management

**File:** `frontend/src/app/features/admin/town-images/town-images-management.component.ts`

Create management UI with:
- Table/grid of all images
- Filter by town dropdown
- Add/Edit image dialog
- Delete confirmation
- Drag-drop reordering
- Toggle active status
- Image preview

### 3.8 Add Routes

```typescript
// Public landing page
{ path: '', component: LandingComponent, pathMatch: 'full' },

// SuperAdmin management
{
  path: 'admin/town-images',
  loadComponent: () => import('./features/admin/town-images/town-images-management.component'),
  canActivate: [authGuard, roleGuard],
  data: { roles: ['SuperAdmin'] }
}
```

---

## PHASE 4: Apply Nubian Theme Globally

Ensure all components use Nubian theme from `_nubian-variables.scss`:

| Color | Value | Usage |
|-------|-------|-------|
| Nubian Gold | #C17E3E | Primary buttons, accents |
| Nubian Teal | #187573 | Headers, links, primary actions |
| Nubian Cream | #FFF9F5 | Page backgrounds |
| Nubian Beige | #F4E4D7 | Card backgrounds, borders |
| Nubian Charcoal | #2D2D2D | Text |
| Nubian Green | #2D7A3E | Success states |

---

## API Endpoint Summary

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/api/town-images/landing` | No | Public | All active images |
| GET | `/api/town-images/town/{townId}` | No | Public | Town-specific images |
| GET | `/api/town-images/available` | Yes | All | User's available town images |
| GET | `/api/town-images` | Yes | SuperAdmin | All images with filters |
| GET | `/api/town-images/{id}` | Yes | SuperAdmin | Single image |
| POST | `/api/town-images` | Yes | SuperAdmin | Create image |
| PUT | `/api/town-images/{id}` | Yes | SuperAdmin | Update image |
| DELETE | `/api/town-images/{id}` | Yes | SuperAdmin | Delete image |
| PUT | `/api/town-images/town/{townId}/reorder` | Yes | SuperAdmin | Reorder |
| PATCH | `/api/town-images/{id}/toggle-active` | Yes | SuperAdmin | Toggle active |
