using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Controllers.Admin;

/// <summary>
/// Admin API controller for Countries CRUD management.
/// Requires SuperAdmin role for all endpoints.
/// </summary>
[ApiController]
[Route("api/admin/countries")]
[Authorize(Roles = "Developer,SuperAdmin")]
public class CountriesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CountriesController> _logger;

    public CountriesController(
        ApplicationDbContext context,
        ILogger<CountriesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get all countries (with optional filtering)
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<CountryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<CountryDto>>> GetAll(
        [FromQuery] bool? isActive = null,
        [FromQuery] string? region = null,
        [FromQuery] string? search = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var query = _context.Countries.AsQueryable();

            if (isActive.HasValue)
                query = query.Where(c => c.IsActive == isActive.Value);

            if (!string.IsNullOrWhiteSpace(region))
                query = query.Where(c => c.Region == region);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(c =>
                    c.Code.ToLower().Contains(searchLower) ||
                    c.NameEn.ToLower().Contains(searchLower) ||
                    (c.NameAr != null && c.NameAr.Contains(search)));
            }

            var countries = await query
                .OrderBy(c => c.DisplayOrder)
                .ThenBy(c => c.NameEn)
                .Select(c => new CountryDto
                {
                    Code = c.Code,
                    NameEn = c.NameEn,
                    NameAr = c.NameAr,
                    NameLocal = c.NameLocal,
                    Region = c.Region,
                    IsActive = c.IsActive,
                    DisplayOrder = c.DisplayOrder
                })
                .ToListAsync(cancellationToken);

            return Ok(countries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting countries list");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get countries" });
        }
    }

    /// <summary>
    /// Get single country by code
    /// </summary>
    [HttpGet("{code}")]
    [ProducesResponseType(typeof(CountryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CountryDto>> GetByCode(
        string code,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var country = await _context.Countries
                .Where(c => c.Code == code.ToUpperInvariant())
                .Select(c => new CountryDto
                {
                    Code = c.Code,
                    NameEn = c.NameEn,
                    NameAr = c.NameAr,
                    NameLocal = c.NameLocal,
                    Region = c.Region,
                    IsActive = c.IsActive,
                    DisplayOrder = c.DisplayOrder
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (country == null)
                return NotFound(new { message = $"Country '{code}' not found" });

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
    /// Create new country
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(CountryDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CountryDto>> Create(
        [FromBody] CreateCountryDto dto,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var code = dto.Code.Trim().ToUpperInvariant();

            if (code.Length != 2)
                return BadRequest(new { message = "Country code must be exactly 2 characters" });

            var exists = await _context.Countries.AnyAsync(c => c.Code == code, cancellationToken);
            if (exists)
                return Conflict(new { message = $"Country '{code}' already exists" });

            var country = new Country
            {
                Code = code,
                NameEn = dto.NameEn.Trim(),
                NameAr = dto.NameAr?.Trim(),
                NameLocal = dto.NameLocal?.Trim(),
                Region = dto.Region?.Trim(),
                IsActive = dto.IsActive,
                DisplayOrder = dto.DisplayOrder
            };

            _context.Countries.Add(country);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Country created: {Code} - {Name}", code, country.NameEn);

            var result = new CountryDto
            {
                Code = country.Code,
                NameEn = country.NameEn,
                NameAr = country.NameAr,
                NameLocal = country.NameLocal,
                Region = country.Region,
                IsActive = country.IsActive,
                DisplayOrder = country.DisplayOrder
            };

            return CreatedAtAction(nameof(GetByCode), new { code = country.Code }, result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating country");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to create country" });
        }
    }

    /// <summary>
    /// Update existing country
    /// </summary>
    [HttpPut("{code}")]
    [ProducesResponseType(typeof(CountryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CountryDto>> Update(
        string code,
        [FromBody] UpdateCountryDto dto,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var country = await _context.Countries.FindAsync(
                new object[] { code.ToUpperInvariant() },
                cancellationToken);

            if (country == null)
                return NotFound(new { message = $"Country '{code}' not found" });

            if (!string.IsNullOrWhiteSpace(dto.NameEn))
                country.NameEn = dto.NameEn.Trim();

            country.NameAr = dto.NameAr?.Trim();
            country.NameLocal = dto.NameLocal?.Trim();
            country.Region = dto.Region?.Trim();

            if (dto.IsActive.HasValue)
                country.IsActive = dto.IsActive.Value;

            if (dto.DisplayOrder.HasValue)
                country.DisplayOrder = dto.DisplayOrder.Value;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Country updated: {Code} - {Name}", code, country.NameEn);

            return Ok(new CountryDto
            {
                Code = country.Code,
                NameEn = country.NameEn,
                NameAr = country.NameAr,
                NameLocal = country.NameLocal,
                Region = country.Region,
                IsActive = country.IsActive,
                DisplayOrder = country.DisplayOrder
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating country {Code}", code);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to update country" });
        }
    }

    /// <summary>
    /// Delete country
    /// </summary>
    [HttpDelete("{code}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        string code,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var country = await _context.Countries.FindAsync(
                new object[] { code.ToUpperInvariant() },
                cancellationToken);

            if (country == null)
                return NotFound(new { message = $"Country '{code}' not found" });

            // Check if country is used by any person
            var isUsed = await _context.People.AnyAsync(
                p => p.Nationality == code.ToUpperInvariant(),
                cancellationToken);

            if (isUsed)
                return BadRequest(new { message = $"Cannot delete country '{code}' - it is used by existing people. Deactivate it instead." });

            _context.Countries.Remove(country);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Country deleted: {Code}", code);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting country {Code}", code);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to delete country" });
        }
    }

    /// <summary>
    /// Toggle country active status
    /// </summary>
    [HttpPatch("{code}/toggle-active")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleActive(
        string code,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var country = await _context.Countries.FindAsync(
                new object[] { code.ToUpperInvariant() },
                cancellationToken);

            if (country == null)
                return NotFound(new { message = $"Country '{code}' not found" });

            country.IsActive = !country.IsActive;
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Country {Code} active status: {IsActive}", code, country.IsActive);

            return Ok(new { code = country.Code, isActive = country.IsActive });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling country {Code} active status", code);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to toggle country status" });
        }
    }

    /// <summary>
    /// Get distinct regions for filtering
    /// </summary>
    [HttpGet("regions")]
    [ProducesResponseType(typeof(List<string>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<string>>> GetRegions(
        CancellationToken cancellationToken = default)
    {
        try
        {
            var regions = await _context.Countries
                .Where(c => !string.IsNullOrEmpty(c.Region))
                .Select(c => c.Region!)
                .Distinct()
                .OrderBy(r => r)
                .ToListAsync(cancellationToken);

            return Ok(regions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting regions");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get regions" });
        }
    }
}
