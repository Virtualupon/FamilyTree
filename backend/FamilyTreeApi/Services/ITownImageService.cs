using FamilyTreeApi.Models;
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service for managing town images with storage operations.
/// Uses the same Base64 upload pattern as MediaService.
/// </summary>
public interface ITownImageService
{
    /// <summary>
    /// Upload a new town image using Base64 encoded data.
    /// </summary>
    Task<TownImage> UploadImageAsync(
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
        long createdBy = 0);

    /// <summary>
    /// Get image as Base64 for frontend display.
    /// </summary>
    Task<string?> GetImageAsBase64Async(Guid imageId);

    /// <summary>
    /// Get image as bytes for direct file download.
    /// </summary>
    Task<(byte[] data, string mimeType)?> GetImageBytesAsync(Guid imageId);

    /// <summary>
    /// Delete image (removes from storage + database).
    /// </summary>
    Task<bool> DeleteImageAsync(Guid imageId);

    /// <summary>
    /// Get all images for a town.
    /// </summary>
    Task<IEnumerable<TownImage>> GetTownImagesAsync(Guid townId, bool includeInactive = false);

    /// <summary>
    /// Get all active images (for landing page).
    /// </summary>
    Task<IEnumerable<TownImage>> GetAllActiveImagesAsync();

    /// <summary>
    /// Get all images with optional filters (for admin).
    /// </summary>
    Task<IEnumerable<TownImage>> GetAllImagesAsync(Guid? townId = null, bool includeInactive = true);

    /// <summary>
    /// Get image by ID.
    /// </summary>
    Task<TownImage?> GetImageByIdAsync(Guid imageId);

    /// <summary>
    /// Get images by multiple town IDs.
    /// </summary>
    Task<IEnumerable<TownImage>> GetImagesByTownIdsAsync(IEnumerable<Guid> townIds);

    /// <summary>
    /// Update image metadata (not the file itself).
    /// </summary>
    Task<TownImage?> UpdateImageMetadataAsync(Guid imageId, UpdateTownImageRequest request, long updatedBy);

    /// <summary>
    /// Reorder images for a town.
    /// </summary>
    Task<bool> ReorderImagesAsync(Guid townId, List<ImageOrderItem> newOrder);

    /// <summary>
    /// Toggle active status.
    /// </summary>
    Task<TownImage?> ToggleActiveAsync(Guid imageId, long updatedBy);
}
