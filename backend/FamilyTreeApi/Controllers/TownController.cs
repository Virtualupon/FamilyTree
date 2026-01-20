// File: Controllers/TownController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Town API controller - thin controller handling only HTTP concerns.
/// All business logic is delegated to ITownService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TownController : ControllerBase
{
    private readonly ITownService _townService;
    private readonly ILogger<TownController> _logger;

    public TownController(ITownService townService, ILogger<TownController> logger)
    {
        _townService = townService;
        _logger = logger;
    }

    // ========================================================================
    // TOWN CRUD
    // ========================================================================

    /// <summary>
    /// Get all towns with pagination and filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<TownListItemDto>>> GetTowns(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? nameQuery = null,
        [FromQuery] string? country = null)
    {
        var search = new TownSearchDto(page, pageSize, nameQuery, country);
        var result = await _townService.GetTownsAsync(search);

        return HandleResult(result);
    }

    /// <summary>
    /// Get a specific town by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<TownDetailDto>> GetTown(Guid id)
    {
        var result = await _townService.GetTownAsync(id);

        return HandleResult(result);
    }

    /// <summary>
    /// Get all trees in a specific town
    /// </summary>
    [HttpGet("{id}/trees")]
    public async Task<ActionResult<List<FamilyTreeListItem>>> GetTownTrees(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _townService.GetTownTreesAsync(id, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get aggregated statistics for a town including all family trees
    /// </summary>
    [HttpGet("{townId}/statistics")]
    public async Task<ActionResult<TownStatisticsDto>> GetTownStatistics(Guid townId)
    {
        var userContext = BuildUserContext();
        var result = await _townService.GetTownStatisticsAsync(townId, userContext);

        return HandleResult(result);
    }

    // ========================================================================
    // TOWN MUTATIONS - SuperAdmin Only
    // ========================================================================

    /// <summary>
    /// Create a new town (SuperAdmin only)
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownDetailDto>> CreateTown(CreateTownDto request)
    {
        var userContext = BuildUserContext();
        var result = await _townService.CreateTownAsync(request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetTown), new { id = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update a town (SuperAdmin only)
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<TownDetailDto>> UpdateTown(Guid id, UpdateTownDto request)
    {
        var userContext = BuildUserContext();
        var result = await _townService.UpdateTownAsync(id, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a town (SuperAdmin only)
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> DeleteTown(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _townService.DeleteTownAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Get list of unique countries from all towns
    /// </summary>
    [HttpGet("countries")]
    public async Task<ActionResult<List<string>>> GetCountries()
    {
        var result = await _townService.GetCountriesAsync();

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
