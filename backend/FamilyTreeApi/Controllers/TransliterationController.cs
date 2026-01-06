using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API controller for name transliteration between Arabic, English, and Nobiin
/// </summary>
[ApiController]
[Route("api/transliteration")]
[Authorize]
public class TransliterationController : ControllerBase
{
    private readonly INameTransliterationService _service;
    private readonly ILogger<TransliterationController> _logger;

    public TransliterationController(
        INameTransliterationService service,
        ILogger<TransliterationController> logger)
    {
        _service = service;
        _logger = logger;
    }

    /// <summary>
    /// Transliterate a single name between Arabic, English, and Nobiin scripts
    /// </summary>
    /// <param name="request">Transliteration request with name and options</param>
    /// <returns>Transliteration result with all language variants</returns>
    [HttpPost]
    [ProducesResponseType(typeof(TransliterationResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TransliterationResult>> Transliterate(
        [FromBody] TransliterationRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.InputName))
            {
                return BadRequest(new { message = "Input name is required" });
            }

            // Set org ID from user claims if not provided
            if (!request.OrgId.HasValue)
            {
                var orgIdClaim = User.FindFirst("orgId")?.Value;
                if (Guid.TryParse(orgIdClaim, out var orgId))
                {
                    request.OrgId = orgId;
                }
            }

            var result = await _service.TransliterateNameAsync(request);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid transliteration request");
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error transliterating name: {Name}", request.InputName);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to transliterate name" });
        }
    }

    /// <summary>
    /// Transliterate multiple names (for batch processing or GED import)
    /// </summary>
    /// <param name="request">Batch request with list of names</param>
    /// <returns>Batch result with all transliterations</returns>
    [HttpPost("batch")]
    [ProducesResponseType(typeof(BatchTransliterationResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<BatchTransliterationResult>> TransliterateBatch(
        [FromBody] BatchTransliterationRequest request)
    {
        try
        {
            if (request.Names == null || request.Names.Count == 0)
            {
                return BadRequest(new { message = "At least one name is required" });
            }

            if (request.Names.Count > 100)
            {
                return BadRequest(new { message = "Maximum 100 names per batch" });
            }

            // Set org ID for all requests if not provided
            var orgIdClaim = User.FindFirst("orgId")?.Value;
            if (Guid.TryParse(orgIdClaim, out var orgId))
            {
                foreach (var nameRequest in request.Names.Where(n => !n.OrgId.HasValue))
                {
                    nameRequest.OrgId = orgId;
                }
            }

            var result = await _service.TransliterateBatchAsync(request.Names);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in batch transliteration");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to process batch transliteration" });
        }
    }

    /// <summary>
    /// Verify and optionally correct a name mapping
    /// </summary>
    /// <param name="request">Verification request with optional corrections</param>
    /// <returns>Verification result</returns>
    [HttpPost("verify")]
    [ProducesResponseType(typeof(VerifyMappingResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<VerifyMappingResult>> VerifyMapping(
        [FromBody] VerifyMappingRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            if (!userId.HasValue)
            {
                return Unauthorized(new { message = "User ID not found in claims" });
            }

            var result = await _service.VerifyMappingAsync(request, userId.Value);

            if (!result.Success && result.Message == "Mapping not found")
            {
                return NotFound(new { message = result.Message });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying mapping {Id}", request.MappingId);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to verify mapping" });
        }
    }

    /// <summary>
    /// Get all name mappings that need review
    /// </summary>
    /// <returns>List of mappings needing review</returns>
    [HttpGet("review")]
    [ProducesResponseType(typeof(IEnumerable<NameMappingDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<NameMappingDto>>> GetMappingsNeedingReview()
    {
        try
        {
            Guid? orgId = null;
            var orgIdClaim = User.FindFirst("orgId")?.Value;
            if (Guid.TryParse(orgIdClaim, out var parsedOrgId))
            {
                orgId = parsedOrgId;
            }

            var mappings = await _service.GetMappingsNeedingReviewAsync(orgId);
            return Ok(mappings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting mappings needing review");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get mappings needing review" });
        }
    }

    /// <summary>
    /// Search for existing name mappings
    /// </summary>
    /// <param name="q">Search term (searches all scripts)</param>
    /// <param name="limit">Maximum results to return (default 20)</param>
    /// <returns>Matching name mappings</returns>
    [HttpGet("search")]
    [ProducesResponseType(typeof(IEnumerable<NameMappingDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IEnumerable<NameMappingDto>>> SearchMappings(
        [FromQuery] string q,
        [FromQuery] int limit = 20)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(q))
            {
                return BadRequest(new { message = "Search term is required" });
            }

            if (limit < 1 || limit > 100)
            {
                limit = 20;
            }

            var mappings = await _service.SearchMappingsAsync(q, limit);
            return Ok(mappings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching mappings for: {Term}", q);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to search mappings" });
        }
    }

    /// <summary>
    /// Get a specific name mapping by ID
    /// </summary>
    /// <param name="id">Mapping ID</param>
    /// <returns>Name mapping or 404 if not found</returns>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(NameMappingDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<NameMappingDto>> GetMappingById(int id)
    {
        try
        {
            var mapping = await _service.GetMappingByIdAsync(id);
            if (mapping == null)
            {
                return NotFound(new { message = $"Mapping {id} not found" });
            }
            return Ok(mapping);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting mapping {Id}", id);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get mapping" });
        }
    }

    /// <summary>
    /// Generate missing language variants for a specific person's names.
    /// If person has Arabic name but no English/Nobiin, this will generate them.
    /// </summary>
    /// <param name="personId">Person ID</param>
    /// <returns>Result with generated names</returns>
    [HttpPost("person/{personId:guid}/generate")]
    [ProducesResponseType(typeof(PersonTransliterationResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PersonTransliterationResult>> GenerateForPerson(Guid personId)
    {
        try
        {
            var orgIdClaim = User.FindFirst("orgId")?.Value;
            Guid? orgId = Guid.TryParse(orgIdClaim, out var parsed) ? parsed : null;

            var result = await _service.GenerateMissingNamesForPersonAsync(personId, orgId);
            
            if (!result.Success && result.Message?.Contains("not found") == true)
            {
                return NotFound(new { message = result.Message });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating translations for person {PersonId}", personId);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to generate translations" });
        }
    }

    /// <summary>
    /// Generate missing language variants for all persons in an org/tree.
    /// This is a background operation - returns immediately with a job ID.
    /// </summary>
    /// <param name="request">Options for bulk generation</param>
    /// <returns>Job ID and estimated count</returns>
    [HttpPost("bulk-generate")]
    [ProducesResponseType(typeof(BulkTransliterationResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<BulkTransliterationResult>> BulkGenerate(
        [FromBody] BulkTransliterationRequest request)
    {
        try
        {
            // Get org ID from request or claims
            if (!request.OrgId.HasValue)
            {
                var orgIdClaim = User.FindFirst("orgId")?.Value;
                if (Guid.TryParse(orgIdClaim, out var orgId))
                {
                    request.OrgId = orgId;
                }
            }

            if (!request.OrgId.HasValue)
            {
                return BadRequest(new { message = "OrgId is required" });
            }

            var result = await _service.BulkGenerateMissingNamesAsync(request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting bulk translation generation");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to start bulk generation" });
        }
    }

    /// <summary>
    /// Preview what translations would be generated for a person without saving.
    /// </summary>
    /// <param name="personId">Person ID</param>
    /// <returns>Preview of translations that would be generated</returns>
    [HttpGet("person/{personId:guid}/preview")]
    [ProducesResponseType(typeof(TransliterationPreviewResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TransliterationPreviewResult>> PreviewForPerson(Guid personId)
    {
        try
        {
            var orgIdClaim = User.FindFirst("orgId")?.Value;
            Guid? orgId = Guid.TryParse(orgIdClaim, out var parsed) ? parsed : null;

            var result = await _service.PreviewTransliterationsForPersonAsync(personId, orgId);
            
            if (!result.Success && result.Message?.Contains("not found") == true)
            {
                return NotFound(new { message = result.Message });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error previewing translations for person {PersonId}", personId);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to preview translations" });
        }
    }

    #region Private Helpers

    private long? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (long.TryParse(userIdClaim, out var userId))
        {
            return userId;
        }
        return null;
    }

    #endregion
}
