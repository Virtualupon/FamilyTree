using System.Security.Claims;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GedcomController : ControllerBase
{
    private readonly IGedcomService _gedcomService;
    private readonly ApplicationDbContext _context;
    private readonly ILogger<GedcomController> _logger;

    public GedcomController(
        IGedcomService gedcomService,
        ApplicationDbContext context,
        ILogger<GedcomController> logger)
    {
        _gedcomService = gedcomService;
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Import a GEDCOM file into a new or existing family tree
    /// </summary>
    /// <param name="file">The GEDCOM file (.ged)</param>
    /// <param name="treeName">Optional name for new tree (required if createNewTree is true)</param>
    /// <param name="existingTreeId">Optional existing tree ID to import into</param>
    /// <param name="townId">Required town ID for new trees</param>
    /// <param name="createNewTree">Whether to create a new tree (default: true)</param>
    /// <param name="importNotes">Whether to import notes (default: true)</param>
    /// <param name="importOccupations">Whether to import occupations (default: true)</param>
    [HttpPost("import")]
    [RequestSizeLimit(100_000_000)] // 100 MB limit
    public async Task<ActionResult<GedcomImportResult>> Import(
        IFormFile file,
        [FromQuery] string? treeName = null,
        [FromQuery] Guid? existingTreeId = null,
        [FromQuery] Guid? townId = null,
        [FromQuery] bool createNewTree = true,
        [FromQuery] bool importNotes = true,
        [FromQuery] bool importOccupations = true)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { error = "No file provided" });
        }

        var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        if (extension != ".ged")
        {
            return BadRequest(new { error = "File must be a GEDCOM file (.ged)" });
        }

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        // Validate access to existing tree if specified
        if (existingTreeId.HasValue)
        {
            var hasAccess = await _context.OrgUsers.AnyAsync(ou =>
                ou.OrgId == existingTreeId.Value &&
                ou.UserId == userId &&
                (ou.Role == OrgRole.Owner || ou.Role == OrgRole.Admin || ou.Role == OrgRole.Editor));

            if (!hasAccess)
            {
                return Forbid();
            }
        }

        // Validate townId is provided when creating a new tree
        if ((createNewTree || !existingTreeId.HasValue) && !townId.HasValue)
        {
            return BadRequest(new { error = "Town ID is required when creating a new tree" });
        }

        // Validate town exists
        if (townId.HasValue)
        {
            var townExists = await _context.Towns.AnyAsync(t => t.Id == townId.Value);
            if (!townExists)
            {
                return BadRequest(new { error = "Town not found" });
            }
        }

        try
        {
            var options = new GedcomImportOptions(
                CreateNewTree: createNewTree || !existingTreeId.HasValue,
                TreeName: treeName ?? Path.GetFileNameWithoutExtension(file.FileName),
                ExistingTreeId: existingTreeId,
                TownId: townId,
                MergeExisting: false,
                ImportNotes: importNotes,
                ImportPlaces: true,
                ImportOccupations: importOccupations
            );

            // Detect encoding from file header or use UTF-8
            string? encoding = null;
            using (var peekStream = file.OpenReadStream())
            {
                encoding = await DetectGedcomEncoding(peekStream);
            }

            using var stream = file.OpenReadStream();
            var result = await _gedcomService.ImportAsync(stream, userId, options, encoding);

            if (result.Success)
            {
                _logger.LogInformation(
                    "GEDCOM import successful: {Individuals} individuals, {Families} families, {Relationships} relationships",
                    result.IndividualsImported, result.FamiliesImported, result.RelationshipsCreated);
                return Ok(result);
            }
            else
            {
                _logger.LogWarning("GEDCOM import failed: {Message}", result.Message);
                return BadRequest(result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GEDCOM import error");
            return StatusCode(500, new GedcomImportResult(
                false, "An error occurred during import",
                0, 0, 0, new List<string>(), new List<string> { ex.Message }, TimeSpan.Zero));
        }
    }

    /// <summary>
    /// Preview a GEDCOM file without importing
    /// </summary>
    [HttpPost("preview")]
    [RequestSizeLimit(100_000_000)]
    public async Task<ActionResult<object>> Preview(IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { error = "No file provided" });
        }

        var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        if (extension != ".ged")
        {
            return BadRequest(new { error = "File must be a GEDCOM file (.ged)" });
        }

        try
        {
            string? encoding = null;
            using (var peekStream = file.OpenReadStream())
            {
                encoding = await DetectGedcomEncoding(peekStream);
            }

            using var stream = file.OpenReadStream();
            var (individuals, families, warnings) = await _gedcomService.ParseAsync(stream, encoding);

            return Ok(new
            {
                fileName = file.FileName,
                fileSize = file.Length,
                encoding = encoding ?? "UTF-8",
                individualCount = individuals.Count,
                familyCount = families.Count,
                warnings = warnings.Take(20).ToList(),
                warningCount = warnings.Count,
                sampleIndividuals = individuals.Take(10).Select(i => new
                {
                    id = i.Id,
                    name = i.FullName,
                    sex = i.Sex,
                    birthDate = i.BirthDate?.OriginalText,
                    deathDate = i.DeathDate?.OriginalText
                }).ToList()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GEDCOM preview error");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    private async Task<string?> DetectGedcomEncoding(Stream stream)
    {
        using var reader = new StreamReader(stream, leaveOpen: true);
        string? line;
        var lineCount = 0;

        while ((line = await reader.ReadLineAsync()) != null && lineCount < 50)
        {
            lineCount++;
            if (line.Contains("1 CHAR ", StringComparison.OrdinalIgnoreCase))
            {
                var parts = line.Split(' ', 3);
                if (parts.Length >= 3)
                {
                    return parts[2].Trim().ToUpperInvariant();
                }
            }
        }

        // Reset stream position
        stream.Position = 0;
        return null; // Will default to UTF-8
    }
}
