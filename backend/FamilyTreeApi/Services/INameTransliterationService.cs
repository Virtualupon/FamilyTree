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
    Task<FamilyTreeApi.DTOs.TransliterationResult> TransliterateNameAsync(FamilyTreeApi.DTOs.TransliterationRequest request);

    /// <summary>
    /// Transliterate multiple names (for GED import or batch processing)
    /// </summary>
    /// <param name="requests">List of transliteration requests</param>
    /// <param name="progress">Optional progress reporter</param>
    /// <returns>Batch result with all transliterations</returns>
    Task<FamilyTreeApi.DTOs.BatchTransliterationResult> TransliterateBatchAsync(
        List<FamilyTreeApi.DTOs.TransliterationRequest> requests,
        IProgress<int>? progress = null);

    /// <summary>
    /// Verify and optionally correct a name mapping
    /// </summary>
    /// <param name="request">Verification request with optional corrections</param>
    /// <param name="userId">ID of the user performing verification</param>
    /// <returns>Verification result</returns>
    Task<FamilyTreeApi.DTOs.VerifyMappingResult> VerifyMappingAsync(FamilyTreeApi.DTOs.VerifyMappingRequest request, long userId);

    /// <summary>
    /// Get all name mappings that need review
    /// </summary>
    /// <param name="orgId">Optional organization filter</param>
    /// <returns>List of mappings needing review</returns>
    Task<List<FamilyTreeApi.DTOs.NameMappingDto>> GetMappingsNeedingReviewAsync(Guid? orgId = null);

    /// <summary>
    /// Search for existing name mappings
    /// </summary>
    /// <param name="searchTerm">Search term (searches all scripts)</param>
    /// <param name="limit">Maximum results to return</param>
    /// <returns>Matching name mappings</returns>
    Task<List<FamilyTreeApi.DTOs.NameMappingDto>> SearchMappingsAsync(string searchTerm, int limit = 20);

    /// <summary>
    /// Get a specific name mapping by ID
    /// </summary>
    /// <param name="id">Mapping ID</param>
    /// <returns>Name mapping or null if not found</returns>
    Task<FamilyTreeApi.DTOs.NameMappingDto?> GetMappingByIdAsync(int id);

    /// <summary>
    /// Generate missing language variants for a specific person's names.
    /// Creates Arabic, English, and Nobiin names based on existing names.
    /// </summary>
    /// <param name="personId">Person ID</param>
    /// <param name="orgId">Optional organization filter for access control</param>
    /// <returns>Result with generated names</returns>
    Task<FamilyTreeApi.DTOs.PersonTransliterationResult> GenerateMissingNamesForPersonAsync(Guid personId, Guid? orgId = null);

    /// <summary>
    /// Preview what translations would be generated for a person without saving.
    /// </summary>
    /// <param name="personId">Person ID</param>
    /// <param name="orgId">Optional organization filter for access control</param>
    /// <returns>Preview of translations that would be generated</returns>
    Task<FamilyTreeApi.DTOs.TransliterationPreviewResult> PreviewTransliterationsForPersonAsync(Guid personId, Guid? orgId = null);

    /// <summary>
    /// Generate missing language variants for all persons in an organization.
    /// </summary>
    /// <param name="request">Bulk generation options</param>
    /// <returns>Result with generation statistics</returns>
    Task<FamilyTreeApi.DTOs.BulkTransliterationResult> BulkGenerateMissingNamesAsync(FamilyTreeApi.DTOs.BulkTransliterationRequest request);
}
