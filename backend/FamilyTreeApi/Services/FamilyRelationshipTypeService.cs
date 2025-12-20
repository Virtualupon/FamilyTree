using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service implementation for family relationship type operations.
/// Uses in-memory caching since this is static reference data.
/// </summary>
public class FamilyRelationshipTypeService : IFamilyRelationshipTypeService
{
    private readonly ApplicationDbContext _context;
    private readonly IMemoryCache _cache;
    private readonly ILogger<FamilyRelationshipTypeService> _logger;

    private const string CacheKey = "FamilyRelationshipTypes";
    private const string GroupedCacheKey = "FamilyRelationshipTypesGrouped";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(24);

    public FamilyRelationshipTypeService(
        ApplicationDbContext context,
        IMemoryCache cache,
        ILogger<FamilyRelationshipTypeService> logger)
    {
        _context = context;
        _cache = cache;
        _logger = logger;
    }

    public async Task<IEnumerable<FamilyRelationshipTypeDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        // Try to get from cache first
        if (_cache.TryGetValue(CacheKey, out IEnumerable<FamilyRelationshipTypeDto>? cached) && cached != null)
        {
            return cached;
        }

        try
        {
            var types = await _context.FamilyRelationshipTypes
                .AsNoTracking()
                .Where(t => t.IsActive)
                .OrderBy(t => t.SortOrder)
                .Select(t => new FamilyRelationshipTypeDto(
                    t.Id,
                    t.NameArabic,
                    t.NameEnglish,
                    t.NameNubian,
                    t.Category,
                    t.SortOrder
                ))
                .ToListAsync(cancellationToken);

            // Cache the result
            _cache.Set(CacheKey, types, CacheDuration);

            _logger.LogDebug("Loaded {Count} family relationship types from database", types.Count);

            return types;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading family relationship types");
            throw;
        }
    }

    public async Task<IEnumerable<FamilyRelationshipTypeGroupedDto>> GetAllGroupedAsync(CancellationToken cancellationToken = default)
    {
        // Try to get from cache first
        if (_cache.TryGetValue(GroupedCacheKey, out IEnumerable<FamilyRelationshipTypeGroupedDto>? cached) && cached != null)
        {
            return cached;
        }

        try
        {
            var allTypes = await GetAllAsync(cancellationToken);

            var grouped = allTypes
                .GroupBy(t => t.Category ?? "Other")
                .OrderBy(g => g.Min(t => t.SortOrder))
                .Select(g => new FamilyRelationshipTypeGroupedDto(
                    g.Key,
                    g.ToList()
                ))
                .ToList();

            // Cache the result
            _cache.Set(GroupedCacheKey, grouped, CacheDuration);

            return grouped;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading grouped family relationship types");
            throw;
        }
    }

    public async Task<FamilyRelationshipTypeDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        try
        {
            // Try to get from cached list first
            var allTypes = await GetAllAsync(cancellationToken);
            return allTypes.FirstOrDefault(t => t.Id == id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family relationship type {Id}", id);
            throw;
        }
    }
}
