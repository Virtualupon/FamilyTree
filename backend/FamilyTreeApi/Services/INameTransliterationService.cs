using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service for transliterating names between Arabic, English, and Nobiin scripts.
/// Uses Claude AI for intelligent transliteration with database caching.
/// </summary>
public interface INameTransliterationService
{
    /// <summary>
    /// Transliterate a single name across all supported scripts
    /// </summary>
    /// <param name="request">Transliteration request with input name and options</param>
    /// <returns>Transliteration result with all language variants</returns>
    Task<TransliterationResult> TransliterateNameAsync(TransliterationRequest request);

    /// <summary>
    /// Transliterate multiple names (for GED import or batch processing)
    /// </summary>
    /// <param name="requests">List of transliteration requests</param>
    /// <param name="progress">Optional progress reporter</param>
    /// <returns>Batch result with all transliterations</returns>
    Task<BatchTransliterationResult> TransliterateBatchAsync(
        List<TransliterationRequest> requests,
        IProgress<int>? progress = null);

    /// <summary>
    /// Verify and optionally correct a name mapping
    /// </summary>
    /// <param name="request">Verification request with optional corrections</param>
    /// <param name="userId">ID of the user performing verification</param>
    /// <returns>Verification result</returns>
    Task<VerifyMappingResult> VerifyMappingAsync(VerifyMappingRequest request, long userId);

    /// <summary>
    /// Get all name mappings that need review
    /// </summary>
    /// <param name="orgId">Optional organization filter</param>
    /// <returns>List of mappings needing review</returns>
    Task<List<NameMappingDto>> GetMappingsNeedingReviewAsync(Guid? orgId = null);

    /// <summary>
    /// Search for existing name mappings
    /// </summary>
    /// <param name="searchTerm">Search term (searches all scripts)</param>
    /// <param name="limit">Maximum results to return</param>
    /// <returns>Matching name mappings</returns>
    Task<List<NameMappingDto>> SearchMappingsAsync(string searchTerm, int limit = 20);

    /// <summary>
    /// Get a specific name mapping by ID
    /// </summary>
    /// <param name="id">Mapping ID</param>
    /// <returns>Name mapping or null if not found</returns>
    Task<NameMappingDto?> GetMappingByIdAsync(int id);
}
