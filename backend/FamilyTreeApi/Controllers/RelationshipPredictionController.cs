using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.DTOs.Prediction;
using FamilyTreeApi.Services;
using FamilyTreeApi.Services.Prediction;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Controller for the relationship prediction engine.
/// Allows admins to scan trees for missing relationships and accept/dismiss predictions.
/// </summary>
[ApiController]
[Route("api/prediction")]
[Authorize(Roles = "Developer,SuperAdmin,Admin")]
public class RelationshipPredictionController : ControllerBase
{
    private readonly IRelationshipPredictionService _predictionService;

    public RelationshipPredictionController(IRelationshipPredictionService predictionService)
    {
        _predictionService = predictionService;
    }

    /// <summary>
    /// Scan a tree for missing relationships.
    /// Runs all prediction rules and stores results for admin review.
    /// </summary>
    [HttpPost("scan/{treeId:guid}")]
    public async Task<IActionResult> ScanTree(Guid treeId, CancellationToken ct)
    {
        var userContext = BuildUserContext();
        var result = await _predictionService.ScanTreeAsync(treeId, userContext, ct);
        return ToActionResult(result);
    }

    /// <summary>
    /// Get predictions for a tree with optional filtering.
    /// </summary>
    [HttpGet("{treeId:guid}")]
    public async Task<IActionResult> GetPredictions(
        Guid treeId,
        [FromQuery] string? status = null,
        [FromQuery] string? confidenceLevel = null,
        [FromQuery] string? ruleId = null,
        [FromQuery] string? predictedType = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var filter = new PredictionFilterDto(status, confidenceLevel, ruleId, predictedType, page, pageSize);
        var userContext = BuildUserContext();
        var result = await _predictionService.GetPredictionsAsync(treeId, filter, userContext, ct);
        return ToActionResult(result);
    }

    /// <summary>
    /// Accept a prediction — creates the actual ParentChild or Union record.
    /// </summary>
    [HttpPost("{predictionId:guid}/accept")]
    public async Task<IActionResult> AcceptPrediction(Guid predictionId, CancellationToken ct)
    {
        var userContext = BuildUserContext();
        var result = await _predictionService.AcceptPredictionAsync(predictionId, userContext, ct);
        return ToActionResult(result);
    }

    /// <summary>
    /// Dismiss a prediction with an optional reason.
    /// </summary>
    [HttpPost("{predictionId:guid}/dismiss")]
    public async Task<IActionResult> DismissPrediction(
        Guid predictionId,
        [FromBody] DismissPredictionRequest? request,
        CancellationToken ct)
    {
        var userContext = BuildUserContext();
        var result = await _predictionService.DismissPredictionAsync(
            predictionId, request?.Reason, userContext, ct);
        return ToActionResult(result);
    }

    /// <summary>
    /// Bulk accept all predictions above a confidence threshold.
    /// </summary>
    [HttpPost("{treeId:guid}/accept-batch")]
    public async Task<IActionResult> AcceptAllHighConfidence(
        Guid treeId,
        [FromBody] BulkAcceptRequest? request,
        CancellationToken ct)
    {
        var minConfidence = request?.MinConfidence ?? 85.0;
        var userContext = BuildUserContext();
        var result = await _predictionService.AcceptAllHighConfidenceAsync(
            treeId, minConfidence, userContext, ct);
        return ToActionResult(result);
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    private UserContext BuildUserContext()
    {
        return new UserContext
        {
            UserId = GetUserId(),
            OrgId = TryGetOrgIdFromToken(),
            SystemRole = GetSystemRole(),
            TreeRole = GetTreeRole()
        };
    }

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            throw new UnauthorizedAccessException("User ID not found in token");
        return userId;
    }

    private Guid? TryGetOrgIdFromToken()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrEmpty(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
            return null;
        return orgId;
    }

    private string GetSystemRole()
    {
        return User.FindFirst("systemRole")?.Value ?? "User";
    }

    private string GetTreeRole()
    {
        return User.FindFirst("treeRole")?.Value
            ?? User.FindFirst(ClaimTypes.Role)?.Value
            ?? "Viewer";
    }

    private IActionResult ToActionResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
            return Ok(result.Data);
        if (result.ErrorType == ServiceErrorType.NotFound)
            return NotFound(new { message = result.ErrorMessage });
        if (result.ErrorType == ServiceErrorType.Forbidden)
            return Forbid();
        return BadRequest(new { message = result.ErrorMessage });
    }

    private IActionResult ToActionResult(ServiceResult result)
    {
        if (result.IsSuccess)
            return Ok(new { message = "Success" });
        if (result.ErrorType == ServiceErrorType.NotFound)
            return NotFound(new { message = result.ErrorMessage });
        if (result.ErrorType == ServiceErrorType.Forbidden)
            return Forbid();
        return BadRequest(new { message = result.ErrorMessage });
    }
}
