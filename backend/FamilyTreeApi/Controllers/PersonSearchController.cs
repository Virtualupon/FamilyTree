// FamilyTreeApi/Controllers/PersonSearchController.cs
#nullable enable
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs.Search;
using FamilyTreeApi.Services;
using FamilyTreeApi.Services.Interfaces;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API endpoints for optimized person search operations.
/// Uses PostgreSQL functions with Dapper for high-performance queries.
/// </summary>
[ApiController]
[Route("api/search")]
[Authorize]
public class PersonSearchController : ControllerBase
{
    private readonly IPersonSearchService _searchService;
    private readonly ILogger<PersonSearchController> _logger;

    public PersonSearchController(
        IPersonSearchService searchService,
        ILogger<PersonSearchController> logger)
    {
        _searchService = searchService;
        _logger = logger;
    }

    /// <summary>
    /// Search persons with full filtering and pagination.
    /// Supports multilingual search (Arabic, Latin, Coptic scripts).
    /// </summary>
    [HttpPost("persons")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    [ProducesResponseType(400)]
    public async Task<ActionResult<PersonSearchResult>> SearchPersons(
        [FromBody] PersonSearchRequest request,
        CancellationToken cancellationToken)
    {
        var userContext = BuildUserContext();
        var result = await _searchService.SearchPersonsAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Quick search with auto-detected language/script.
    /// If no query is provided, returns all persons (paginated).
    /// </summary>
    [HttpGet("persons")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    [ProducesResponseType(400)]
    public async Task<ActionResult<PersonSearchResult>> QuickSearch(
        [FromQuery] string? q = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var userContext = BuildUserContext();

        // If no query provided, use advanced search to list all
        if (string.IsNullOrWhiteSpace(q))
        {
            var listRequest = new PersonSearchRequest
            {
                Query = null,
                Page = page,
                PageSize = pageSize
            };
            var listResult = await _searchService.SearchPersonsAsync(listRequest, userContext, cancellationToken);
            return HandleResult(listResult);
        }

        var result = await _searchService.QuickSearchAsync(q, userContext, page, pageSize, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Search specifically in Arabic script names.
    /// </summary>
    [HttpGet("persons/arabic")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    public async Task<ActionResult<PersonSearchResult>> SearchArabic(
        [FromQuery] string q,
        [FromQuery] Guid? treeId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(q))
        {
            return BadRequest(new { message = "Search query 'q' is required" });
        }

        var request = new PersonSearchRequest
        {
            Query = q,
            SearchIn = "arabic",
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        };

        var userContext = BuildUserContext();
        var result = await _searchService.SearchPersonsAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Search specifically in Latin script names.
    /// </summary>
    [HttpGet("persons/latin")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    public async Task<ActionResult<PersonSearchResult>> SearchLatin(
        [FromQuery] string q,
        [FromQuery] Guid? treeId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(q))
        {
            return BadRequest(new { message = "Search query 'q' is required" });
        }

        var request = new PersonSearchRequest
        {
            Query = q,
            SearchIn = "latin",
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        };

        var userContext = BuildUserContext();
        var result = await _searchService.SearchPersonsAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Search specifically in Coptic/Nobiin script names.
    /// </summary>
    [HttpGet("persons/nobiin")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    public async Task<ActionResult<PersonSearchResult>> SearchNobiin(
        [FromQuery] string q,
        [FromQuery] Guid? treeId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(q))
        {
            return BadRequest(new { message = "Search query 'q' is required" });
        }

        var request = new PersonSearchRequest
        {
            Query = q,
            SearchIn = "coptic",
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        };

        var userContext = BuildUserContext();
        var result = await _searchService.SearchPersonsAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Search persons within a specific family.
    /// </summary>
    [HttpGet("family/{familyId}/persons")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    public async Task<ActionResult<PersonSearchResult>> SearchByFamily(
        Guid familyId,
        [FromQuery] string? q = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var userContext = BuildUserContext();
        var result = await _searchService.SearchByFamilyAsync(
            familyId, q, userContext, page, pageSize, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Search persons within a specific town.
    /// </summary>
    [HttpGet("town/{townId}/persons")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    public async Task<ActionResult<PersonSearchResult>> SearchByTown(
        Guid townId,
        [FromQuery] string? q = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var userContext = BuildUserContext();
        var result = await _searchService.SearchByTownAsync(
            townId, q, userContext, page, pageSize, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Find relationship path between two persons.
    /// Uses BFS algorithm to find shortest path.
    /// </summary>
    [HttpGet("relationship-path")]
    [ProducesResponseType(typeof(RelationshipPathResult), 200)]
    [ProducesResponseType(400)]
    public async Task<ActionResult<RelationshipPathResult>> FindRelationshipPath(
        [FromQuery] Guid person1Id,
        [FromQuery] Guid person2Id,
        [FromQuery] Guid? treeId = null,
        [FromQuery] int maxDepth = 15,
        CancellationToken cancellationToken = default)
    {
        if (person1Id == Guid.Empty || person2Id == Guid.Empty)
        {
            return BadRequest(new { message = "Both person1Id and person2Id are required" });
        }

        if (person1Id == person2Id)
        {
            return Ok(new RelationshipPathResult
            {
                PathFound = true,
                PathLength = 0,
                RelationshipSummary = "Same person",
                HumanReadableRelationship = "Same person"
            });
        }

        var request = new RelationshipPathRequest
        {
            Person1Id = person1Id,
            Person2Id = person2Id,
            TreeId = treeId,
            MaxDepth = maxDepth
        };

        var userContext = BuildUserContext();
        var result = await _searchService.FindRelationshipPathAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Get family tree data for visualization.
    /// Supports pedigree, descendants, and hourglass views.
    /// </summary>
    [HttpGet("tree-data")]
    [ProducesResponseType(typeof(FamilyTreeDataResult), 200)]
    [ProducesResponseType(400)]
    public async Task<ActionResult<FamilyTreeDataResult>> GetFamilyTreeData(
        [FromQuery] Guid rootPersonId,
        [FromQuery] string viewMode = "pedigree",
        [FromQuery] int generations = 3,
        [FromQuery] bool includeSpouses = true,
        CancellationToken cancellationToken = default)
    {
        if (rootPersonId == Guid.Empty)
        {
            return BadRequest(new { message = "rootPersonId is required" });
        }

        var validModes = new[] { "pedigree", "descendants", "hourglass" };
        if (!validModes.Contains(viewMode.ToLowerInvariant()))
        {
            return BadRequest(new { message = $"Invalid viewMode. Must be one of: {string.Join(", ", validModes)}" });
        }

        var request = new FamilyTreeDataRequest
        {
            RootPersonId = rootPersonId,
            ViewMode = viewMode.ToLowerInvariant(),
            Generations = generations,
            IncludeSpouses = includeSpouses
        };

        var userContext = BuildUserContext();
        var result = await _searchService.GetFamilyTreeDataAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Get complete person details with all related data in a single call.
    /// </summary>
    [HttpGet("persons/{personId}/details")]
    [ProducesResponseType(typeof(PersonDetailsResult), 200)]
    [ProducesResponseType(404)]
    public async Task<ActionResult<PersonDetailsResult>> GetPersonDetails(
        Guid personId,
        CancellationToken cancellationToken = default)
    {
        if (personId == Guid.Empty)
        {
            return BadRequest(new { message = "personId is required" });
        }

        var userContext = BuildUserContext();
        var result = await _searchService.GetPersonDetailsAsync(personId, userContext, cancellationToken);
        return HandleResult(result);
    }

    /// <summary>
    /// Advanced search with all filters (POST version).
    /// </summary>
    [HttpPost("persons/advanced")]
    [ProducesResponseType(typeof(PersonSearchResult), 200)]
    public async Task<ActionResult<PersonSearchResult>> AdvancedSearch(
        [FromBody] PersonSearchRequest request,
        CancellationToken cancellationToken = default)
    {
        var userContext = BuildUserContext();
        var result = await _searchService.SearchPersonsAsync(request, userContext, cancellationToken);
        return HandleResult(result);
    }

    // ========================================================================
    // HELPER METHODS (following existing controller patterns)
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
        return User.FindFirst("systemRole")?.Value ?? "User";
    }

    private string GetTreeRole()
    {
        return User.FindFirst("treeRole")?.Value ?? "Viewer";
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