namespace FamilyTreeApi.Services.Caching;

/// <summary>
/// Builds standardized cache keys with security constraints.
/// All keys include OrgId to prevent cross-tenant data leakage.
/// GUIDs are normalized to lowercase without dashes for consistency.
/// </summary>
public static class CacheKeyBuilder
{
    // SECURITY: Maximum allowed generations to prevent cache key explosion
    private const int MaxGenerations = 10;
    private const int MinGenerations = 1;

    /// <summary>
    /// Normalize GUID to consistent format: lowercase, no dashes.
    /// Prevents cache misses due to different GUID string representations.
    /// </summary>
    private static string NormalizeGuid(Guid id) => id.ToString("N").ToLowerInvariant();

    /// <summary>
    /// Clamp generations to valid range.
    /// </summary>
    private static int ClampGenerations(int generations)
        => Math.Clamp(generations, MinGenerations, MaxGenerations);

    // =========================================================================
    // TREE VIEW KEYS - All include OrgId for multi-tenancy
    // =========================================================================

    public static string Pedigree(Guid personId, int generations, Guid orgId)
        => $"pedigree:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}:{ClampGenerations(generations)}";

    public static string Descendants(Guid personId, int generations, Guid orgId)
        => $"descendants:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}:{ClampGenerations(generations)}";

    public static string Hourglass(Guid personId, int ancestorGen, int descendantGen, Guid orgId)
        => $"hourglass:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}:{ClampGenerations(ancestorGen)}:{ClampGenerations(descendantGen)}";

    public static string FamilyGroup(Guid personId, Guid orgId)
        => $"family:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}";

    /// <summary>
    /// Relationship path key with normalized pair ordering.
    /// Smaller GUID comes first to ensure A->B and B->A use same cache entry.
    /// </summary>
    public static string RelationshipPath(Guid person1Id, Guid person2Id, Guid orgId)
    {
        var p1 = NormalizeGuid(person1Id);
        var p2 = NormalizeGuid(person2Id);
        var (first, second) = string.CompareOrdinal(p1, p2) < 0 ? (p1, p2) : (p2, p1);
        return $"relationship:{NormalizeGuid(orgId)}:{first}:{second}";
    }

    // =========================================================================
    // REFERENCE DATA KEYS - Global, not tenant-specific
    // =========================================================================

    public static string RelationshipTypes() => "ref:relationship-types";
    public static string RelationshipTypesGrouped() => "ref:relationship-types:grouped";
    public static string Countries() => "ref:countries";
    public static string CountryByCode(string code) => $"ref:country:{code.ToUpperInvariant()}";

    // =========================================================================
    // INVALIDATION PATTERNS - For Redis SCAN operations
    // =========================================================================

    /// <summary>
    /// Pattern to match all cache keys for a specific organization.
    /// Use with Redis SCAN for bulk invalidation.
    /// </summary>
    public static string OrgPattern(Guid orgId) => $"*:{NormalizeGuid(orgId)}:*";

    /// <summary>
    /// Get all possible generation variants for a person's tree views.
    /// Used for complete invalidation without pattern matching.
    /// </summary>
    public static IEnumerable<string> AllPedigreeVariants(Guid personId, Guid orgId)
    {
        for (int gen = MinGenerations; gen <= MaxGenerations; gen++)
            yield return Pedigree(personId, gen, orgId);
    }

    public static IEnumerable<string> AllDescendantsVariants(Guid personId, Guid orgId)
    {
        for (int gen = MinGenerations; gen <= MaxGenerations; gen++)
            yield return Descendants(personId, gen, orgId);
    }

    public static IEnumerable<string> AllHourglassVariants(Guid personId, Guid orgId)
    {
        for (int aGen = MinGenerations; aGen <= MaxGenerations; aGen++)
            for (int dGen = MinGenerations; dGen <= MaxGenerations; dGen++)
                yield return Hourglass(personId, aGen, dGen, orgId);
    }
}
