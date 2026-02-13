#nullable enable
using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs.DuplicateDetection;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API controller for duplicate person detection and resolution.
/// Requires Admin or SuperAdmin role.
/// </summary>
[ApiController]
[Route("api/admin/duplicates")]
[Authorize]
public class DuplicateDetectionController : ControllerBase
{
    private readonly IDuplicateDetectionService _service;
    private readonly ILogger<DuplicateDetectionController> _logger;

    public DuplicateDetectionController(
        IDuplicateDetectionService service,
        ILogger<DuplicateDetectionController> logger)
    {
        _service = service;
        _logger = logger;
    }

    /// <summary>
    /// Scan for duplicate candidates in one or more trees.
    /// Uses 4 detection strategies: exact name, similar name, mother surname pattern, shared parent.
    /// </summary>
    /// <param name="request">Scan parameters including tree, mode, and confidence threshold</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Paginated list of duplicate candidates</returns>
    [HttpPost("scan")]
    public async Task<ActionResult<DuplicateScanResult>> Scan(
        [FromBody] DuplicateScanRequest request,
        CancellationToken cancellationToken)
    {
        var userContext = BuildUserContext();
        var result = await _service.ScanAsync(request, userContext, cancellationToken);

        return HandleResult(result);
    }

    /// <summary>
    /// Get summary statistics of duplicate candidates by match type.
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<DuplicateSummaryResult>> GetSummary(
        [FromQuery] Guid? treeId,
        [FromQuery] Guid? targetTreeId,
        [FromQuery] string mode = "auto",
        [FromQuery] int minConfidence = 50,
        CancellationToken cancellationToken = default)
    {
        var userContext = BuildUserContext();
        var result = await _service.GetSummaryAsync(treeId, targetTreeId, mode, minConfidence, userContext, cancellationToken);

        return HandleResult(result);
    }

    /// <summary>
    /// Resolve a duplicate pair.
    /// Actions:
    /// - approve_link: Create PersonLink with LinkType=SamePerson, Status=Approved
    /// - reject: Create PersonLink with LinkType=SamePerson, Status=Rejected (excluded from future scans)
    /// - merge: Combine two persons into one (requires keepPersonId)
    /// </summary>
    /// <param name="personAId">First person ID</param>
    /// <param name="personBId">Second person ID</param>
    /// <param name="request">Resolution action and options</param>
    /// <param name="cancellationToken">Cancellation token</param>
    [HttpPost("{personAId:guid}/{personBId:guid}/resolve")]
    public async Task<ActionResult> Resolve(
        Guid personAId,
        Guid personBId,
        [FromBody] DuplicateResolveRequest request,
        CancellationToken cancellationToken)
    {
        var userContext = BuildUserContext();
        var result = await _service.ResolveAsync(personAId, personBId, request, userContext, cancellationToken);

        if (result.IsSuccess)
            return Ok(new { message = $"Successfully resolved duplicate pair with action: {request.Action}" });

        return HandleError(result);
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
        {
            throw new UnauthorizedAccessException("User ID not found in token");
        }
        return userId;
    }

    private Guid? TryGetOrgIdFromToken()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrEmpty(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
            return null;
        }
        return orgId;
    }

    private string GetSystemRole()
    {
        var systemRole = User.FindFirst("systemRole")?.Value;
        return systemRole ?? "User";
    }

    private string GetTreeRole()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(role))
        {
            return "Viewer";
        }

        if (role.Contains(':'))
        {
            role = role.Split(':').Last();
        }

        return role;
    }

    private ActionResult<T> HandleResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
        {
            return Ok(result.Data);
        }

        return HandleError(result);
    }

    private ActionResult HandleError(ServiceResult result)
    {
        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }
}
