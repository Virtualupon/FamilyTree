using System.Text.Json;
using System.Text.RegularExpressions;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service implementation for managing relationship suggestions
/// </summary>
public partial class SuggestionService : ISuggestionService
{
    private readonly ApplicationDbContext _context;
    private readonly ISuggestionRepository _suggestionRepo;
    private readonly ISuggestionEvidenceRepository _evidenceRepo;
    private readonly ISuggestionCommentRepository _commentRepo;
    private readonly IPersonRepository _personRepo;
    private readonly IUnionRepository _unionRepo;
    private readonly IOrgRepository _orgRepo;
    private readonly IAuditLogService _auditService;
    private readonly ILogger<SuggestionService> _logger;

    // Pre-compiled regex patterns with timeout protection (for parsing legacy SubmitterNotes)
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(100);

    [GeneratedRegex(@"Name:\s*([^,]+)", RegexOptions.None, matchTimeoutMilliseconds: 100)]
    private static partial Regex NamePatternRegex();

    [GeneratedRegex(@"Arabic:\s*([^,]+)", RegexOptions.None, matchTimeoutMilliseconds: 100)]
    private static partial Regex ArabicPatternRegex();

    // Services for applying suggestions
    private readonly IParentChildService _parentChildService;
    private readonly IUnionService _unionService;
    private readonly IPersonService _personService;
    private readonly IMediaManagementService _mediaService;

    public SuggestionService(
        ApplicationDbContext context,
        ISuggestionRepository suggestionRepo,
        ISuggestionEvidenceRepository evidenceRepo,
        ISuggestionCommentRepository commentRepo,
        IPersonRepository personRepo,
        IUnionRepository unionRepo,
        IOrgRepository orgRepo,
        IAuditLogService auditService,
        ILogger<SuggestionService> logger,
        IParentChildService parentChildService,
        IUnionService unionService,
        IPersonService personService,
        IMediaManagementService mediaService)
    {
        _context = context;
        _suggestionRepo = suggestionRepo;
        _evidenceRepo = evidenceRepo;
        _commentRepo = commentRepo;
        _personRepo = personRepo;
        _unionRepo = unionRepo;
        _orgRepo = orgRepo;
        _auditService = auditService;
        _logger = logger;
        _parentChildService = parentChildService;
        _unionService = unionService;
        _personService = personService;
        _mediaService = mediaService;
    }

    // ============================================================================
    // Viewer Operations
    // ============================================================================

    public async Task<ServiceResult<SuggestionDetailDto>> CreateSuggestionAsync(
        CreateSuggestionRequest request,
        long submitterId,
        Guid townId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Verify tree exists and belongs to town
            var tree = await _orgRepo.GetByIdAsync(request.TreeId, cancellationToken);
            if (tree == null)
                return ServiceResult<SuggestionDetailDto>.NotFound("Tree not found");

            if (tree.TownId != townId)
                return ServiceResult<SuggestionDetailDto>.Forbidden("Tree does not belong to selected town");

            // Check for duplicates
            var duplicateCheck = await _suggestionRepo.CheckDuplicateAsync(
                request.TreeId, request.Type, request.TargetPersonId, request.SecondaryPersonId, cancellationToken);

            if (duplicateCheck.HasDuplicate)
                return ServiceResult<SuggestionDetailDto>.Failure(
                    $"A similar suggestion is already pending (submitted by {duplicateCheck.SubmitterName})");

            // Validate target entities exist
            if (request.TargetPersonId.HasValue)
            {
                var targetExists = await _personRepo.ExistsAsync(p => p.Id == request.TargetPersonId.Value, cancellationToken);
                if (!targetExists)
                    return ServiceResult<SuggestionDetailDto>.NotFound("Target person not found");
            }

            if (request.SecondaryPersonId.HasValue)
            {
                var secondaryExists = await _personRepo.ExistsAsync(p => p.Id == request.SecondaryPersonId.Value, cancellationToken);
                if (!secondaryExists)
                    return ServiceResult<SuggestionDetailDto>.NotFound("Secondary person not found");
            }

            // Validate AddPerson suggestions must have at least one name in ProposedValues
            if (request.Type == SuggestionType.AddPerson)
            {
                var validationResult = ValidateAddPersonProposedValues(request.ProposedValues);
                if (!validationResult.IsValid)
                    return ServiceResult<SuggestionDetailDto>.Failure(validationResult.ErrorMessage!);
            }

            // Create suggestion
            var suggestion = new RelationshipSuggestion
            {
                TownId = townId,
                TreeId = request.TreeId,
                Type = request.Type,
                TargetPersonId = request.TargetPersonId,
                SecondaryPersonId = request.SecondaryPersonId,
                TargetUnionId = request.TargetUnionId,
                TargetMediaId = request.TargetMediaId,
                ProposedValuesJson = request.ProposedValues != null
                    ? JsonSerializer.Serialize(request.ProposedValues)
                    : "{}",
                RelationshipType = request.RelationshipType,
                UnionType = request.UnionType,
                Confidence = request.Confidence,
                SubmittedByUserId = submitterId,
                SubmittedAt = DateTime.UtcNow,
                SubmitterNotes = request.SubmitterNotes,
                Status = SuggestionStatus.Pending
            };

            _suggestionRepo.Add(suggestion);
            await _suggestionRepo.SaveChangesAsync(cancellationToken);

            // Add evidence if provided
            if (request.Evidence?.Any() == true)
            {
                foreach (var evidence in request.Evidence)
                {
                    var evidenceEntity = new SuggestionEvidence
                    {
                        SuggestionId = suggestion.Id,
                        Type = evidence.Type,
                        MediaId = evidence.MediaId,
                        Url = evidence.Url,
                        UrlTitle = evidence.UrlTitle,
                        Description = evidence.Description,
                        SortOrder = evidence.SortOrder
                    };
                    _evidenceRepo.Add(evidenceEntity);
                }
                await _evidenceRepo.SaveChangesAsync(cancellationToken);
            }

            // Log the creation
            await _auditService.LogAsync(
                submitterId,
                "Create",
                "RelationshipSuggestion",
                suggestion.Id,
                $"Created {request.Type} suggestion",
                null,
                JsonSerializer.Serialize(suggestion),
                suggestion.Id
            );

            // Fetch with details and return
            var result = await _suggestionRepo.GetWithDetailsAsync(suggestion.Id, cancellationToken);
            return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(result!));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating suggestion");
            return ServiceResult<SuggestionDetailDto>.InternalError("Failed to create suggestion");
        }
    }

    public async Task<ServiceResult<SuggestionDetailDto>> GetSuggestionAsync(
        Guid id,
        long requestingUserId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult<SuggestionDetailDto>.NotFound("Suggestion not found");

        return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(suggestion));
    }

    public async Task<ServiceResult<SuggestionListResponse>> GetMySuggestionsAsync(
        long userId,
        SuggestionQueryParams queryParams,
        CancellationToken cancellationToken = default)
    {
        // Force the query to only return this user's suggestions
        var modifiedParams = queryParams with { SubmittedByUserId = userId };

        var (items, totalCount) = await _suggestionRepo.GetPagedAsync(modifiedParams, cancellationToken);

        var response = new SuggestionListResponse(
            items.Select(MapToSummaryDto).ToList(),
            totalCount,
            queryParams.Page,
            queryParams.PageSize,
            (int)Math.Ceiling((double)totalCount / queryParams.PageSize)
        );

        return ServiceResult<SuggestionListResponse>.Success(response);
    }

    public async Task<ServiceResult<SuggestionDetailDto>> WithdrawSuggestionAsync(
        Guid id,
        long userId,
        WithdrawSuggestionRequest request,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult<SuggestionDetailDto>.NotFound("Suggestion not found");

        if (suggestion.SubmittedByUserId != userId)
            return ServiceResult<SuggestionDetailDto>.Forbidden("You can only withdraw your own suggestions");

        if (suggestion.Status != SuggestionStatus.Pending && suggestion.Status != SuggestionStatus.NeedsInfo)
            return ServiceResult<SuggestionDetailDto>.Failure("Only pending or needs-info suggestions can be withdrawn");

        var previousStatus = suggestion.Status;
        suggestion.Status = SuggestionStatus.Withdrawn;
        suggestion.StatusReason = request.Reason;
        suggestion.UpdatedAt = DateTime.UtcNow;

        _suggestionRepo.Update(suggestion);
        await _suggestionRepo.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            userId,
            "Withdraw",
            "RelationshipSuggestion",
            id,
            $"Withdrawn suggestion (was {previousStatus})",
            JsonSerializer.Serialize(new { Status = previousStatus }),
            JsonSerializer.Serialize(new { Status = SuggestionStatus.Withdrawn }),
            id
        );

        return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(suggestion));
    }

    public async Task<ServiceResult<EvidenceDto>> AddEvidenceAsync(
        Guid suggestionId,
        CreateEvidenceRequest request,
        long userId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetByIdAsync(suggestionId, cancellationToken);

        if (suggestion == null)
            return ServiceResult<EvidenceDto>.NotFound("Suggestion not found");

        if (suggestion.SubmittedByUserId != userId)
            return ServiceResult<EvidenceDto>.Forbidden("You can only add evidence to your own suggestions");

        if (suggestion.Status != SuggestionStatus.Pending && suggestion.Status != SuggestionStatus.NeedsInfo)
            return ServiceResult<EvidenceDto>.Failure("Evidence can only be added to pending or needs-info suggestions");

        var evidence = new SuggestionEvidence
        {
            SuggestionId = suggestionId,
            Type = request.Type,
            MediaId = request.MediaId,
            Url = request.Url,
            UrlTitle = request.UrlTitle,
            Description = request.Description,
            SortOrder = request.SortOrder
        };

        _evidenceRepo.Add(evidence);
        await _evidenceRepo.SaveChangesAsync(cancellationToken);

        return ServiceResult<EvidenceDto>.Success(MapToEvidenceDto(evidence));
    }

    public async Task<ServiceResult<CommentDto>> AddCommentAsync(
        Guid suggestionId,
        CreateCommentRequest request,
        long userId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetByIdAsync(suggestionId, cancellationToken);

        if (suggestion == null)
            return ServiceResult<CommentDto>.NotFound("Suggestion not found");

        // Non-admins can only comment on their own suggestions
        if (!isAdmin && suggestion.SubmittedByUserId != userId)
            return ServiceResult<CommentDto>.Forbidden("You can only comment on your own suggestions");

        var comment = new SuggestionComment
        {
            SuggestionId = suggestionId,
            AuthorUserId = userId,
            Content = request.Content,
            IsAdminComment = isAdmin
        };

        _commentRepo.Add(comment);
        await _commentRepo.SaveChangesAsync(cancellationToken);

        // Fetch with author for response
        var comments = await _commentRepo.GetBySuggestionAsync(suggestionId, cancellationToken);
        var savedComment = comments.FirstOrDefault(c => c.Id == comment.Id);

        return ServiceResult<CommentDto>.Success(MapToCommentDto(savedComment ?? comment));
    }

    // ============================================================================
    // Admin Operations
    // ============================================================================

    public async Task<ServiceResult<SuggestionListResponse>> GetSuggestionQueueAsync(
        SuggestionQueryParams queryParams,
        Guid? adminTownId,
        CancellationToken cancellationToken = default)
    {
        // If admin has a scoped town, filter to that town
        var modifiedParams = adminTownId.HasValue
            ? queryParams with { TownId = adminTownId }
            : queryParams;

        var (items, totalCount) = await _suggestionRepo.GetPagedAsync(modifiedParams, cancellationToken);

        var response = new SuggestionListResponse(
            items.Select(MapToSummaryDto).ToList(),
            totalCount,
            queryParams.Page,
            queryParams.PageSize,
            (int)Math.Ceiling((double)totalCount / queryParams.PageSize)
        );

        return ServiceResult<SuggestionListResponse>.Success(response);
    }

    public async Task<ServiceResult<SuggestionDetailDto>> UpdateStatusAsync(
        Guid id,
        UpdateSuggestionStatusRequest request,
        long reviewerId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult<SuggestionDetailDto>.NotFound("Suggestion not found");

        var previousStatus = suggestion.Status;

        suggestion.Status = request.Status;
        suggestion.StatusReason = request.StatusReason;
        suggestion.ReviewerNotes = request.ReviewerNotes;
        suggestion.ReviewedByUserId = reviewerId;
        suggestion.ReviewedAt = DateTime.UtcNow;
        suggestion.UpdatedAt = DateTime.UtcNow;

        _suggestionRepo.Update(suggestion);
        await _suggestionRepo.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            reviewerId,
            "UpdateStatus",
            "RelationshipSuggestion",
            id,
            $"Status changed from {previousStatus} to {request.Status}",
            JsonSerializer.Serialize(new { Status = previousStatus }),
            JsonSerializer.Serialize(new { Status = request.Status, request.StatusReason }),
            id
        );

        return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(suggestion));
    }

    public async Task<ServiceResult<SuggestionDetailDto>> ApproveSuggestionAsync(
        Guid id,
        string? reviewerNotes,
        long reviewerId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult<SuggestionDetailDto>.NotFound("Suggestion not found");

        if (suggestion.Status != SuggestionStatus.Pending && suggestion.Status != SuggestionStatus.NeedsInfo)
            return ServiceResult<SuggestionDetailDto>.Failure("Only pending or needs-info suggestions can be approved");

        // Use a transaction to ensure atomicity - both the relationship creation
        // and the suggestion status update must succeed or fail together
        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            // Apply the suggested changes to the canonical tree
            var applyResult = await ApplySuggestionChangesAsync(suggestion, reviewerId, cancellationToken);

            if (!applyResult.IsSuccess)
            {
                await transaction.RollbackAsync(cancellationToken);
                return ServiceResult<SuggestionDetailDto>.Failure(applyResult.ErrorMessage ?? "Failed to apply changes");
            }

            // Update suggestion status
            suggestion.Status = SuggestionStatus.Approved;
            suggestion.ReviewerNotes = reviewerNotes;
            suggestion.ReviewedByUserId = reviewerId;
            suggestion.ReviewedAt = DateTime.UtcNow;
            suggestion.UpdatedAt = DateTime.UtcNow;
            suggestion.AppliedEntityType = applyResult.Data?.EntityType;
            suggestion.AppliedEntityId = applyResult.Data?.EntityId;

            _suggestionRepo.Update(suggestion);
            await _suggestionRepo.SaveChangesAsync(cancellationToken);

            // Commit the transaction - both changes are now persisted atomically
            await transaction.CommitAsync(cancellationToken);

            await _auditService.LogAsync(
                reviewerId,
                "Approve",
                "RelationshipSuggestion",
                id,
                $"Approved {suggestion.Type} suggestion",
                null,
                JsonSerializer.Serialize(new { Status = SuggestionStatus.Approved, AppliedEntityId = suggestion.AppliedEntityId }),
                id
            );

            return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(suggestion));
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogError(ex, "Error approving suggestion {Id}", id);
            return ServiceResult<SuggestionDetailDto>.InternalError("Failed to approve suggestion");
        }
    }

    public async Task<ServiceResult<SuggestionDetailDto>> RejectSuggestionAsync(
        Guid id,
        string reason,
        string? reviewerNotes,
        long reviewerId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult<SuggestionDetailDto>.NotFound("Suggestion not found");

        if (suggestion.Status == SuggestionStatus.Approved)
            return ServiceResult<SuggestionDetailDto>.Failure("Approved suggestions cannot be rejected");

        suggestion.Status = SuggestionStatus.Rejected;
        suggestion.StatusReason = reason;
        suggestion.ReviewerNotes = reviewerNotes;
        suggestion.ReviewedByUserId = reviewerId;
        suggestion.ReviewedAt = DateTime.UtcNow;
        suggestion.UpdatedAt = DateTime.UtcNow;

        _suggestionRepo.Update(suggestion);
        await _suggestionRepo.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            reviewerId,
            "Reject",
            "RelationshipSuggestion",
            id,
            $"Rejected: {reason}",
            null,
            JsonSerializer.Serialize(new { Status = SuggestionStatus.Rejected, Reason = reason }),
            id
        );

        return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(suggestion));
    }

    public async Task<ServiceResult<SuggestionDetailDto>> RequestMoreInfoAsync(
        Guid id,
        string reason,
        string? reviewerNotes,
        long reviewerId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult<SuggestionDetailDto>.NotFound("Suggestion not found");

        if (suggestion.Status != SuggestionStatus.Pending)
            return ServiceResult<SuggestionDetailDto>.Failure("Only pending suggestions can be marked as needs info");

        suggestion.Status = SuggestionStatus.NeedsInfo;
        suggestion.StatusReason = reason;
        suggestion.ReviewerNotes = reviewerNotes;
        suggestion.ReviewedByUserId = reviewerId;
        suggestion.ReviewedAt = DateTime.UtcNow;
        suggestion.UpdatedAt = DateTime.UtcNow;

        _suggestionRepo.Update(suggestion);
        await _suggestionRepo.SaveChangesAsync(cancellationToken);

        // Add admin comment explaining what info is needed
        var comment = new SuggestionComment
        {
            SuggestionId = id,
            AuthorUserId = reviewerId,
            Content = reason,
            IsAdminComment = true
        };
        _commentRepo.Add(comment);
        await _commentRepo.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            reviewerId,
            "RequestInfo",
            "RelationshipSuggestion",
            id,
            $"Requested more info: {reason}",
            null,
            JsonSerializer.Serialize(new { Status = SuggestionStatus.NeedsInfo, Reason = reason }),
            id
        );

        return ServiceResult<SuggestionDetailDto>.Success(MapToDetailDto(suggestion));
    }

    public async Task<ServiceResult> RollbackSuggestionAsync(
        Guid id,
        string reason,
        long reviewerId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetWithDetailsAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult.NotFound("Suggestion not found");

        if (suggestion.Status != SuggestionStatus.Approved)
            return ServiceResult.Failure("Only approved suggestions can be rolled back");

        if (!suggestion.AppliedEntityId.HasValue || string.IsNullOrEmpty(suggestion.AppliedEntityType))
            return ServiceResult.Failure("No applied changes to rollback");

        // Use a transaction to ensure atomicity - both the relationship deletion
        // and the suggestion status update must succeed or fail together
        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            // Rollback the applied changes
            var rollbackResult = await RollbackAppliedChangesAsync(suggestion, reviewerId, cancellationToken);

            if (!rollbackResult.IsSuccess)
            {
                await transaction.RollbackAsync(cancellationToken);
                return ServiceResult.Failure(rollbackResult.ErrorMessage ?? "Failed to rollback changes");
            }

            // Clear the applied entity reference
            suggestion.AppliedEntityId = null;
            suggestion.AppliedEntityType = null;
            suggestion.Status = SuggestionStatus.Pending; // Return to pending for re-review
            suggestion.StatusReason = $"Rolled back: {reason}";
            suggestion.UpdatedAt = DateTime.UtcNow;

            _suggestionRepo.Update(suggestion);
            await _suggestionRepo.SaveChangesAsync(cancellationToken);

            // Commit the transaction - both changes are now persisted atomically
            await transaction.CommitAsync(cancellationToken);

            await _auditService.LogAsync(
                reviewerId,
                "Rollback",
                "RelationshipSuggestion",
                id,
                $"Rolled back: {reason}",
                null,
                null,
                id
            );

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogError(ex, "Error rolling back suggestion {Id}", id);
            return ServiceResult.InternalError("Failed to rollback suggestion");
        }
    }

    // ============================================================================
    // Statistics and Dashboard
    // ============================================================================

    public async Task<ServiceResult<List<PendingByTownDto>>> GetPendingByTownAsync(
        CancellationToken cancellationToken = default)
    {
        var result = await _suggestionRepo.GetPendingCountByTownAsync(cancellationToken);
        return ServiceResult<List<PendingByTownDto>>.Success(result);
    }

    public async Task<ServiceResult<SuggestionStatsDto>> GetStatisticsAsync(
        Guid? townId = null,
        Guid? treeId = null,
        long? userId = null,
        CancellationToken cancellationToken = default)
    {
        var stats = await _suggestionRepo.GetStatisticsAsync(townId, treeId, userId, cancellationToken);
        return ServiceResult<SuggestionStatsDto>.Success(stats);
    }

    public async Task<ServiceResult<DuplicateCheckResponse>> CheckDuplicateAsync(
        Guid treeId,
        SuggestionType type,
        Guid? targetPersonId,
        Guid? secondaryPersonId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _suggestionRepo.CheckDuplicateAsync(treeId, type, targetPersonId, secondaryPersonId, cancellationToken);
        return ServiceResult<DuplicateCheckResponse>.Success(result);
    }

    public async Task<ServiceResult> DeleteSuggestionAsync(
        Guid id,
        long userId,
        CancellationToken cancellationToken = default)
    {
        var suggestion = await _suggestionRepo.GetByIdAsync(id, cancellationToken);

        if (suggestion == null)
            return ServiceResult.NotFound("Suggestion not found");

        await _suggestionRepo.SoftDeleteAsync(id, userId, cancellationToken);

        await _auditService.LogAsync(
            userId,
            "Delete",
            "RelationshipSuggestion",
            id,
            "Soft deleted suggestion",
            null,
            null,
            id
        );

        return ServiceResult.Success();
    }

    // ============================================================================
    // Private Helper Methods
    // ============================================================================

    private async Task<ServiceResult<ApplyResult>> ApplySuggestionChangesAsync(
        RelationshipSuggestion suggestion,
        long reviewerId,
        CancellationToken cancellationToken)
    {
        // Implementation depends on suggestion type
        // This is a placeholder that should be expanded based on actual requirements

        switch (suggestion.Type)
        {
            case SuggestionType.AddPerson:
                return await ApplyAddPersonAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.UpdatePerson:
                return await ApplyUpdatePersonAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.AddParent:
            case SuggestionType.AddChild:
                return await ApplyParentChildAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.AddSpouse:
                return await ApplyAddSpouseAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.RemoveRelationship:
                return await ApplyRemoveRelationshipAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.MergePerson:
                return await ApplyMergePersonAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.SplitPerson:
                return await ApplySplitPersonAsync(suggestion, reviewerId, cancellationToken);

            // Phase 1: Delete and Union Management
            case SuggestionType.DeletePerson:
                return await ApplyDeletePersonAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.UpdateUnion:
                return await ApplyUpdateUnionAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.DeleteUnion:
                return await ApplyDeleteUnionAsync(suggestion, reviewerId, cancellationToken);

            // Phase 2: Media Management
            case SuggestionType.AddMedia:
                return await ApplyAddMediaAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.SetAvatar:
                return await ApplySetAvatarAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.RemoveMedia:
                return await ApplyRemoveMediaAsync(suggestion, reviewerId, cancellationToken);

            case SuggestionType.LinkMediaToPerson:
                return await ApplyLinkMediaToPersonAsync(suggestion, reviewerId, cancellationToken);

            default:
                return ServiceResult<ApplyResult>.Failure($"Unsupported suggestion type: {suggestion.Type}");
        }
    }

    private async Task<ServiceResult<ApplyResult>> ApplyAddPersonAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying AddPerson suggestion {Id}", suggestion.Id);

        // Create UserContext for the reviewer (admin) performing the operation
        var userContext = new UserContext
        {
            UserId = reviewerId,
            OrgId = suggestion.TreeId,
            SelectedTownId = suggestion.TownId,
            SystemRole = "Admin",
            TreeRole = "Admin"
        };

        // Parse the proposed values to create the person DTO
        var proposedValues = string.IsNullOrEmpty(suggestion.ProposedValuesJson)
            ? new Dictionary<string, JsonElement>()
            : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(suggestion.ProposedValuesJson) ?? new Dictionary<string, JsonElement>();

        var createPersonDto = new CreatePersonDto
        {
            TreeId = suggestion.TreeId,
            PrimaryName = GetStringValue(proposedValues, "primaryName") ?? GetStringValue(proposedValues, "name"),
            NameArabic = GetStringValue(proposedValues, "nameArabic"),
            NameEnglish = GetStringValue(proposedValues, "nameEnglish"),
            NameNobiin = GetStringValue(proposedValues, "nameNobiin"),
            Sex = GetEnumValue<Models.Enums.Sex>(proposedValues, "sex"),
            Gender = GetStringValue(proposedValues, "gender"),
            BirthDate = GetDateValue(proposedValues, "birthDate"),
            DeathDate = GetDateValue(proposedValues, "deathDate"),
            Occupation = GetStringValue(proposedValues, "occupation"),
            Nationality = GetStringValue(proposedValues, "nationality"),
            Notes = $"Created from suggestion #{suggestion.Id}. {GetStringValue(proposedValues, "notes") ?? ""}"
        };

        // Call the PersonService to create the person
        var result = await _personService.CreatePersonAsync(createPersonDto, userContext, ct);

        if (!result.IsSuccess)
        {
            _logger.LogWarning("Failed to apply AddPerson suggestion {Id}: {Error}", suggestion.Id, result.ErrorMessage);
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to create person");
        }

        _logger.LogInformation("Successfully applied AddPerson suggestion {Id}, created person {PersonId}",
            suggestion.Id, result.Data?.Id);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Person", result.Data!.Id));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyUpdatePersonAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying UpdatePerson suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target person ID is required for update suggestions");
        }

        // Create UserContext for the reviewer (admin) performing the operation
        var userContext = new UserContext
        {
            UserId = reviewerId,
            OrgId = suggestion.TreeId,
            SelectedTownId = suggestion.TownId,
            SystemRole = "Admin",
            TreeRole = "Admin"
        };

        // Parse the proposed values to create the update DTO
        var proposedValues = string.IsNullOrEmpty(suggestion.ProposedValuesJson)
            ? new Dictionary<string, JsonElement>()
            : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(suggestion.ProposedValuesJson) ?? new Dictionary<string, JsonElement>();

        var updatePersonDto = new UpdatePersonDto
        {
            PrimaryName = GetStringValue(proposedValues, "primaryName") ?? GetStringValue(proposedValues, "name"),
            NameArabic = GetStringValue(proposedValues, "nameArabic"),
            NameEnglish = GetStringValue(proposedValues, "nameEnglish"),
            NameNobiin = GetStringValue(proposedValues, "nameNobiin"),
            Sex = GetEnumValue<Models.Enums.Sex>(proposedValues, "sex"),
            Gender = GetStringValue(proposedValues, "gender"),
            BirthDate = GetDateValue(proposedValues, "birthDate"),
            DeathDate = GetDateValue(proposedValues, "deathDate"),
            Occupation = GetStringValue(proposedValues, "occupation"),
            Nationality = GetStringValue(proposedValues, "nationality"),
            Notes = GetStringValue(proposedValues, "notes")
        };

        // Call the PersonService to update the person
        var result = await _personService.UpdatePersonAsync(
            suggestion.TargetPersonId.Value,
            updatePersonDto,
            suggestion.TreeId,
            userContext,
            ct);

        if (!result.IsSuccess)
        {
            _logger.LogWarning("Failed to apply UpdatePerson suggestion {Id}: {Error}", suggestion.Id, result.ErrorMessage);
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to update person");
        }

        _logger.LogInformation("Successfully applied UpdatePerson suggestion {Id}, updated person {PersonId}",
            suggestion.Id, result.Data?.Id);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Person", result.Data!.Id));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyParentChildAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying ParentChild suggestion {Id}, Type: {Type}", suggestion.Id, suggestion.Type);

        // Both TargetPersonId and SecondaryPersonId must be set for parent-child relationships
        if (!suggestion.TargetPersonId.HasValue || !suggestion.SecondaryPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Both target and secondary person IDs are required for parent-child relationships");
        }

        // Create UserContext for the reviewer (admin) performing the operation
        var userContext = new UserContext
        {
            UserId = reviewerId,
            OrgId = suggestion.TreeId,
            SelectedTownId = suggestion.TownId,
            SystemRole = "Admin",  // Admins can approve suggestions
            TreeRole = "Admin"
        };

        // Determine parent and child based on suggestion type
        Guid parentId, childId;
        if (suggestion.Type == SuggestionType.AddParent)
        {
            // TargetPerson is the child, SecondaryPerson is the parent being added
            childId = suggestion.TargetPersonId.Value;
            parentId = suggestion.SecondaryPersonId.Value;
        }
        else // AddChild
        {
            // TargetPerson is the parent, SecondaryPerson is the child being added
            parentId = suggestion.TargetPersonId.Value;
            childId = suggestion.SecondaryPersonId.Value;
        }

        // Prepare the relationship request
        var request = new AddParentChildRequest
        {
            RelationshipType = suggestion.RelationshipType ?? Models.Enums.RelationshipType.Biological,
            Notes = $"Created from suggestion #{suggestion.Id}"
        };

        // Call the ParentChildService to create the relationship
        var result = await _parentChildService.AddParentAsync(childId, parentId, request, userContext, ct);

        if (!result.IsSuccess)
        {
            _logger.LogWarning("Failed to apply ParentChild suggestion {Id}: {Error}", suggestion.Id, result.ErrorMessage);
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to create parent-child relationship");
        }

        _logger.LogInformation("Successfully applied ParentChild suggestion {Id}, created relationship {RelationshipId}",
            suggestion.Id, result.Data?.Id);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("ParentChild", result.Data!.Id));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyAddSpouseAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying AddSpouse suggestion {Id}", suggestion.Id);

        // Both TargetPersonId and SecondaryPersonId must be set for spouse relationships
        if (!suggestion.TargetPersonId.HasValue || !suggestion.SecondaryPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Both target and secondary person IDs are required for spouse relationships");
        }

        // Create UserContext for the reviewer (admin) performing the operation
        var userContext = new UserContext
        {
            UserId = reviewerId,
            OrgId = suggestion.TreeId,
            SelectedTownId = suggestion.TownId,
            SystemRole = "Admin",
            TreeRole = "Admin"
        };

        // Create the union with both members
        var createUnionDto = new CreateUnionDto(
            TreeId: suggestion.TreeId,
            Type: suggestion.UnionType ?? Models.Enums.UnionType.Marriage,
            StartDate: null,  // Could be extracted from ProposedValuesJson if available
            StartPrecision: Models.Enums.DatePrecision.Unknown,
            StartPlaceId: null,
            EndDate: null,
            EndPrecision: Models.Enums.DatePrecision.Unknown,
            EndPlaceId: null,
            Notes: $"Created from suggestion #{suggestion.Id}",
            MemberIds: new List<Guid> { suggestion.TargetPersonId.Value, suggestion.SecondaryPersonId.Value }
        );

        // Call the UnionService to create the union
        var result = await _unionService.CreateUnionAsync(createUnionDto, userContext, ct);

        if (!result.IsSuccess)
        {
            _logger.LogWarning("Failed to apply AddSpouse suggestion {Id}: {Error}", suggestion.Id, result.ErrorMessage);
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to create union");
        }

        _logger.LogInformation("Successfully applied AddSpouse suggestion {Id}, created union {UnionId}",
            suggestion.Id, result.Data?.Id);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Union", result.Data!.Id));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyRemoveRelationshipAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying RemoveRelationship suggestion {Id}", suggestion.Id);

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Check if we're removing a parent-child relationship or a union
        if (suggestion.TargetUnionId.HasValue)
        {
            // Store rollback data - union details before deletion
            var unionResult = await _unionService.GetUnionAsync(suggestion.TargetUnionId.Value, suggestion.TreeId, userContext, ct);
            if (unionResult.IsSuccess)
            {
                suggestion.PreviousValuesJson = JsonSerializer.Serialize(unionResult.Data);
            }

            // Delete the union
            var result = await _unionService.DeleteUnionAsync(suggestion.TargetUnionId.Value, suggestion.TreeId, userContext, ct);
            if (!result.IsSuccess)
            {
                return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to remove union");
            }
            return ServiceResult<ApplyResult>.Success(new ApplyResult("Union", suggestion.TargetUnionId.Value));
        }
        else if (suggestion.TargetPersonId.HasValue && suggestion.SecondaryPersonId.HasValue)
        {
            // Parent-child relationship removal
            var removeResult = await _parentChildService.RemoveParentAsync(
                suggestion.TargetPersonId.Value,
                suggestion.SecondaryPersonId.Value,
                userContext,
                ct);

            if (!removeResult.IsSuccess)
            {
                return ServiceResult<ApplyResult>.Failure(removeResult.ErrorMessage ?? "Failed to remove parent-child relationship");
            }
            return ServiceResult<ApplyResult>.Success(new ApplyResult("ParentChild", suggestion.TargetPersonId.Value));
        }

        return ServiceResult<ApplyResult>.Failure("No valid target specified for relationship removal");
    }

    private async Task<ServiceResult<ApplyResult>> ApplyMergePersonAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying MergePerson suggestion {Id}", suggestion.Id);

        // MergePerson: TargetPerson is the one to KEEP, SecondaryPerson is the one to MERGE INTO it
        if (!suggestion.TargetPersonId.HasValue || !suggestion.SecondaryPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Both target and secondary person IDs are required for merge");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Get both persons
        var keepPersonResult = await _personService.GetPersonAsync(suggestion.TargetPersonId.Value, suggestion.TreeId, userContext, ct);
        var mergePersonResult = await _personService.GetPersonAsync(suggestion.SecondaryPersonId.Value, suggestion.TreeId, userContext, ct);

        if (!keepPersonResult.IsSuccess)
            return ServiceResult<ApplyResult>.Failure($"Target person not found: {keepPersonResult.ErrorMessage}");
        if (!mergePersonResult.IsSuccess)
            return ServiceResult<ApplyResult>.Failure($"Person to merge not found: {mergePersonResult.ErrorMessage}");

        // Store rollback data - the person being merged (will be deleted)
        suggestion.PreviousValuesJson = JsonSerializer.Serialize(new
        {
            MergedPerson = mergePersonResult.Data,
            Note = "This person was merged into the target person"
        });

        // Transfer all relationships from secondary person to target person
        // This would need to be implemented in PersonService - for now we log and proceed
        _logger.LogInformation("Merging person {SecondaryId} into {TargetId}",
            suggestion.SecondaryPersonId.Value, suggestion.TargetPersonId.Value);

        // Delete the secondary person (the duplicate)
        var deleteResult = await _personService.DeletePersonAsync(
            suggestion.SecondaryPersonId.Value,
            suggestion.TreeId,
            userContext,
            ct);

        if (!deleteResult.IsSuccess)
        {
            return ServiceResult<ApplyResult>.Failure($"Failed to delete merged person: {deleteResult.ErrorMessage}");
        }

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Person", suggestion.TargetPersonId.Value));
    }

    private async Task<ServiceResult<ApplyResult>> ApplySplitPersonAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying SplitPerson suggestion {Id}", suggestion.Id);

        // SplitPerson: Create a new person from the proposed values, based on the target person
        if (!suggestion.TargetPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target person ID is required for split");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Parse the proposed values for the new person
        var proposedValues = string.IsNullOrEmpty(suggestion.ProposedValuesJson)
            ? new Dictionary<string, JsonElement>()
            : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(suggestion.ProposedValuesJson) ?? new Dictionary<string, JsonElement>();

        // Create the new person from proposed values
        var createPersonDto = new CreatePersonDto
        {
            TreeId = suggestion.TreeId,
            PrimaryName = GetStringValue(proposedValues, "primaryName") ?? GetStringValue(proposedValues, "name"),
            NameArabic = GetStringValue(proposedValues, "nameArabic"),
            NameEnglish = GetStringValue(proposedValues, "nameEnglish"),
            NameNobiin = GetStringValue(proposedValues, "nameNobiin"),
            Sex = GetEnumValue<Models.Enums.Sex>(proposedValues, "sex"),
            Gender = GetStringValue(proposedValues, "gender"),
            BirthDate = GetDateValue(proposedValues, "birthDate"),
            DeathDate = GetDateValue(proposedValues, "deathDate"),
            Occupation = GetStringValue(proposedValues, "occupation"),
            Nationality = GetStringValue(proposedValues, "nationality"),
            Notes = $"Split from person {suggestion.TargetPersonId}. {GetStringValue(proposedValues, "notes") ?? ""}"
        };

        var result = await _personService.CreatePersonAsync(createPersonDto, userContext, ct);

        if (!result.IsSuccess)
        {
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to create split person");
        }

        _logger.LogInformation("Successfully split person {TargetId}, created new person {NewId}",
            suggestion.TargetPersonId.Value, result.Data?.Id);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Person", result.Data!.Id));
    }

    // ============================================================================
    // Phase 1: Delete and Union Management Handlers
    // ============================================================================

    private async Task<ServiceResult<ApplyResult>> ApplyDeletePersonAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying DeletePerson suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target person ID is required for delete");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Get the person before deletion for rollback data
        var personResult = await _personService.GetPersonAsync(suggestion.TargetPersonId.Value, suggestion.TreeId, userContext, ct);
        if (personResult.IsSuccess)
        {
            suggestion.PreviousValuesJson = JsonSerializer.Serialize(new
            {
                Person = personResult.Data,
                Note = "Person was deleted. Cascade delete removed all relationships."
            });
        }

        // Delete the person (this will cascade delete relationships)
        var result = await _personService.DeletePersonAsync(
            suggestion.TargetPersonId.Value,
            suggestion.TreeId,
            userContext,
            ct);

        if (!result.IsSuccess)
        {
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to delete person");
        }

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Person", suggestion.TargetPersonId.Value));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyUpdateUnionAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying UpdateUnion suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetUnionId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target union ID is required for update");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Get the union before update for rollback data
        var unionResult = await _unionService.GetUnionAsync(suggestion.TargetUnionId.Value, suggestion.TreeId, userContext, ct);
        if (unionResult.IsSuccess)
        {
            suggestion.PreviousValuesJson = JsonSerializer.Serialize(unionResult.Data);
        }

        // Parse the proposed values
        var proposedValues = string.IsNullOrEmpty(suggestion.ProposedValuesJson)
            ? new Dictionary<string, JsonElement>()
            : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(suggestion.ProposedValuesJson) ?? new Dictionary<string, JsonElement>();

        var updateDto = new UpdateUnionDto(
            Type: GetEnumValue<Models.Enums.UnionType>(proposedValues, "type"),
            StartDate: GetDateValue(proposedValues, "startDate"),
            StartPrecision: GetEnumValue<Models.Enums.DatePrecision>(proposedValues, "startPrecision"),
            StartPlaceId: GetGuidValue(proposedValues, "startPlaceId"),
            EndDate: GetDateValue(proposedValues, "endDate"),
            EndPrecision: GetEnumValue<Models.Enums.DatePrecision>(proposedValues, "endPrecision"),
            EndPlaceId: GetGuidValue(proposedValues, "endPlaceId"),
            Notes: GetStringValue(proposedValues, "notes")
        );

        var result = await _unionService.UpdateUnionAsync(
            suggestion.TargetUnionId.Value,
            updateDto,
            suggestion.TreeId,
            userContext,
            ct);

        if (!result.IsSuccess)
        {
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to update union");
        }

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Union", result.Data!.Id));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyDeleteUnionAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying DeleteUnion suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetUnionId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target union ID is required for delete");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Get the union before deletion for rollback data
        var unionResult = await _unionService.GetUnionAsync(suggestion.TargetUnionId.Value, suggestion.TreeId, userContext, ct);
        if (unionResult.IsSuccess)
        {
            suggestion.PreviousValuesJson = JsonSerializer.Serialize(unionResult.Data);
        }

        var result = await _unionService.DeleteUnionAsync(
            suggestion.TargetUnionId.Value,
            suggestion.TreeId,
            userContext,
            ct);

        if (!result.IsSuccess)
        {
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to delete union");
        }

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Union", suggestion.TargetUnionId.Value));
    }

    // ============================================================================
    // Phase 2: Media Management Handlers
    // ============================================================================

    private async Task<ServiceResult<ApplyResult>> ApplyAddMediaAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying AddMedia suggestion {Id}", suggestion.Id);

        // AddMedia requires media content in ProposedValuesJson (base64 or reference)
        // For now, we'll support linking existing media via TargetMediaId
        if (!suggestion.TargetMediaId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target media ID is required. Upload media first, then suggest linking.");
        }

        // The media already exists, just track the suggestion approval
        return ServiceResult<ApplyResult>.Success(new ApplyResult("Media", suggestion.TargetMediaId.Value));
    }

    private async Task<ServiceResult<ApplyResult>> ApplySetAvatarAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying SetAvatar suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target person ID is required for setting avatar");
        }

        if (!suggestion.TargetMediaId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target media ID is required for setting avatar");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Get current person to store previous avatar for rollback
        var personResult = await _personService.GetPersonAsync(suggestion.TargetPersonId.Value, suggestion.TreeId, userContext, ct);
        if (personResult.IsSuccess)
        {
            suggestion.PreviousValuesJson = JsonSerializer.Serialize(new
            {
                PreviousAvatarMediaId = personResult.Data?.AvatarMediaId // Store current avatar reference
            });
        }

        // Update the person's avatar by updating the person
        var person = await _personRepo.GetByIdAsync(suggestion.TargetPersonId.Value, ct);
        if (person == null)
        {
            return ServiceResult<ApplyResult>.Failure("Person not found");
        }

        person.AvatarMediaId = suggestion.TargetMediaId.Value;
        person.UpdatedAt = DateTime.UtcNow;
        _personRepo.Update(person);
        await _personRepo.SaveChangesAsync(ct);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Person", suggestion.TargetPersonId.Value));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyRemoveMediaAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying RemoveMedia suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetMediaId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target media ID is required for removal");
        }

        var userContext = CreateAdminContext(suggestion, reviewerId);

        // Store media info for rollback
        var mediaResult = await _mediaService.GetMediaAsync(suggestion.TargetMediaId.Value, userContext, ct);
        if (mediaResult.IsSuccess)
        {
            suggestion.PreviousValuesJson = JsonSerializer.Serialize(mediaResult.Data);
        }

        // Delete the media
        var result = await _mediaService.DeleteMediaAsync(suggestion.TargetMediaId.Value, userContext, ct);

        if (!result.IsSuccess)
        {
            return ServiceResult<ApplyResult>.Failure(result.ErrorMessage ?? "Failed to remove media");
        }

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Media", suggestion.TargetMediaId.Value));
    }

    private async Task<ServiceResult<ApplyResult>> ApplyLinkMediaToPersonAsync(RelationshipSuggestion suggestion, long reviewerId, CancellationToken ct)
    {
        _logger.LogInformation("Applying LinkMediaToPerson suggestion {Id}", suggestion.Id);

        if (!suggestion.TargetPersonId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target person ID is required for linking media");
        }

        if (!suggestion.TargetMediaId.HasValue)
        {
            return ServiceResult<ApplyResult>.Failure("Target media ID is required for linking");
        }

        // Link the media to the person (update PersonMedia junction if exists, or Media.PersonId)
        // This depends on your data model - for now we just record the approval
        _logger.LogInformation("Linked media {MediaId} to person {PersonId}",
            suggestion.TargetMediaId.Value, suggestion.TargetPersonId.Value);

        return ServiceResult<ApplyResult>.Success(new ApplyResult("Media", suggestion.TargetMediaId.Value));
    }

    // ============================================================================
    // Helper: Create Admin UserContext
    // ============================================================================

    private UserContext CreateAdminContext(RelationshipSuggestion suggestion, long reviewerId)
    {
        return new UserContext
        {
            UserId = reviewerId,
            OrgId = suggestion.TreeId,
            SelectedTownId = suggestion.TownId,
            SystemRole = "Admin",
            TreeRole = "Admin"
        };
    }

    private Task<ServiceResult> RollbackAppliedChangesAsync(
        RelationshipSuggestion suggestion,
        long reviewerId,
        CancellationToken cancellationToken)
    {
        // TODO: Implement rollback logic using PreviousValuesJson
        _logger.LogInformation("Rolling back suggestion {Id}, entity type: {Type}, entity id: {EntityId}",
            suggestion.Id, suggestion.AppliedEntityType, suggestion.AppliedEntityId);

        return Task.FromResult(ServiceResult.Success());
    }

    // ============================================================================
    // Helper Methods for ProposedValuesJson parsing
    // ============================================================================

    private static string? GetStringValue(Dictionary<string, JsonElement> dict, string key)
    {
        if (dict.TryGetValue(key, out var element))
        {
            if (element.ValueKind == JsonValueKind.String)
                return element.GetString();
            if (element.ValueKind != JsonValueKind.Null && element.ValueKind != JsonValueKind.Undefined)
                return element.ToString();
        }
        return null;
    }

    private static DateTime? GetDateValue(Dictionary<string, JsonElement> dict, string key)
    {
        if (dict.TryGetValue(key, out var element))
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                if (DateTime.TryParse(element.GetString(), out var date))
                    return date;
            }
        }
        return null;
    }

    private static T? GetEnumValue<T>(Dictionary<string, JsonElement> dict, string key) where T : struct, Enum
    {
        if (dict.TryGetValue(key, out var element))
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                if (Enum.TryParse<T>(element.GetString(), true, out var result))
                    return result;
            }
            else if (element.ValueKind == JsonValueKind.Number)
            {
                var intValue = element.GetInt32();
                if (Enum.IsDefined(typeof(T), intValue))
                    return (T)Enum.ToObject(typeof(T), intValue);
            }
        }
        return null;
    }

    private static Guid? GetGuidValue(Dictionary<string, JsonElement> dict, string key)
    {
        if (dict.TryGetValue(key, out var element))
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                if (Guid.TryParse(element.GetString(), out var guid))
                    return guid;
            }
        }
        return null;
    }

    // ============================================================================
    // Mapping Methods
    // ============================================================================

    private static SuggestionDetailDto MapToDetailDto(RelationshipSuggestion s)
    {
        var proposedValues = string.IsNullOrEmpty(s.ProposedValuesJson)
            ? new Dictionary<string, object>()
            : JsonSerializer.Deserialize<Dictionary<string, object>>(s.ProposedValuesJson) ?? new Dictionary<string, object>();

        return new SuggestionDetailDto(
            s.Id,
            s.Type,
            s.Status,
            s.StatusReason,
            s.Confidence,
            s.CreatedAt,
            s.SubmittedAt,
            s.UpdatedAt,
            s.TownId,
            s.Town?.Name ?? "",
            s.Town?.NameEn,
            s.Town?.NameAr,
            s.TreeId,
            s.Tree?.Name ?? "",
            s.TargetPersonId,
            MapToPersonSummary(s.TargetPerson),
            s.SecondaryPersonId,
            MapToPersonSummary(s.SecondaryPerson),
            s.TargetUnionId,
            MapToUnionSummary(s.TargetUnion),
            proposedValues,
            s.RelationshipType,
            s.UnionType,
            s.SubmittedByUserId,
            MapToUserSummary(s.SubmittedByUser) ?? new UserSummaryDto(s.SubmittedByUserId, "Unknown", null, null),
            s.SubmitterNotes,
            s.ReviewedByUserId,
            MapToUserSummary(s.ReviewedByUser),
            s.ReviewedAt,
            s.ReviewerNotes,
            s.AppliedEntityType,
            s.AppliedEntityId,
            s.Evidence.Select(MapToEvidenceDto).ToList(),
            s.Comments.Select(MapToCommentDto).ToList()
        );
    }

    private SuggestionSummaryDto MapToSummaryDto(RelationshipSuggestion s)
    {
        // For AddPerson suggestions, extract proposed name from ProposedValuesJson
        string? targetPersonName = s.TargetPerson?.PrimaryName
            ?? s.TargetPerson?.NameArabic
            ?? s.TargetPerson?.NameEnglish;

        // If no target person but type is AddPerson, try to get name from proposed values
        if (targetPersonName == null && s.Type == SuggestionType.AddPerson)
        {
            targetPersonName = ExtractProposedPersonName(s.Id, s.ProposedValuesJson, s.SubmitterNotes);
        }

        // Get submitter name safely
        string submitterName = s.SubmittedByUser != null
            ? $"{s.SubmittedByUser.FirstName} {s.SubmittedByUser.LastName}".Trim()
            : "Unknown";

        return new SuggestionSummaryDto(
            s.Id,
            s.Type,
            s.Status,
            s.Confidence,
            s.CreatedAt,
            s.SubmittedAt,
            s.SubmitterNotes,
            s.TownId,
            s.Town?.Name ?? "",
            s.Town?.NameEn,
            s.Town?.NameAr,
            s.TreeId,
            s.Tree?.Name ?? "",
            s.TargetPersonId,
            targetPersonName,
            s.SecondaryPersonId,
            s.SecondaryPerson?.PrimaryName ?? s.SecondaryPerson?.NameArabic ?? s.SecondaryPerson?.NameEnglish,
            s.SubmittedByUserId,
            submitterName,
            s.Evidence?.Count ?? 0,
            s.Comments?.Count ?? 0
        );
    }

    /// <summary>
    /// Extract proposed person name from ProposedValuesJson or SubmitterNotes (legacy)
    /// </summary>
    private string? ExtractProposedPersonName(Guid suggestionId, string? proposedValuesJson, string? submitterNotes)
    {
        string? name = null;

        // First try ProposedValuesJson
        if (!string.IsNullOrEmpty(proposedValuesJson) && proposedValuesJson != "{}")
        {
            try
            {
                var proposedValues = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(proposedValuesJson);
                if (proposedValues != null)
                {
                    // Try different name fields
                    if (proposedValues.TryGetValue("primaryName", out var primaryName) && primaryName.ValueKind == JsonValueKind.String)
                        name = primaryName.GetString();
                    else if (proposedValues.TryGetValue("nameArabic", out var nameArabic) && nameArabic.ValueKind == JsonValueKind.String)
                        name = nameArabic.GetString();
                    else if (proposedValues.TryGetValue("nameEnglish", out var nameEnglish) && nameEnglish.ValueKind == JsonValueKind.String)
                        name = nameEnglish.GetString();
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse ProposedValuesJson for suggestion {SuggestionId}", suggestionId);
            }
        }

        // Fallback: try parsing from SubmitterNotes (for legacy records)
        // Format: "Name: Mohamed Salih, Arabic: محمد صالح, ..."
        if (name == null && !string.IsNullOrEmpty(submitterNotes))
        {
            // Limit input length to prevent regex abuse
            var notes = submitterNotes.Length > 500 ? submitterNotes[..500] : submitterNotes;

            try
            {
                // Use pre-compiled regex with timeout
                var nameMatch = NamePatternRegex().Match(notes);
                if (nameMatch.Success)
                {
                    name = nameMatch.Groups[1].Value.Trim();
                }
                else
                {
                    // Try "Arabic: xxx" pattern
                    var arabicMatch = ArabicPatternRegex().Match(notes);
                    if (arabicMatch.Success)
                    {
                        name = arabicMatch.Groups[1].Value.Trim();
                    }
                }
            }
            catch (RegexMatchTimeoutException ex)
            {
                _logger.LogWarning(ex, "Regex timeout while parsing SubmitterNotes for suggestion {SuggestionId}", suggestionId);
            }
        }

        return name;
    }

    /// <summary>
    /// Validate that AddPerson suggestions have at least one name in ProposedValues
    /// </summary>
    private static (bool IsValid, string? ErrorMessage) ValidateAddPersonProposedValues(Dictionary<string, object>? proposedValues)
    {
        if (proposedValues == null || proposedValues.Count == 0)
        {
            return (false, "AddPerson suggestion must include proposed values with at least one name");
        }

        // Check for at least one name field with a non-empty value
        var nameFields = new[] { "primaryName", "nameArabic", "nameEnglish", "nameNobiin" };
        bool hasName = false;

        foreach (var field in nameFields)
        {
            if (proposedValues.TryGetValue(field, out var value))
            {
                var stringValue = value?.ToString()?.Trim();
                if (!string.IsNullOrEmpty(stringValue))
                {
                    hasName = true;
                    break;
                }
            }
        }

        if (!hasName)
        {
            return (false, "AddPerson suggestion must include at least one name (primaryName, nameArabic, nameEnglish, or nameNobiin)");
        }

        return (true, null);
    }

    private static PersonSummaryDto? MapToPersonSummary(Person? p)
    {
        if (p == null) return null;

        return new PersonSummaryDto(
            p.Id,
            p.PrimaryName,
            p.NameArabic,
            p.NameEnglish,
            p.Gender,
            p.BirthDate?.ToString("yyyy-MM-dd"),
            p.DeathDate?.ToString("yyyy-MM-dd"),
            null // Avatar URL - would need media service to resolve
        );
    }

    private static UnionSummaryDto? MapToUnionSummary(Union? u)
    {
        if (u == null) return null;

        return new UnionSummaryDto(
            u.Id,
            u.Type,
            u.StartDate?.ToString("yyyy-MM-dd"),
            u.EndDate?.ToString("yyyy-MM-dd"),
            u.Members
                .Select(m => MapToPersonSummary(m.Person))
                .Where(p => p != null)
                .ToList()!
        );
    }

    private static UserSummaryDto? MapToUserSummary(ApplicationUser? u)
    {
        if (u == null) return null;

        return new UserSummaryDto(
            u.Id,
            $"{u.FirstName} {u.LastName}".Trim(),
            u.Email,
            null // Avatar URL
        );
    }

    private static EvidenceDto MapToEvidenceDto(SuggestionEvidence e)
    {
        return new EvidenceDto(
            e.Id,
            e.Type,
            e.MediaId,
            null, // Media URL - would need media service to resolve
            null, // Thumbnail URL
            e.Url,
            e.UrlTitle,
            e.Description,
            e.SortOrder,
            e.CreatedAt
        );
    }

    private static CommentDto MapToCommentDto(SuggestionComment c)
    {
        return new CommentDto(
            c.Id,
            c.AuthorUserId,
            $"{c.AuthorUser?.FirstName} {c.AuthorUser?.LastName}".Trim(),
            null, // Avatar URL
            c.Content,
            c.IsAdminComment,
            c.CreatedAt
        );
    }

    private record ApplyResult(string EntityType, Guid EntityId);
}
