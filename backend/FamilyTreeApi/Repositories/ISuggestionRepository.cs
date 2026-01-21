using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository interface for RelationshipSuggestion operations
/// </summary>
public interface ISuggestionRepository : IRepository<RelationshipSuggestion>
{
    /// <summary>
    /// Get suggestion with all related data (evidence, comments, target entities)
    /// </summary>
    Task<RelationshipSuggestion?> GetWithDetailsAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get paginated list of suggestions with filters
    /// </summary>
    Task<(List<RelationshipSuggestion> Items, int TotalCount)> GetPagedAsync(
        SuggestionQueryParams queryParams,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get pending suggestions count grouped by town
    /// </summary>
    Task<List<PendingByTownDto>> GetPendingCountByTownAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Get statistics for suggestions within scope
    /// </summary>
    Task<SuggestionStatsDto> GetStatisticsAsync(
        Guid? townId = null,
        Guid? treeId = null,
        long? userId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Check for duplicate pending suggestion
    /// </summary>
    Task<DuplicateCheckResponse> CheckDuplicateAsync(
        Guid treeId,
        SuggestionType type,
        Guid? targetPersonId,
        Guid? secondaryPersonId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get suggestions by submitter
    /// </summary>
    Task<List<RelationshipSuggestion>> GetBySubmitterAsync(
        long userId,
        SuggestionStatus? status = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get suggestions for a specific person (where they are target or secondary)
    /// </summary>
    Task<List<RelationshipSuggestion>> GetForPersonAsync(
        Guid personId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Soft delete a suggestion
    /// </summary>
    Task SoftDeleteAsync(Guid id, long deletedByUserId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Repository interface for SuggestionEvidence operations
/// </summary>
public interface ISuggestionEvidenceRepository : IRepository<SuggestionEvidence>
{
    /// <summary>
    /// Get all evidence for a suggestion
    /// </summary>
    Task<List<SuggestionEvidence>> GetBySuggestionAsync(Guid suggestionId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reorder evidence items
    /// </summary>
    Task ReorderAsync(Guid suggestionId, List<Guid> orderedIds, CancellationToken cancellationToken = default);
}

/// <summary>
/// Repository interface for SuggestionComment operations
/// </summary>
public interface ISuggestionCommentRepository : IRepository<SuggestionComment>
{
    /// <summary>
    /// Get all comments for a suggestion, ordered by creation date
    /// </summary>
    Task<List<SuggestionComment>> GetBySuggestionAsync(Guid suggestionId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get latest comment for a suggestion
    /// </summary>
    Task<SuggestionComment?> GetLatestAsync(Guid suggestionId, CancellationToken cancellationToken = default);
}
