using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository implementation for TownImage operations.
/// </summary>
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
