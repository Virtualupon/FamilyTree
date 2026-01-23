using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.DTOs;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Utilities;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service for managing town images with storage operations.
/// Uses the same Base64 upload pattern as MediaService.
/// </summary>
public class TownImageService : ITownImageService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<TownImageService> _logger;
    private readonly IDistributedCache _cache;
    private readonly StorageConfiguration _storageConfig;
    private readonly VirtualUpon.Storage.Factories.IStorageService _storageService;
    private readonly int _currentStorageType;

    // Image validation constants
    private const long MaxFileSize = 2 * 1024 * 1024; // 2MB
    private static readonly string[] AllowedMimeTypes = { "image/webp", "image/jpeg", "image/png" };

    public TownImageService(
        ApplicationDbContext context,
        ILogger<TownImageService> logger,
        StorageConfiguration storageConfig,
        IDistributedCache cache,
        VirtualUpon.Storage.Factories.IStorageService storageService)
    {
        _context = context;
        _logger = logger;
        _cache = cache;
        _storageConfig = storageConfig;
        _storageService = storageService;
        _currentStorageType = VirtualUpon.Storage.Utilities.StorageTypeHelper.ConvertStorageTypeToInt(storageConfig.StorageType);
    }

    public async Task<TownImage> UploadImageAsync(
        Guid townId,
        string base64Data,
        string fileName,
        string? mimeType = null,
        string? title = null,
        string? titleNb = null,   // Nobiin
        string? titleAr = null,
        string? titleEn = null,
        string? description = null,
        string? descriptionNb = null,  // Nobiin
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

            // Validate file size
            if (imageBytes.Length > MaxFileSize)
                throw new ArgumentException("Image file size must be under 2MB");

            // Determine MIME type from filename if not provided
            if (string.IsNullOrEmpty(mimeType))
                mimeType = GetMimeTypeFromExtension(fileName);

            // Validate MIME type (images only)
            if (!AllowedMimeTypes.Contains(mimeType.ToLower()))
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
                StorageKey = $"{string.Join("/", pathSegments)}/{uniqueFileName}",
                FileName = fileName,
                MimeType = mimeType,
                FileSize = imageBytes.Length,
                StorageType = _currentStorageType,
                Title = title,
                TitleNb = titleNb,
                TitleAr = titleAr,
                TitleEn = titleEn,
                Description = description,
                DescriptionNb = descriptionNb,
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

            if (!response.IsSuccessful || response.FileData == null)
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

            if (!response.IsSuccessful || response.FileData == null)
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
                    var deleteResult = await storageService.DeleteFileAsync(image.ImageUrl);
                    if (!deleteResult.IsSuccessful)
                    {
                        _logger.LogWarning("Failed to delete town image file from storage: {Error}", deleteResult.ErrorMessage);
                    }
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

    public async Task<IEnumerable<TownImage>> GetAllImagesAsync(Guid? townId = null, bool includeInactive = true)
    {
        var query = _context.TownImages.Include(i => i.Town).AsQueryable();

        if (townId.HasValue)
        {
            query = query.Where(i => i.TownId == townId.Value);
        }

        if (!includeInactive)
        {
            query = query.Where(i => i.IsActive);
        }

        return await query
            .OrderBy(i => i.Town.Name)
            .ThenBy(i => i.DisplayOrder)
            .ToListAsync();
    }

    public async Task<TownImage?> GetImageByIdAsync(Guid imageId)
    {
        return await _context.TownImages
            .Include(i => i.Town)
            .FirstOrDefaultAsync(i => i.Id == imageId);
    }

    public async Task<IEnumerable<TownImage>> GetImagesByTownIdsAsync(IEnumerable<Guid> townIds)
    {
        return await _context.TownImages
            .Include(i => i.Town)
            .Where(i => townIds.Contains(i.TownId) && i.IsActive)
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
        if (request.TitleNb != null) image.TitleNb = request.TitleNb;
        if (request.TitleAr != null) image.TitleAr = request.TitleAr;
        if (request.TitleEn != null) image.TitleEn = request.TitleEn;
        if (request.Description != null) image.Description = request.Description;
        if (request.DescriptionNb != null) image.DescriptionNb = request.DescriptionNb;
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

    public async Task<VirtualUpon.Storage.Dto.SignedUrlResponseDto> GetSignedUrlAsync(Guid imageId, int expiresInSeconds = 3600)
    {
        var image = await _context.TownImages
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == imageId);

        if (image == null || string.IsNullOrEmpty(image.ImageUrl))
        {
            return new VirtualUpon.Storage.Dto.SignedUrlResponseDto
            {
                IsSuccessful = false,
                ErrorMessage = "Town image not found"
            };
        }

        var storageService = GetStorageServiceByType(image.StorageType);
        return await storageService.GetSignedUrlAsync(image.ImageUrl, expiresInSeconds);
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
