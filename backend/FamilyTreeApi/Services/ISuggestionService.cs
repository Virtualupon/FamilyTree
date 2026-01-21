using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for managing relationship suggestions in the governance model
/// </summary>
public interface ISuggestionService
{
    // ============================================================================
    // Viewer Operations (Submit, View Own, Withdraw)
    // ============================================================================

    /// <summary>
    /// Create a new relationship suggestion
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> CreateSuggestionAsync(
        CreateSuggestionRequest request,
        long submitterId,
        Guid townId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get suggestion details by ID
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> GetSuggestionAsync(
        Guid id,
        long requestingUserId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get suggestions submitted by a specific user
    /// </summary>
    Task<ServiceResult<SuggestionListResponse>> GetMySuggestionsAsync(
        long userId,
        SuggestionQueryParams queryParams,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Withdraw a pending suggestion (submitter only)
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> WithdrawSuggestionAsync(
        Guid id,
        long userId,
        WithdrawSuggestionRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Add evidence to a suggestion (only if pending and owned by user)
    /// </summary>
    Task<ServiceResult<EvidenceDto>> AddEvidenceAsync(
        Guid suggestionId,
        CreateEvidenceRequest request,
        long userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Add a comment to a suggestion
    /// </summary>
    Task<ServiceResult<CommentDto>> AddCommentAsync(
        Guid suggestionId,
        CreateCommentRequest request,
        long userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    // ============================================================================
    // Admin Operations (Review, Approve, Reject, Request Info)
    // ============================================================================

    /// <summary>
    /// Get paginated list of suggestions for admin queue
    /// </summary>
    Task<ServiceResult<SuggestionListResponse>> GetSuggestionQueueAsync(
        SuggestionQueryParams queryParams,
        Guid? adminTownId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Update suggestion status (admin action)
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> UpdateStatusAsync(
        Guid id,
        UpdateSuggestionStatusRequest request,
        long reviewerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Approve a suggestion and apply changes to the canonical tree
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> ApproveSuggestionAsync(
        Guid id,
        string? reviewerNotes,
        long reviewerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Reject a suggestion
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> RejectSuggestionAsync(
        Guid id,
        string reason,
        string? reviewerNotes,
        long reviewerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Request more information from submitter
    /// </summary>
    Task<ServiceResult<SuggestionDetailDto>> RequestMoreInfoAsync(
        Guid id,
        string reason,
        string? reviewerNotes,
        long reviewerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Rollback an approved suggestion (undo the applied changes)
    /// </summary>
    Task<ServiceResult> RollbackSuggestionAsync(
        Guid id,
        string reason,
        long reviewerId,
        CancellationToken cancellationToken = default);

    // ============================================================================
    // Statistics and Dashboard
    // ============================================================================

    /// <summary>
    /// Get pending suggestions count by town
    /// </summary>
    Task<ServiceResult<List<PendingByTownDto>>> GetPendingByTownAsync(
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get suggestion statistics for dashboard
    /// </summary>
    Task<ServiceResult<SuggestionStatsDto>> GetStatisticsAsync(
        Guid? townId = null,
        Guid? treeId = null,
        long? userId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Check for duplicate pending suggestions
    /// </summary>
    Task<ServiceResult<DuplicateCheckResponse>> CheckDuplicateAsync(
        Guid treeId,
        SuggestionType type,
        Guid? targetPersonId,
        Guid? secondaryPersonId = null,
        CancellationToken cancellationToken = default);

    // ============================================================================
    // Soft Delete
    // ============================================================================

    /// <summary>
    /// Soft delete a suggestion (admin only)
    /// </summary>
    Task<ServiceResult> DeleteSuggestionAsync(
        Guid id,
        long userId,
        CancellationToken cancellationToken = default);
}
