using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API controller for country lookup (nationalities)
/// </summary>
[ApiController]
[Route("api/countries")]
[Authorize]
public class CountryController : ControllerBase
{
    private readonly ICountryService _service;
    private readonly ILogger<CountryController> _logger;

    public CountryController(
        ICountryService service,
        ILogger<CountryController> logger)
    {
        _service = service;
        _logger = logger;
    }

    /// <summary>
    /// Get all active countries for nationality selection
    /// </summary>
    /// <returns>List of countries with multilingual names</returns>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<CountryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<CountryDto>>> GetAll(
        CancellationToken cancellationToken)
    {
        try
        {
            var countries = await _service.GetAllAsync(cancellationToken);
            return Ok(countries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting countries");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get countries" });
        }
    }

    /// <summary>
    /// Get a specific country by its ISO code
    /// </summary>
    /// <param name="code">ISO 3166-1 alpha-2 country code (e.g., "EG", "US")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>The country or 404 if not found</returns>
    [HttpGet("{code}")]
    [ProducesResponseType(typeof(CountryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CountryDto>> GetByCode(
        string code,
        CancellationToken cancellationToken)
    {
        try
        {
            var country = await _service.GetByCodeAsync(code, cancellationToken);
            if (country == null)
            {
                return NotFound(new { message = $"Country '{code}' not found" });
            }
            return Ok(country);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting country {Code}", code);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get country" });
        }
    }

    /// <summary>
    /// Get countries by region
    /// </summary>
    /// <param name="region">Geographic region (e.g., "Africa", "Middle East", "Europe")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>List of countries in the specified region</returns>
    [HttpGet("region/{region}")]
    [ProducesResponseType(typeof(IEnumerable<CountryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<CountryDto>>> GetByRegion(
        string region,
        CancellationToken cancellationToken)
    {
        try
        {
            var countries = await _service.GetByRegionAsync(region, cancellationToken);
            return Ok(countries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting countries for region {Region}", region);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get countries by region" });
        }
    }
}
