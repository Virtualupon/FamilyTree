using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Controller for managing relationship suggestions in the governance model
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SuggestionController : ControllerBase
{
    private readonly ISuggestionService _suggestionService;
    private readonly ILogger<SuggestionController> _logger;

    public SuggestionController(
        ISuggestionService suggestionService,
        ILogger<SuggestionController> logger)
    {
        _suggestionService = suggestionService;
        _logger = logger;
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            throw new UnauthorizedAccessException("User ID not found in token");
        return userId;
    }

    private Guid? GetSelectedTownId()
    {
        var townIdClaim = User.FindFirst("selectedTownId")?.Value;
        if (!string.IsNullOrEmpty(townIdClaim) && Guid.TryParse(townIdClaim, out var townId))
            return townId;
        return null;
    }

    private bool IsAdmin()
    {
        return User.IsInRole("Admin") || User.IsInRole("SuperAdmin");
    }

    private ActionResult HandleServiceResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
            return Ok(result.Data);

        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.Unauthorized => Unauthorized(new { message = result.ErrorMessage }),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }

    private ActionResult HandleServiceResult(ServiceResult result)
    {
        if (result.IsSuccess)
            return Ok(new { message = "Success" });

        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.Unauthorized => Unauthorized(new { message = result.ErrorMessage }),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }

    // ============================================================================
    // Viewer Endpoints
    // ============================================================================

    /// <summary>
    /// Create a new relationship suggestion
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<SuggestionDetailDto>> CreateSuggestion([FromBody] CreateSuggestionRequest request)
    {
        try
        {
            var userId = GetUserId();
            var townId = GetSelectedTownId();

            if (!townId.HasValue)
                return BadRequest(new { message = "No town selected. Please select a town first." });

            var result = await _suggestionService.CreateSuggestionAsync(request, userId, townId.Value);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating suggestion");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Convenience endpoint to suggest adding a new person
    /// </summary>
    [HttpPost("add-person")]
    public async Task<ActionResult<SuggestionSubmittedResponse>> SuggestAddPerson(
        [FromBody] SuggestAddPersonRequest request)
    {
        try
        {
            var userId = GetUserId();
            var townId = GetSelectedTownId();

            if (!townId.HasValue)
                return BadRequest(new { message = "No town selected. Please select a town first." });

            // Convert to generic suggestion request
            var proposedValues = new Dictionary<string, object>
            {
                ["PrimaryName"] = request.PrimaryName,
                ["NameEnglish"] = request.NameEnglish ?? "",
                ["NameArabic"] = request.NameArabic ?? "",
                ["Sex"] = request.Sex ?? "",
                ["BirthDate"] = request.BirthDate ?? "",
                ["BirthPlace"] = request.BirthPlace ?? "",
                ["DeathDate"] = request.DeathDate ?? "",
                ["DeathPlace"] = request.DeathPlace ?? "",
                ["Occupation"] = request.Occupation ?? ""
            };

            var suggestionType = SuggestionType.AddPerson;

            // If relationship specified, adjust type
            if (request.RelatedPersonId.HasValue && !string.IsNullOrEmpty(request.RelationshipType))
            {
                suggestionType = request.RelationshipType.ToLower() switch
                {
                    "parent" => SuggestionType.AddParent,
                    "child" => SuggestionType.AddChild,
                    "spouse" => SuggestionType.AddSpouse,
                    _ => SuggestionType.AddPerson
                };
            }

            var genericRequest = new CreateSuggestionRequest(
                TreeId: request.TreeId,
                Type: suggestionType,
                TargetPersonId: request.RelatedPersonId,
                SecondaryPersonId: null,
                TargetUnionId: null,
                TargetMediaId: null,
                ProposedValues: proposedValues,
                RelationshipType: null,
                UnionType: null,
                Confidence: request.Confidence,
                SubmitterNotes: request.SubmitterNotes,
                Evidence: null
            );

            var result = await _suggestionService.CreateSuggestionAsync(genericRequest, userId, townId.Value);

            if (!result.IsSuccess)
                return HandleServiceResult(result);

            return Ok(new SuggestionSubmittedResponse(
                SuggestionId: result.Data!.Id,
                Status: "Pending",
                Message: "Your suggestion has been submitted for review.",
                SubmittedAt: DateTime.UtcNow
            ));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating add-person suggestion");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Convenience endpoint to suggest adding a relationship between two people
    /// </summary>
    [HttpPost("add-relationship")]
    public async Task<ActionResult<SuggestionSubmittedResponse>> SuggestAddRelationship(
        [FromBody] SuggestAddRelationshipRequest request)
    {
        try
        {
            // Check for model binding errors
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage);
                _logger.LogWarning("SuggestAddRelationship - ModelState invalid: {Errors}", string.Join(", ", errors));
                return BadRequest(new { message = "Invalid request", errors = errors.ToArray() });
            }

            _logger.LogInformation("SuggestAddRelationship called. TreeId: {TreeId}, Person1Id: {P1}, Person2Id: {P2}, RelType: {RelType}, Person1IsParent: {IsParent}",
                request.TreeId, request.Person1Id, request.Person2Id, request.RelationshipType, request.Person1IsParent);

            var userId = GetUserId();
            var townId = GetSelectedTownId();

            if (!townId.HasValue)
                return BadRequest(new { message = "No town selected. Please select a town first." });

            SuggestionType suggestionType;
            Guid? targetPersonId;
            Guid? secondaryPersonId;
            RelationshipType? relType = null;
            UnionType? unionType = null;

            if (request.RelationshipType.ToLower() == "spouse")
            {
                suggestionType = SuggestionType.AddSpouse;
                targetPersonId = request.Person1Id;
                secondaryPersonId = request.Person2Id;
                unionType = UnionType.Marriage;
            }
            else // parent-child
            {
                if (request.Person1IsParent)
                {
                    suggestionType = SuggestionType.AddChild;
                    targetPersonId = request.Person1Id; // parent
                    secondaryPersonId = request.Person2Id; // child
                }
                else
                {
                    suggestionType = SuggestionType.AddParent;
                    targetPersonId = request.Person2Id; // child
                    secondaryPersonId = request.Person1Id; // parent
                }
                relType = RelationshipType.Biological;
            }

            var proposedValues = new Dictionary<string, object>();
            if (!string.IsNullOrEmpty(request.MarriageDate))
                proposedValues["StartDate"] = request.MarriageDate;
            if (!string.IsNullOrEmpty(request.MarriagePlace))
                proposedValues["StartPlace"] = request.MarriagePlace;

            var genericRequest = new CreateSuggestionRequest(
                TreeId: request.TreeId,
                Type: suggestionType,
                TargetPersonId: targetPersonId,
                SecondaryPersonId: secondaryPersonId,
                TargetUnionId: null,
                TargetMediaId: null,
                ProposedValues: proposedValues.Count > 0 ? proposedValues : null,
                RelationshipType: relType,
                UnionType: unionType,
                Confidence: request.Confidence,
                SubmitterNotes: request.SubmitterNotes,
                Evidence: null
            );

            var result = await _suggestionService.CreateSuggestionAsync(genericRequest, userId, townId.Value);

            if (!result.IsSuccess)
                return HandleServiceResult(result);

            return Ok(new SuggestionSubmittedResponse(
                SuggestionId: result.Data!.Id,
                Status: "Pending",
                Message: "Your relationship suggestion has been submitted for review.",
                SubmittedAt: DateTime.UtcNow
            ));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating add-relationship suggestion");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get a suggestion by ID
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SuggestionDetailDto>> GetSuggestion(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.GetSuggestionAsync(id, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get my submitted suggestions
    /// </summary>
    [HttpGet("my")]
    public async Task<ActionResult<SuggestionListResponse>> GetMySuggestions(
        [FromQuery] SuggestionStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        try
        {
            var userId = GetUserId();
            var queryParams = new SuggestionQueryParams(
                Status: status,
                Page: page,
                PageSize: pageSize
            );

            var result = await _suggestionService.GetMySuggestionsAsync(userId, queryParams);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting my suggestions");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Withdraw a pending suggestion
    /// </summary>
    [HttpPost("{id:guid}/withdraw")]
    public async Task<ActionResult<SuggestionDetailDto>> WithdrawSuggestion(
        Guid id,
        [FromBody] WithdrawSuggestionRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.WithdrawSuggestionAsync(id, userId, request);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error withdrawing suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Add evidence to a suggestion
    /// </summary>
    [HttpPost("{id:guid}/evidence")]
    public async Task<ActionResult<EvidenceDto>> AddEvidence(
        Guid id,
        [FromBody] CreateEvidenceRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.AddEvidenceAsync(id, request, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding evidence to suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Add a comment to a suggestion
    /// </summary>
    [HttpPost("{id:guid}/comments")]
    public async Task<ActionResult<CommentDto>> AddComment(
        Guid id,
        [FromBody] CreateCommentRequest request)
    {
        try
        {
            var userId = GetUserId();
            var isAdmin = IsAdmin();
            var result = await _suggestionService.AddCommentAsync(id, request, userId, isAdmin);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding comment to suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Check for duplicate suggestions
    /// </summary>
    [HttpGet("check-duplicate")]
    public async Task<ActionResult<DuplicateCheckResponse>> CheckDuplicate(
        [FromQuery] Guid treeId,
        [FromQuery] SuggestionType type,
        [FromQuery] Guid? targetPersonId,
        [FromQuery] Guid? secondaryPersonId)
    {
        try
        {
            var result = await _suggestionService.CheckDuplicateAsync(
                treeId, type, targetPersonId, secondaryPersonId);
            return HandleServiceResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking for duplicate suggestions");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    // ============================================================================
    // Admin Endpoints
    // ============================================================================

    /// <summary>
    /// Get suggestion queue for admin review
    /// </summary>
    [HttpGet("queue")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<SuggestionListResponse>> GetSuggestionQueue(
        [FromQuery] Guid? townId,
        [FromQuery] Guid? treeId,
        [FromQuery] SuggestionStatus? status,
        [FromQuery] SuggestionType? type,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string sortBy = "CreatedAt",
        [FromQuery] bool sortDesc = true)
    {
        try
        {
            var adminTownId = GetSelectedTownId();

            // SuperAdmin can see all, Admin is scoped to their town
            var effectiveTownId = User.IsInRole("SuperAdmin") ? townId : (adminTownId ?? townId);

            var queryParams = new SuggestionQueryParams(
                TownId: effectiveTownId,
                TreeId: treeId,
                Status: status,
                Type: type,
                Page: page,
                PageSize: pageSize,
                SortBy: sortBy,
                SortDesc: sortDesc
            );

            var result = await _suggestionService.GetSuggestionQueueAsync(queryParams, adminTownId);
            return HandleServiceResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting suggestion queue");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Update suggestion status (generic status update)
    /// </summary>
    [HttpPut("{id:guid}/status")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<SuggestionDetailDto>> UpdateStatus(
        Guid id,
        [FromBody] UpdateSuggestionStatusRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.UpdateStatusAsync(id, request, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating suggestion status {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Approve a suggestion and apply changes
    /// </summary>
    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<SuggestionDetailDto>> ApproveSuggestion(
        Guid id,
        [FromBody] ApproveRequest? request = null)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.ApproveSuggestionAsync(id, request?.ReviewerNotes, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Reject a suggestion
    /// </summary>
    [HttpPost("{id:guid}/reject")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<SuggestionDetailDto>> RejectSuggestion(
        Guid id,
        [FromBody] RejectRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.RejectSuggestionAsync(
                id, request.Reason, request.ReviewerNotes, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rejecting suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Request more information from submitter
    /// </summary>
    [HttpPost("{id:guid}/request-info")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<SuggestionDetailDto>> RequestMoreInfo(
        Guid id,
        [FromBody] RequestInfoRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.RequestMoreInfoAsync(
                id, request.Reason, request.ReviewerNotes, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting more info for suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Rollback an approved suggestion
    /// </summary>
    [HttpPost("{id:guid}/rollback")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult> RollbackSuggestion(
        Guid id,
        [FromBody] RollbackRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.RollbackSuggestionAsync(id, request.Reason, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rolling back suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Soft delete a suggestion
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult> DeleteSuggestion(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.DeleteSuggestionAsync(id, userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting suggestion {Id}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    // ============================================================================
    // Statistics Endpoints
    // ============================================================================

    /// <summary>
    /// Get pending suggestions count by town (for admin dashboard)
    /// </summary>
    [HttpGet("pending-by-town")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<List<PendingByTownDto>>> GetPendingByTown()
    {
        try
        {
            var result = await _suggestionService.GetPendingByTownAsync();
            return HandleServiceResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending suggestions by town");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get suggestion statistics
    /// </summary>
    [HttpGet("statistics")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<SuggestionStatsDto>> GetStatistics(
        [FromQuery] Guid? townId,
        [FromQuery] Guid? treeId,
        [FromQuery] long? userId)
    {
        try
        {
            var result = await _suggestionService.GetStatisticsAsync(townId, treeId, userId);
            return HandleServiceResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting suggestion statistics");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get my suggestion statistics (for viewer dashboard)
    /// </summary>
    [HttpGet("my/statistics")]
    public async Task<ActionResult<SuggestionStatsDto>> GetMyStatistics()
    {
        try
        {
            var userId = GetUserId();
            var result = await _suggestionService.GetStatisticsAsync(userId: userId);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting my suggestion statistics");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }
}

// ============================================================================
// Request DTOs for admin actions (not in main DTOs file for clarity)
// ============================================================================

public record ApproveRequest(string? ReviewerNotes);
public record RejectRequest(string Reason, string? ReviewerNotes);
public record RequestInfoRequest(string Reason, string? ReviewerNotes);
public record RollbackRequest(string Reason);
