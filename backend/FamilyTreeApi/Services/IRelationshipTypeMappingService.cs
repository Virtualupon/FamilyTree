namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for mapping i18n keys to database relationship type IDs.
/// Provides dynamic mapping from DB instead of hardcoded values.
/// </summary>
public interface IRelationshipTypeMappingService
{
    /// <summary>
    /// Initialize the mapping by loading from database.
    /// Should be called at application startup.
    /// </summary>
    Task InitializeAsync();

    /// <summary>
    /// Get the database type ID for an i18n key (e.g., "relationship.father" -> 1)
    /// </summary>
    /// <param name="i18nKey">The i18n key (e.g., "relationship.father")</param>
    /// <returns>The database ID or null if not found</returns>
    int? GetTypeIdByKey(string i18nKey);

    /// <summary>
    /// Get the database type ID by English name (e.g., "Father" -> 1)
    /// </summary>
    /// <param name="englishName">The English name of the relationship</param>
    /// <returns>The database ID or null if not found</returns>
    int? GetTypeIdByEnglishName(string englishName);

    /// <summary>
    /// Get a hash of all relationship types for frontend cache invalidation.
    /// When this changes, frontend should refresh its cached data.
    /// </summary>
    /// <returns>A version hash string</returns>
    string GetCacheVersion();

    /// <summary>
    /// Check if the mapping has been initialized
    /// </summary>
    bool IsInitialized { get; }
}
