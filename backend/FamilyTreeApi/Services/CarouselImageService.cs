using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Services;

public class CarouselImageService : ICarouselImageService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CarouselImageService> _logger;

    public CarouselImageService(
        ApplicationDbContext context,
        ILogger<CarouselImageService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<CarouselImageDto>> GetAllAsync()
    {
        return await _context.CarouselImages
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.CreatedAt)
            .Select(c => MapToDto(c))
            .ToListAsync();
    }

    public async Task<List<PublicCarouselImageDto>> GetActiveImagesAsync()
    {
        return await _context.CarouselImages
            .Where(c => c.IsActive)
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.CreatedAt)
            .Select(c => new PublicCarouselImageDto(
                c.ImageUrl,
                c.Title,
                c.Description
            ))
            .ToListAsync();
    }

    public async Task<CarouselImageDto?> GetByIdAsync(Guid id)
    {
        var image = await _context.CarouselImages.FindAsync(id);
        return image != null ? MapToDto(image) : null;
    }

    public async Task<CarouselImageDto> CreateAsync(CreateCarouselImageRequest request, long userId)
    {
        // Get the next display order if not specified
        var maxOrder = await _context.CarouselImages
            .MaxAsync(c => (int?)c.DisplayOrder) ?? -1;

        var image = new CarouselImage
        {
            ImageUrl = request.ImageUrl,
            Title = request.Title,
            Description = request.Description,
            DisplayOrder = request.DisplayOrder > 0 ? request.DisplayOrder : maxOrder + 1,
            IsActive = request.IsActive,
            StorageType = 1, // External URL
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.CarouselImages.Add(image);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created carousel image {ImageId} by user {UserId}", image.Id, userId);

        return MapToDto(image);
    }

    public async Task<CarouselImageDto?> UpdateAsync(Guid id, UpdateCarouselImageRequest request)
    {
        var image = await _context.CarouselImages.FindAsync(id);
        if (image == null)
        {
            return null;
        }

        if (request.ImageUrl != null)
            image.ImageUrl = request.ImageUrl;
        if (request.Title != null)
            image.Title = request.Title;
        if (request.Description != null)
            image.Description = request.Description;
        if (request.DisplayOrder.HasValue)
            image.DisplayOrder = request.DisplayOrder.Value;
        if (request.IsActive.HasValue)
            image.IsActive = request.IsActive.Value;

        image.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated carousel image {ImageId}", id);

        return MapToDto(image);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var image = await _context.CarouselImages.FindAsync(id);
        if (image == null)
        {
            return false;
        }

        _context.CarouselImages.Remove(image);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted carousel image {ImageId}", id);

        return true;
    }

    public async Task<bool> ReorderAsync(ReorderCarouselImagesRequest request)
    {
        var images = await _context.CarouselImages
            .Where(c => request.ImageIds.Contains(c.Id))
            .ToListAsync();

        if (images.Count != request.ImageIds.Count)
        {
            return false;
        }

        for (int i = 0; i < request.ImageIds.Count; i++)
        {
            var image = images.First(c => c.Id == request.ImageIds[i]);
            image.DisplayOrder = i;
            image.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Reordered {Count} carousel images", request.ImageIds.Count);

        return true;
    }

    public async Task<CarouselImageDto?> ToggleActiveAsync(Guid id)
    {
        var image = await _context.CarouselImages.FindAsync(id);
        if (image == null)
        {
            return null;
        }

        image.IsActive = !image.IsActive;
        image.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Toggled carousel image {ImageId} active status to {IsActive}", id, image.IsActive);

        return MapToDto(image);
    }

    private static CarouselImageDto MapToDto(CarouselImage image)
    {
        return new CarouselImageDto(
            image.Id,
            image.ImageUrl,
            image.Title,
            image.Description,
            image.DisplayOrder,
            image.IsActive,
            image.StorageType,
            image.FileName,
            image.FileSize,
            image.CreatedAt,
            image.UpdatedAt
        );
    }
}
