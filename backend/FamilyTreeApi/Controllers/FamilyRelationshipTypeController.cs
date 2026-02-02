using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API controller for family relationship types (trilingual lookup data)
/// </summary>
[ApiController]
[Route("api/relationship-types")]
[Authorize]
public class FamilyRelationshipTypeController : ControllerBase
{
    private readonly IFamilyRelationshipTypeService _service;
    private readonly IRelationshipTypeMappingService _mappingService;
    private readonly ILogger<FamilyRelationshipTypeController> _logger;

    public FamilyRelationshipTypeController(
        IFamilyRelationshipTypeService service,
        IRelationshipTypeMappingService mappingService,
        ILogger<FamilyRelationshipTypeController> logger)
    {
        _service = service;
        _mappingService = mappingService;
        _logger = logger;
    }

    /// <summary>
    /// Get the cache version hash for relationship types.
    /// Frontend can use this to detect when cached data needs refreshing.
    /// </summary>
    /// <returns>A version hash string</returns>
    [HttpGet("version")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(string), StatusCodes.Status200OK)]
    public ActionResult<string> GetCacheVersion()
    {
        return Ok(_mappingService.GetCacheVersion());
    }

    /// <summary>
    /// Get all active family relationship types
    /// </summary>
    /// <returns>List of relationship types with trilingual names</returns>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<FamilyRelationshipTypeDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<FamilyRelationshipTypeDto>>> GetAll(
        CancellationToken cancellationToken)
    {
        try
        {
            var types = await _service.GetAllAsync(cancellationToken);
            return Ok(types);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family relationship types");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get relationship types" });
        }
    }

    /// <summary>
    /// Get all active family relationship types grouped by category
    /// </summary>
    /// <returns>List of relationship types grouped by category</returns>
    [HttpGet("grouped")]
    [ProducesResponseType(typeof(IEnumerable<FamilyRelationshipTypeGroupedDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<FamilyRelationshipTypeGroupedDto>>> GetAllGrouped(
        CancellationToken cancellationToken)
    {
        try
        {
            var types = await _service.GetAllGroupedAsync(cancellationToken);
            return Ok(types);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting grouped family relationship types");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get grouped relationship types" });
        }
    }

    /// <summary>
    /// Get a specific family relationship type by ID
    /// </summary>
    /// <param name="id">The relationship type ID</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>The relationship type or 404 if not found</returns>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(FamilyRelationshipTypeDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<FamilyRelationshipTypeDto>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        try
        {
            var type = await _service.GetByIdAsync(id, cancellationToken);
            if (type == null)
            {
                return NotFound(new { message = $"Relationship type {id} not found" });
            }
            return Ok(type);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family relationship type {Id}", id);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get relationship type" });
        }
    }
}
