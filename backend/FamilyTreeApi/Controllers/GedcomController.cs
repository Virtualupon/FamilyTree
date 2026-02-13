using System.Security.Claims;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
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

        // Determine if we should use existing tree or create new
        // If existingTreeId is provided, always use it (ignore createNewTree flag)
        bool shouldCreateNewTree = !existingTreeId.HasValue && createNewTree;

        // Validate access to existing tree if specified
        Org? existingTree = null;
        if (existingTreeId.HasValue)
        {
            existingTree = await _context.Orgs
                .FirstOrDefaultAsync(o => o.Id == existingTreeId.Value);

            if (existingTree == null)
            {
                return BadRequest(new { error = "Specified tree not found" });
            }

            var hasAccess = await _context.OrgUsers.AnyAsync(ou =>
                ou.OrgId == existingTreeId.Value &&
                ou.UserId == userId &&
                (ou.Role == OrgRole.Owner || ou.Role == OrgRole.Admin || ou.Role == OrgRole.Editor));

            if (!hasAccess)
            {
                return Forbid();
            }

            // If townId is provided, validate it matches the existing tree's town
            if (townId.HasValue && existingTree!.TownId != townId.Value)
            {
                return BadRequest(new {
                    error = "Town ID does not match the existing tree's town",
                    existingTreeTownId = existingTree.TownId,
                    providedTownId = townId.Value
                });
            }

            // Use the existing tree's town
            townId = existingTree!.TownId;
        }

        // Validate townId is provided when creating a new tree
        if (shouldCreateNewTree && !townId.HasValue)
        {
            return BadRequest(new { error = "Town ID is required when creating a new tree" });
        }

        // Validate town exists (for new trees)
        if (shouldCreateNewTree && townId.HasValue)
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
                CreateNewTree: shouldCreateNewTree,
                TreeName: treeName ?? existingTree?.Name ?? Path.GetFileNameWithoutExtension(file.FileName),
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
    /// Preview a GEDCOM file without importing — returns full linkage analysis
    /// </summary>
    [HttpPost("preview")]
    [RequestSizeLimit(100_000_000)]
    public async Task<ActionResult<GedcomPreviewResponse>> Preview(IFormFile file)
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

            var response = BuildPreviewResponse(file.FileName, file.Length, encoding ?? "UTF-8", individuals, families, warnings);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GEDCOM preview error");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // ============================================================================
    // PREVIEW ANALYSIS (pure in-memory, no DB access)
    // ============================================================================

    private const int MaxPreviewIndividuals = 5000;
    private const int MaxPreviewFamilyGroups = 2000;
    private const int MaxPreviewWarnings = 50;

    private static GedcomPreviewResponse BuildPreviewResponse(
        string fileName, long fileSize, string encoding,
        List<GedcomIndividual> individuals,
        List<GedcomFamily> families,
        List<string> warnings)
    {
        // 1. Build individual lookup (handle duplicate XREFs)
        var individualMap = new Dictionary<string, GedcomIndividual>(StringComparer.OrdinalIgnoreCase);
        var duplicateXrefs = new List<string>();
        foreach (var indi in individuals)
        {
            if (!individualMap.TryAdd(indi.Id, indi))
            {
                duplicateXrefs.Add(indi.Id);
            }
        }

        // 2. Build set of individuals referenced by FAM records
        var indiReferencedByFam = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var fam in families)
        {
            if (!string.IsNullOrEmpty(fam.HusbandId)) indiReferencedByFam.Add(fam.HusbandId);
            if (!string.IsNullOrEmpty(fam.WifeId)) indiReferencedByFam.Add(fam.WifeId);
            foreach (var childId in fam.ChildIds)
            {
                indiReferencedByFam.Add(childId);
            }
        }

        // 3. Build preview individuals with linkage flags
        var previewIndividuals = new List<GedcomPreviewIndividual>(individuals.Count);
        foreach (var indi in individuals)
        {
            var hasFAMC = indi.FamilyChildIds.Count > 0;
            var hasFAMS = indi.FamilySpouseIds.Count > 0;
            var isInFamily = hasFAMC || hasFAMS || indiReferencedByFam.Contains(indi.Id);
            previewIndividuals.Add(new GedcomPreviewIndividual
            {
                Id = indi.Id,
                GivenName = indi.GivenName,
                Surname = indi.Surname,
                FullName = indi.FullName,
                Sex = indi.Sex,
                BirthDate = indi.BirthDate?.OriginalText,
                BirthPlace = indi.BirthPlace,
                DeathDate = indi.DeathDate?.OriginalText,
                DeathPlace = indi.DeathPlace,
                Occupation = indi.Occupation,
                FamilyChildIds = indi.FamilyChildIds,
                FamilySpouseIds = indi.FamilySpouseIds,
                HasFAMC = hasFAMC,
                HasFAMS = hasFAMS,
                IsInFamily = isInFamily,
                IsOrphaned = !isInFamily
            });
        }

        // 4. Build family groups
        var familyGroups = new List<GedcomPreviewFamilyGroup>(families.Count);
        foreach (var fam in families)
        {
            var group = new GedcomPreviewFamilyGroup
            {
                FamilyId = fam.Id,
                MarriageDate = fam.MarriageDate?.OriginalText,
                MarriagePlace = fam.MarriagePlace,
                DivorceDate = fam.DivorceDate?.OriginalText,
            };

            if (!string.IsNullOrEmpty(fam.HusbandId))
            {
                if (individualMap.TryGetValue(fam.HusbandId, out var husband))
                    group.Husband = previewIndividuals.FirstOrDefault(p => p.Id == husband.Id);
                else
                    group.Issues.Add($"Husband {fam.HusbandId} not found in individuals");
            }

            if (!string.IsNullOrEmpty(fam.WifeId))
            {
                if (individualMap.TryGetValue(fam.WifeId, out var wife))
                    group.Wife = previewIndividuals.FirstOrDefault(p => p.Id == wife.Id);
                else
                    group.Issues.Add($"Wife {fam.WifeId} not found in individuals");
            }

            foreach (var childId in fam.ChildIds)
            {
                if (individualMap.TryGetValue(childId, out var child))
                {
                    var childPreview = previewIndividuals.FirstOrDefault(p => p.Id == child.Id);
                    if (childPreview != null) group.Children.Add(childPreview);
                }
                else
                {
                    group.Issues.Add($"Child {childId} not found in individuals");
                }
            }

            familyGroups.Add(group);
        }

        // 5. Compute linkage statistics
        var indisWithFAMC = individuals.Count(i => i.FamilyChildIds.Count > 0);
        var indisWithFAMS = individuals.Count(i => i.FamilySpouseIds.Count > 0);
        var indisInFamilies = previewIndividuals.Count(p => p.IsInFamily);
        var orphanedCount = previewIndividuals.Count(p => p.IsOrphaned);

        bool hasIndiFamLinks = indisWithFAMC > 0 || indisWithFAMS > 0;
        bool hasFamRecords = families.Count > 0;
        string linkingMethod;
        string linkingDesc;
        if (hasIndiFamLinks && hasFamRecords)
        {
            linkingMethod = "MIXED";
            linkingDesc = "This file uses both FAMC/FAMS tags on individuals and HUSB/WIFE/CHIL tags on family records.";
        }
        else if (hasIndiFamLinks)
        {
            linkingMethod = "FAMC_FAMS";
            linkingDesc = "This file uses FAMC/FAMS tags on individual records to link to families.";
        }
        else if (hasFamRecords)
        {
            linkingMethod = "FAM_ONLY";
            linkingDesc = "This file uses only FAM records (HUSB/WIFE/CHIL) without FAMC/FAMS tags on individuals.";
        }
        else
        {
            linkingMethod = "NONE";
            linkingDesc = "No family linkage detected. Individuals will be imported without relationships.";
        }

        var stats = new GedcomLinkageStatistics
        {
            TotalIndividuals = individuals.Count,
            IndividualsWithFAMC = indisWithFAMC,
            IndividualsWithFAMS = indisWithFAMS,
            IndividualsInFamilies = indisInFamilies,
            OrphanedCount = orphanedCount,
            TotalFamilies = families.Count,
            FamiliesWithBothSpouses = families.Count(f => !string.IsNullOrEmpty(f.HusbandId) && !string.IsNullOrEmpty(f.WifeId)),
            FamiliesWithChildren = families.Count(f => f.ChildIds.Count > 0),
            FamiliesWithNoChildren = families.Count(f => f.ChildIds.Count == 0),
            LinkingMethod = linkingMethod,
            LinkingMethodDescription = linkingDesc
        };

        // 6. Detect data quality issues
        var issues = new List<GedcomDataQualityIssue>();

        if (duplicateXrefs.Count > 0)
        {
            issues.Add(new GedcomDataQualityIssue
            {
                Severity = "Warning",
                Category = "Structure",
                Message = $"{duplicateXrefs.Count} duplicate XREF ID(s) found — only the first occurrence is used",
                AffectedIds = duplicateXrefs.Take(20).ToList()
            });
        }

        var namelessIndis = individuals.Where(i => string.IsNullOrWhiteSpace(i.FullName)).Select(i => i.Id).ToList();
        if (namelessIndis.Count > 0)
        {
            issues.Add(new GedcomDataQualityIssue
            {
                Severity = "Warning",
                Category = "Data",
                Message = $"{namelessIndis.Count} individual(s) have no name",
                AffectedIds = namelessIndis.Take(20).ToList()
            });
        }

        var emptyFamilies = families.Where(f =>
            string.IsNullOrEmpty(f.HusbandId) && string.IsNullOrEmpty(f.WifeId) && f.ChildIds.Count == 0
        ).Select(f => f.Id).ToList();
        if (emptyFamilies.Count > 0)
        {
            issues.Add(new GedcomDataQualityIssue
            {
                Severity = "Warning",
                Category = "Structure",
                Message = $"{emptyFamilies.Count} empty family record(s) with no members",
                AffectedIds = emptyFamilies.Take(20).ToList()
            });
        }

        // Missing references from family groups
        var missingRefIssues = familyGroups.SelectMany(g => g.Issues).ToList();
        if (missingRefIssues.Count > 0)
        {
            issues.Add(new GedcomDataQualityIssue
            {
                Severity = "Error",
                Category = "Linkage",
                Message = $"{missingRefIssues.Count} missing individual reference(s) in family records",
                AffectedIds = missingRefIssues.Take(20).ToList()
            });
        }

        if (orphanedCount > 0)
        {
            issues.Add(new GedcomDataQualityIssue
            {
                Severity = "Info",
                Category = "Linkage",
                Message = $"{orphanedCount} individual(s) are not linked to any family",
                AffectedIds = previewIndividuals.Where(p => p.IsOrphaned).Select(p => p.Id).Take(20).ToList()
            });
        }

        if (linkingMethod == "FAM_ONLY")
        {
            issues.Add(new GedcomDataQualityIssue
            {
                Severity = "Info",
                Category = "Linkage",
                Message = "File uses FAM records only (no FAMC/FAMS on individuals). Relationships will be resolved from family records.",
                AffectedIds = new List<string>()
            });
        }

        // 7. Assemble response with truncation
        var orphanedIndividuals = previewIndividuals.Where(p => p.IsOrphaned).ToList();
        bool familyGroupsTruncated = familyGroups.Count > MaxPreviewFamilyGroups;
        bool individualsTruncated = previewIndividuals.Count > MaxPreviewIndividuals;

        return new GedcomPreviewResponse
        {
            FileName = fileName,
            FileSize = fileSize,
            Encoding = encoding,
            IndividualCount = individuals.Count,
            FamilyCount = families.Count,
            Warnings = warnings.Take(MaxPreviewWarnings).ToList(),
            WarningCount = warnings.Count,
            LinkageStatistics = stats,
            FamilyGroups = familyGroups.Take(MaxPreviewFamilyGroups).ToList(),
            FamilyGroupsTruncated = familyGroupsTruncated,
            OrphanedIndividuals = orphanedIndividuals,
            AllIndividuals = previewIndividuals.Take(MaxPreviewIndividuals).ToList(),
            AllIndividualsTruncated = individualsTruncated,
            DataQualityIssues = issues
        };
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
