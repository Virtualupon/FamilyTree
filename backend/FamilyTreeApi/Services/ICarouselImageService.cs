using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

public interface ICarouselImageService
{
    /// <summary>
    /// Get all carousel images (for admin management)
    /// </summary>
    Task<List<CarouselImageDto>> GetAllAsync();

    /// <summary>
    /// Get only active carousel images ordered by display order (for public display)
    /// </summary>
    Task<List<PublicCarouselImageDto>> GetActiveImagesAsync();

    /// <summary>
    /// Get a single carousel image by ID
    /// </summary>
    Task<CarouselImageDto?> GetByIdAsync(Guid id);

    /// <summary>
    /// Create a new carousel image
    /// </summary>
    Task<CarouselImageDto> CreateAsync(CreateCarouselImageRequest request, long userId);

    /// <summary>
    /// Update an existing carousel image
    /// </summary>
    Task<CarouselImageDto?> UpdateAsync(Guid id, UpdateCarouselImageRequest request);

    /// <summary>
    /// Delete a carousel image
    /// </summary>
    Task<bool> DeleteAsync(Guid id);

    /// <summary>
    /// Reorder carousel images
    /// </summary>
    Task<bool> ReorderAsync(ReorderCarouselImagesRequest request);

    /// <summary>
    /// Toggle active status of a carousel image
    /// </summary>
    Task<CarouselImageDto?> ToggleActiveAsync(Guid id);
}
