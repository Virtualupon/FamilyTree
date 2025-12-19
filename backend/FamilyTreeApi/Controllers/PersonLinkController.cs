// File: Controllers/PersonLinkController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// PersonLink API controller - thin controller handling only HTTP concerns.
/// All business logic is delegated to IPersonLinkService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PersonLinkController : ControllerBase
{
    private readonly IPersonLinkService _personLinkService;
    private readonly ILogger<PersonLinkController> _logger;

    public PersonLinkController(IPersonLinkService personLinkService, ILogger<PersonLinkController> logger)
    {
        _personLinkService = personLinkService;
        _logger = logger;
    }

    // ============================================================================
    // LINK OPERATIONS
    // ============================================================================

    /// <summary>
    /// Get all links for a person (as source or target)
    /// </summary>
    [HttpGet("person/{personId}")]
    public async Task<ActionResult<List<PersonLinkResponse>>> GetPersonLinks(Guid personId)
    {
        var userContext = BuildUserContext();
        var result = await _personLinkService.GetPersonLinksAsync(personId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get pending link requests for trees the user can manage
    /// </summary>
    [HttpGet("pending")]
    public async Task<ActionResult<List<PersonLinkResponse>>> GetPendingLinks()
    {
        var userContext = BuildUserContext();
        var result = await _personLinkService.GetPendingLinksAsync(userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Create a link request between two persons
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PersonLinkResponse>> CreateLink(CreatePersonLinkRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _personLinkService.CreateLinkAsync(request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetPersonLinks), new { personId = result.Data!.SourcePersonId }, result.Data);
    }

    /// <summary>
    /// Approve or reject a link request
    /// </summary>
    [HttpPost("{linkId}/review")]
    public async Task<ActionResult<PersonLinkResponse>> ReviewLink(Guid linkId, ApprovePersonLinkRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _personLinkService.ReviewLinkAsync(linkId, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a link
    /// </summary>
    [HttpDelete("{linkId}")]
    public async Task<IActionResult> DeleteLink(Guid linkId)
    {
        var userContext = BuildUserContext();
        var result = await _personLinkService.DeleteLinkAsync(linkId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Get all approved links for persons in a tree (for D3 visualization)
    /// Returns a map of personId -> list of their approved links
    /// </summary>
    [HttpGet("tree/{treeId}/summary")]
    public async Task<ActionResult<Dictionary<string, List<PersonLinkSummaryDto>>>> GetTreeLinksSummary(Guid treeId)
    {
        var userContext = BuildUserContext();
        var result = await _personLinkService.GetTreeLinksSummaryAsync(treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Search for potential link matches in other trees
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<PersonSearchResultDto>>> SearchForMatches(
        [FromQuery] string name,
        [FromQuery] DateTime? birthDate = null,
        [FromQuery] Guid? excludeTreeId = null)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
        {
            return BadRequest(new { message = "Name must be at least 2 characters" });
        }

        var userContext = BuildUserContext();
        var result = await _personLinkService.SearchForMatchesAsync(name, birthDate, excludeTreeId, userContext);

        return HandleResult(result);
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Builds UserContext from JWT claims for service-layer authorization.
    /// </summary>
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

    /// <summary>
    /// Maps ServiceResult to appropriate ActionResult with data.
    /// </summary>
    private ActionResult<T> HandleResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
        {
            return Ok(result.Data);
        }

        return HandleError(result);
    }

    /// <summary>
    /// Maps ServiceResult errors to appropriate HTTP status codes.
    /// </summary>
    private ActionResult HandleError(ServiceResult result)
    {
        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.Unauthorized => Unauthorized(),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }
}
