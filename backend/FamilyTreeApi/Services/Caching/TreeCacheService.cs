using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services.Caching;

/// <summary>
/// Tree-specific caching service.
/// Uses ResilientCacheService for circuit breaker and error handling.
/// All operations include OrgId for multi-tenant security.
/// </summary>
public class TreeCacheService : ITreeCacheService
{
    private readonly IResilientCacheService _cache;
    private readonly ILogger<TreeCacheService> _logger;

    public TreeCacheService(
        IResilientCacheService cache,
        ILogger<TreeCacheService> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    // =========================================================================
    // GET METHODS
    // =========================================================================

    public Task<TreePersonNode?> GetPedigreeAsync(
        Guid personId, int generations, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<TreePersonNode>(
            CacheKeyBuilder.Pedigree(personId, generations, orgId), ct);

    public Task<TreePersonNode?> GetDescendantsAsync(
        Guid personId, int generations, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<TreePersonNode>(
            CacheKeyBuilder.Descendants(personId, generations, orgId), ct);

    public Task<TreePersonNode?> GetHourglassAsync(
        Guid personId, int ancestorGen, int descendantGen, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<TreePersonNode>(
            CacheKeyBuilder.Hourglass(personId, ancestorGen, descendantGen, orgId), ct);

    public Task<RelationshipPathResponse?> GetRelationshipPathAsync(
        Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<RelationshipPathResponse>(
            CacheKeyBuilder.RelationshipPath(person1Id, person2Id, orgId), ct);

    // =========================================================================
    // SET METHODS
    // =========================================================================

    public Task SetPedigreeAsync(
        Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.Pedigree(personId, generations, orgId),
            data,
            CacheLifeTime.VeryLong, // 24 hours
            ct);

    public Task SetDescendantsAsync(
        Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.Descendants(personId, generations, orgId),
            data,
            CacheLifeTime.Long, // 6 hours
            ct);

    public Task SetHourglassAsync(
        Guid personId, int ancestorGen, int descendantGen, Guid orgId, TreePersonNode data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.Hourglass(personId, ancestorGen, descendantGen, orgId),
            data,
            CacheLifeTime.Long, // 6 hours
            ct);

    public Task SetRelationshipPathAsync(
        Guid person1Id, Guid person2Id, Guid orgId, RelationshipPathResponse data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.RelationshipPath(person1Id, person2Id, orgId),
            data,
            CacheLifeTime.Long, // 6 hours
            ct);

    // =========================================================================
    // INVALIDATION METHODS - Complete invalidation for all generation variants
    // =========================================================================

    /// <summary>
    /// Invalidate ALL cache entries for a person across all generation variants.
    /// CRITICAL: Must invalidate all possible cached combinations to prevent stale data.
    /// </summary>
    public async Task InvalidatePersonAsync(Guid personId, Guid orgId, CancellationToken ct = default)
    {
        _logger.LogInformation("Invalidating all cache entries for person {PersonId} in org {OrgId}",
            personId, orgId);

        // Collect all keys to invalidate
        var keysToInvalidate = new List<string>();

        // All pedigree variants (generations 1-10)
        keysToInvalidate.AddRange(CacheKeyBuilder.AllPedigreeVariants(personId, orgId));

        // All descendants variants (generations 1-10)
        keysToInvalidate.AddRange(CacheKeyBuilder.AllDescendantsVariants(personId, orgId));

        // All hourglass variants (10x10 = 100 combinations)
        keysToInvalidate.AddRange(CacheKeyBuilder.AllHourglassVariants(personId, orgId));

        // Family group
        keysToInvalidate.Add(CacheKeyBuilder.FamilyGroup(personId, orgId));

        _logger.LogDebug("Invalidating {Count} cache keys for person {PersonId}",
            keysToInvalidate.Count, personId);

        // Remove all keys in parallel
        await _cache.RemoveMultipleAsync(keysToInvalidate, ct);
    }

    public Task InvalidateRelationshipPathAsync(
        Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default)
        => _cache.RemoveAsync(
            CacheKeyBuilder.RelationshipPath(person1Id, person2Id, orgId), ct);
}
