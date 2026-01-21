using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository interface for TownImage operations.
/// Provides specialized queries for carousel image functionality.
/// </summary>
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
