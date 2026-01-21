# Implementation Prompt: Town Images Feature with Carousel & SuperAdmin CRUD

## Overview

Implement a town-based image system where:
1. Each **Town** has multiple images stored in the database
2. **SuperAdmin** can Create, Read, Update, Delete (CRUD) town images
3. **Landing Page** displays a carousel of images from ALL towns
4. **Town Selection Page** displays a carousel of images from user's available towns only
5. **Nubian theme** is applied consistently throughout the application

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

### 2.5 Register Services

Add to `Program.cs`:

```csharp
builder.Services.AddScoped<ITownImageRepository, TownImageRepository>();
```

---

## PHASE 3: Frontend Implementation

### 3.1 Models

**File:** `frontend/src/app/core/models/town-image.models.ts`

```typescript
export interface TownImageDto {
  id: string;
  townId: string;
  townName: string;
  imageUrl: string;
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

export interface CreateTownImageRequest {
  townId: string;
  imageUrl: string;
  title?: string;
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateTownImageRequest {
  imageUrl?: string;
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

### 3.2 Service

**File:** `frontend/src/app/core/services/town-image.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TownImageDto,
  CarouselImageDto,
  CreateTownImageRequest,
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

  // ========================================
  // AUTHENTICATED ENDPOINTS
  // ========================================

  /** Get images for user's available towns (town selection) */
  getAvailableTownImages(): Observable<CarouselImageDto[]> {
    return this.http.get<CarouselImageDto[]>(`${this.apiUrl}/available`);
  }

  // ========================================
  // SUPERADMIN CRUD ENDPOINTS
  // ========================================

  /** Get all images (SuperAdmin) */
  getAllImages(townId?: string, includeInactive = true): Observable<TownImageDto[]> {
    let url = this.apiUrl;
    const params: string[] = [];
    if (townId) params.push(`townId=${townId}`);
    if (includeInactive) params.push(`includeInactive=true`);
    if (params.length) url += `?${params.join('&')}`;
    return this.http.get<TownImageDto[]>(url);
  }

  /** Get single image by ID (SuperAdmin) */
  getImageById(id: string): Observable<TownImageDto> {
    return this.http.get<TownImageDto>(`${this.apiUrl}/${id}`);
  }

  /** Create new image (SuperAdmin) */
  createImage(request: CreateTownImageRequest): Observable<TownImageDto> {
    return this.http.post<TownImageDto>(this.apiUrl, request);
  }

  /** Update image (SuperAdmin) */
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
      // Fallback to empty array - carousel will be hidden
    }
  });
}

// Update template to use imageUrl property
// [style.background-image]="'url(' + img.imageUrl + ')'"
```

### 3.4 Create Landing Page Component

**File:** `frontend/src/app/features/landing/landing.component.ts`

Create a new public landing page with:
- Carousel of ALL town images from API
- Login/Register buttons
- Nubian theme styling
- Feature highlights

### 3.5 Create SuperAdmin Image Management

**File:** `frontend/src/app/features/admin/town-images/town-images-management.component.ts`

Create management UI with:
- Table/grid of all images
- Filter by town dropdown
- Add/Edit image dialog
- Delete confirmation
- Drag-drop reordering
- Toggle active status
- Image preview

### 3.6 Add Routes

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
