using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Services;

public class GedcomService : IGedcomService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<GedcomService> _logger;
    private readonly INameTransliterationService _transliterationService;
    private readonly IAuditLogService _auditLogService;

    public GedcomService(
        ApplicationDbContext context,
        ILogger<GedcomService> logger,
        INameTransliterationService transliterationService,
        IAuditLogService auditLogService)
    {
        _context = context;
        _logger = logger;
        _transliterationService = transliterationService;
        _auditLogService = auditLogService;
    }

    public async Task<(List<GedcomIndividual> Individuals, List<GedcomFamily> Families, List<string> Warnings)> ParseAsync(
        Stream gedcomStream,
        string? encoding = null)
    {
        var individuals = new List<GedcomIndividual>();
        var families = new List<GedcomFamily>();
        var warnings = new List<string>();

        var enc = encoding?.ToUpperInvariant() switch
        {
            "UTF-8" or "UTF8" => Encoding.UTF8,
            "ANSI" => Encoding.GetEncoding(1252),
            "ASCII" => Encoding.ASCII,
            "UNICODE" => Encoding.Unicode,
            _ => Encoding.UTF8
        };

        using var reader = new StreamReader(gedcomStream, enc);
        var lines = new List<(int Level, string? Tag, string? Xref, string? Value)>();

        string? line;
        int lineNumber = 0;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            lineNumber++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var parsed = ParseLine(line, lineNumber, warnings);
            if (parsed.HasValue)
            {
                lines.Add(parsed.Value);
            }
        }

        // Process lines into records
        GedcomIndividual? currentIndi = null;
        GedcomFamily? currentFam = null;
        string? currentContext = null;
        int contextLevel = 0;

        for (int i = 0; i < lines.Count; i++)
        {
            var (level, tag, xref, value) = lines[i];

            if (level == 0)
            {
                // Save previous record
                if (currentIndi != null) individuals.Add(currentIndi);
                if (currentFam != null) families.Add(currentFam);
                currentIndi = null;
                currentFam = null;
                currentContext = null;

                if (tag == "INDI" && xref != null)
                {
                    currentIndi = new GedcomIndividual { Id = xref };
                }
                else if (tag == "FAM" && xref != null)
                {
                    currentFam = new GedcomFamily { Id = xref };
                }
            }
            else if (currentIndi != null)
            {
                ProcessIndividualTag(currentIndi, level, tag, value, ref currentContext, ref contextLevel, warnings);
            }
            else if (currentFam != null)
            {
                ProcessFamilyTag(currentFam, level, tag, value, ref currentContext, ref contextLevel, warnings);
            }
        }

        // Don't forget last record
        if (currentIndi != null) individuals.Add(currentIndi);
        if (currentFam != null) families.Add(currentFam);

        return (individuals, families, warnings);
    }

    public async Task<GedcomImportResult> ImportAsync(
        Stream gedcomStream,
        long userId,
        GedcomImportOptions options,
        string? encoding = null)
    {
        var stopwatch = Stopwatch.StartNew();
        var warnings = new List<string>();
        var errors = new List<string>();

        try
        {
            var (individuals, families, parseWarnings) = await ParseAsync(gedcomStream, encoding);
            warnings.AddRange(parseWarnings);

            if (individuals.Count == 0)
            {
                return new GedcomImportResult(
                    false, "No individuals found in GEDCOM file",
                    0, 0, 0, warnings, errors, stopwatch.Elapsed);
            }

            // Create or get tree
            Org tree;
            if (options.ExistingTreeId.HasValue && !options.CreateNewTree)
            {
                // Use existing tree
                tree = await _context.Orgs.FindAsync(options.ExistingTreeId.Value)
                    ?? throw new InvalidOperationException($"Tree with ID {options.ExistingTreeId.Value} not found");

                _logger.LogInformation(
                    "GEDCOM import using existing tree: {TreeId} ({TreeName}) in town {TownId}",
                    tree.Id, tree.Name, tree.TownId);
            }
            else
            {
                // Create new tree
                if (!options.TownId.HasValue)
                {
                    return new GedcomImportResult(
                        false, "Town ID is required when creating a new tree",
                        0, 0, 0, warnings, errors, stopwatch.Elapsed);
                }

                var treeName = options.TreeName ?? $"GEDCOM Import {DateTime.UtcNow:yyyy-MM-dd HH:mm}";
                tree = new Org
                {
                    Id = Guid.NewGuid(),
                    Name = treeName,
                    TownId = options.TownId.Value,
                    OwnerId = userId,
                    IsPublic = false,
                    AllowCrossTreeLinking = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _context.Orgs.Add(tree);

                // Add owner as member
                var ownerMember = new OrgUser
                {
                    Id = Guid.NewGuid(),
                    OrgId = tree.Id,
                    UserId = userId,
                    Role = OrgRole.Owner,
                    JoinedAt = DateTime.UtcNow
                };
                _context.OrgUsers.Add(ownerMember);

                _logger.LogInformation(
                    "GEDCOM import creating new tree: {TreeId} ({TreeName}) in town {TownId}",
                    tree.Id, tree.Name, tree.TownId);
            }

            // Map GEDCOM IDs to created Person IDs
            var personMap = new Dictionary<string, Guid>();
            int individualsImported = 0;

            // Create persons
            foreach (var indi in individuals)
            {
                try
                {
                    var person = CreatePersonFromGedcom(indi, tree.Id, options);
                    _context.People.Add(person);
                    personMap[indi.Id] = person.Id;
                    individualsImported++;
                }
                catch (Exception ex)
                {
                    errors.Add($"Failed to import individual {indi.Id} ({indi.FullName}): {ex.Message}");
                }
            }

            await _context.SaveChangesAsync();

            // Create unions and relationships from families
            int familiesImported = 0;
            int relationshipsCreated = 0;
            // Track parent-child pairs added in this batch to prevent duplicates
            // (AnyAsync only checks DB, not the EF change tracker)
            var addedParentChildPairs = new HashSet<(Guid ParentId, Guid ChildId, RelationshipType Type)>();

            foreach (var fam in families)
            {
                try
                {
                    var result = await CreateFamilyRelationships(fam, tree.Id, personMap, addedParentChildPairs);
                    if (result.UnionCreated) familiesImported++;
                    relationshipsCreated += result.RelationshipsCreated;
                }
                catch (Exception ex)
                {
                    errors.Add($"Failed to import family {fam.Id}: {ex.Message}");
                }
            }

            await _context.SaveChangesAsync();

            await _auditLogService.LogAsync(
                userId, "Import", "Gedcom", tree.Id,
                $"GEDCOM imported: {individualsImported} people, {familiesImported} unions");

            // Generate translations for all imported persons
            _logger.LogInformation(
                "Starting name transliteration for {Count} imported persons in tree {TreeId}",
                individualsImported, tree.Id);

            try
            {
                var translitRequest = new BulkTransliterationRequest
                {
                    OrgId = tree.Id,
                    MaxPersons = individualsImported + 10, // Ensure we cover all
                    SkipComplete = true
                };

                var translitResult = await _transliterationService.BulkGenerateMissingNamesAsync(translitRequest);

                _logger.LogInformation(
                    "Transliteration complete: {Generated} names generated for {Processed} persons, {Errors} errors",
                    translitResult.TotalNamesGenerated,
                    translitResult.TotalPersonsProcessed,
                    translitResult.Errors);

                if (translitResult.Errors > 0)
                {
                    warnings.Add($"Some names could not be transliterated: {translitResult.Errors} errors");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to transliterate names after GEDCOM import");
                warnings.Add($"Name transliteration partially failed: {ex.Message}");
                // Don't fail the entire import for transliteration issues
            }

            stopwatch.Stop();
            return new GedcomImportResult(
                true,
                $"Successfully imported {individualsImported} individuals and {familiesImported} families",
                individualsImported,
                familiesImported,
                relationshipsCreated,
                warnings,
                errors,
                stopwatch.Elapsed);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GEDCOM import failed");
            errors.Add($"Import failed: {ex.Message}");
            stopwatch.Stop();
            return new GedcomImportResult(
                false, "Import failed due to an error",
                0, 0, 0, warnings, errors, stopwatch.Elapsed);
        }
    }

    private (int Level, string? Tag, string? Xref, string? Value)? ParseLine(string line, int lineNumber, List<string> warnings)
    {
        // GEDCOM line format: LEVEL [XREF] TAG [VALUE]
        // Examples:
        // 0 HEAD
        // 0 @I1@ INDI
        // 1 NAME John /Smith/
        // 2 DATE 15 MAR 1950

        line = line.Trim();
        if (string.IsNullOrEmpty(line)) return null;

        var parts = line.Split(' ', 2);
        if (parts.Length == 0 || !int.TryParse(parts[0], out int level))
        {
            warnings.Add($"Line {lineNumber}: Invalid format - cannot parse level");
            return null;
        }

        if (parts.Length == 1)
        {
            warnings.Add($"Line {lineNumber}: Missing tag");
            return null;
        }

        var remainder = parts[1];
        string? xref = null;
        string? tag = null;
        string? value = null;

        // Check for XREF (@I1@, @F1@, etc.)
        if (remainder.StartsWith("@"))
        {
            var xrefEnd = remainder.IndexOf("@ ", 1);
            if (xrefEnd > 0)
            {
                xref = remainder.Substring(0, xrefEnd + 1);
                remainder = remainder.Substring(xrefEnd + 2).TrimStart();
            }
            else if (remainder.EndsWith("@"))
            {
                // Line like "0 @I1@ INDI" with INDI as tag
                var xrefMatch = Regex.Match(remainder, @"^(@[^@]+@)\s+(\w+)(.*)$");
                if (xrefMatch.Success)
                {
                    xref = xrefMatch.Groups[1].Value;
                    tag = xrefMatch.Groups[2].Value;
                    value = xrefMatch.Groups[3].Value.Trim();
                    if (string.IsNullOrEmpty(value)) value = null;
                    return (level, tag, xref, value);
                }
            }
        }

        // Parse TAG and VALUE
        var tagParts = remainder.Split(' ', 2);
        tag = tagParts[0];
        if (tagParts.Length > 1)
        {
            value = tagParts[1];
        }

        return (level, tag, xref, value);
    }

    private void ProcessIndividualTag(GedcomIndividual indi, int level, string? tag, string? value,
        ref string? context, ref int contextLevel, List<string> warnings)
    {
        if (level == 1)
        {
            context = tag;
            contextLevel = 1;

            switch (tag)
            {
                case "NAME":
                    ParseName(indi, value);
                    break;
                case "SEX":
                    indi.Sex = value;
                    break;
                case "OCCU":
                    indi.Occupation = value;
                    break;
                case "NOTE":
                    // Notes are now stored in EntityNotes table, not inline on the entity
                    break;
                case "FAMS":
                    if (value != null) indi.FamilySpouseIds.Add(value);
                    break;
                case "FAMC":
                    if (value != null) indi.FamilyChildIds.Add(value);
                    break;
            }
        }
        else if (level == 2 && context != null)
        {
            switch (context)
            {
                case "NAME":
                    if (tag == "GIVN") indi.GivenName = value;
                    else if (tag == "SURN") indi.Surname = value;
                    break;
                case "BIRT":
                    if (tag == "DATE") indi.BirthDate = ParseDate(value);
                    else if (tag == "PLAC") indi.BirthPlace = value;
                    break;
                case "DEAT":
                    if (tag == "DATE") indi.DeathDate = ParseDate(value);
                    else if (tag == "PLAC") indi.DeathPlace = value;
                    break;
                case "NOTE":
                    // Notes are now stored in EntityNotes table, not inline on the entity
                    break;
            }
        }
    }

    private void ProcessFamilyTag(GedcomFamily fam, int level, string? tag, string? value,
        ref string? context, ref int contextLevel, List<string> warnings)
    {
        if (level == 1)
        {
            context = tag;
            contextLevel = 1;

            switch (tag)
            {
                case "HUSB":
                    fam.HusbandId = value;
                    break;
                case "WIFE":
                    fam.WifeId = value;
                    break;
                case "CHIL":
                    if (value != null) fam.ChildIds.Add(value);
                    break;
            }
        }
        else if (level == 2 && context != null)
        {
            switch (context)
            {
                case "MARR":
                    if (tag == "DATE") fam.MarriageDate = ParseDate(value);
                    else if (tag == "PLAC") fam.MarriagePlace = value;
                    break;
                case "DIV":
                    if (tag == "DATE") fam.DivorceDate = ParseDate(value);
                    break;
            }
        }
    }

    private void ParseName(GedcomIndividual indi, string? value)
    {
        if (string.IsNullOrEmpty(value)) return;

        indi.FullName = value.Replace("/", "").Trim();

        // Extract surname from /Surname/ format
        var surnameMatch = Regex.Match(value, @"/([^/]+)/");
        if (surnameMatch.Success)
        {
            indi.Surname = surnameMatch.Groups[1].Value.Trim();
            indi.GivenName = value.Substring(0, surnameMatch.Index).Trim();
        }
        else
        {
            // No surname markers, use full name
            var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                indi.GivenName = string.Join(" ", parts.Take(parts.Length - 1));
                indi.Surname = parts[^1];
            }
            else if (parts.Length == 1)
            {
                indi.GivenName = parts[0];
            }
        }
    }

    private GedcomDate? ParseDate(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;

        var result = new GedcomDate { OriginalText = value };

        // Handle modifiers
        var modifiers = new[] { "ABT", "ABOUT", "EST", "CAL", "BEF", "BEFORE", "AFT", "AFTER", "BET", "FROM", "TO" };
        foreach (var mod in modifiers)
        {
            if (value.StartsWith(mod, StringComparison.OrdinalIgnoreCase))
            {
                result.Modifier = mod;
                result.IsApproximate = mod is "ABT" or "ABOUT" or "EST" or "CAL";
                value = value.Substring(mod.Length).Trim();
                break;
            }
        }

        // Try to parse the date
        // Common formats: "15 MAR 1950", "MAR 1950", "1950"
        var dateFormats = new[]
        {
            "d MMM yyyy", "dd MMM yyyy",
            "MMM yyyy", "yyyy",
            "d MMM yy", "dd MMM yy",
            "d/M/yyyy", "M/d/yyyy",
            "yyyy-MM-dd"
        };

        foreach (var format in dateFormats)
        {
            if (DateTime.TryParseExact(value, format, CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var parsed))
            {
                result.ParsedDate = parsed;
                break;
            }
        }

        // Fallback: try to extract just the year
        if (!result.ParsedDate.HasValue)
        {
            var yearMatch = Regex.Match(value, @"\b(\d{4})\b");
            if (yearMatch.Success && int.TryParse(yearMatch.Groups[1].Value, out var year))
            {
                result.ParsedDate = new DateTime(year, 1, 1);
                result.IsApproximate = true;
            }
        }

        return result;
    }

    private Person CreatePersonFromGedcom(GedcomIndividual indi, Guid orgId, GedcomImportOptions options)
    {
        // Store only the given name (first name), NOT the full patronymic chain.
        // The full name (person + father + grandfather) is computed dynamically
        // from ParentChild relationships by search_persons_unified and the UI.
        // Using FullName as fallback only when GivenName is missing (e.g. "NAME علي //").
        var givenName = !string.IsNullOrWhiteSpace(indi.GivenName)
            ? indi.GivenName
            : indi.FullName ?? "?";

        // Detect script of the name
        var script = DetectScriptFromContent(givenName);

        var person = new Person
        {
            Id = Guid.NewGuid(),
            OrgId = orgId,
            PrimaryName = givenName,
            Sex = indi.Sex?.ToUpperInvariant() switch
            {
                "M" => Sex.Male,
                "F" => Sex.Female,
                _ => Sex.Unknown
            },
            BirthDate = indi.BirthDate?.ParsedDate,
            BirthPrecision = indi.BirthDate?.IsApproximate == true ? DatePrecision.About : DatePrecision.Exact,
            DeathDate = indi.DeathDate?.ParsedDate,
            DeathPrecision = indi.DeathDate?.IsApproximate == true ? DatePrecision.About : DatePrecision.Exact,
            Occupation = options.ImportOccupations ? indi.Occupation : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            // Set the correct column based on detected script
            NameArabic = script == "Arabic" ? givenName : null,
            NameEnglish = script == "English" ? givenName : null,
            NameNobiin = script == "Nobiin" ? givenName : null
        };

        return person;
    }

    private static string DetectScriptFromContent(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return "English";

        foreach (var ch in content)
        {
            if (ch >= '\u0600' && ch <= '\u06FF')
                return "Arabic";
            if (ch >= '\u2C80' && ch <= '\u2CFF')
                return "Nobiin";
        }

        return "English";
    }

    private async Task<(bool UnionCreated, int RelationshipsCreated)> CreateFamilyRelationships(
        GedcomFamily fam, Guid orgId, Dictionary<string, Guid> personMap,
        HashSet<(Guid ParentId, Guid ChildId, RelationshipType Type)> addedPairs)
    {
        bool unionCreated = false;
        int relationshipsCreated = 0;

        // Get spouse person IDs
        Guid? husbandId = fam.HusbandId != null && personMap.TryGetValue(fam.HusbandId, out var hId) ? hId : null;
        Guid? wifeId = fam.WifeId != null && personMap.TryGetValue(fam.WifeId, out var wId) ? wId : null;

        // Create union if we have at least one spouse
        Union? union = null;
        if (husbandId.HasValue || wifeId.HasValue)
        {
            union = new Union
            {
                Id = Guid.NewGuid(),
                OrgId = orgId,
                Type = UnionType.Marriage,
                StartDate = fam.MarriageDate?.ParsedDate,
                StartPrecision = fam.MarriageDate?.IsApproximate == true ? DatePrecision.About : DatePrecision.Exact,
                EndDate = fam.DivorceDate?.ParsedDate,
                EndPrecision = fam.DivorceDate?.IsApproximate == true ? DatePrecision.About : DatePrecision.Exact,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _context.Unions.Add(union);
            unionCreated = true;

            // Add spouses to union
            if (husbandId.HasValue)
            {
                _context.UnionMembers.Add(new UnionMember
                {
                    Id = Guid.NewGuid(),
                    UnionId = union.Id,
                    PersonId = husbandId.Value,
                    Role = "Husband",
                    CreatedAt = DateTime.UtcNow
                });
            }

            if (wifeId.HasValue)
            {
                _context.UnionMembers.Add(new UnionMember
                {
                    Id = Guid.NewGuid(),
                    UnionId = union.Id,
                    PersonId = wifeId.Value,
                    Role = "Wife",
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // Create parent-child relationships
        foreach (var childRef in fam.ChildIds)
        {
            if (!personMap.TryGetValue(childRef, out var childId)) continue;

            if (husbandId.HasValue)
            {
                var key = (husbandId.Value, childId, RelationshipType.Biological);
                if (!addedPairs.Contains(key))
                {
                    // Also check DB for pre-existing relationships (when importing into existing tree)
                    var existsInDb = await _context.ParentChildren.AnyAsync(pc =>
                        pc.ParentId == husbandId.Value && pc.ChildId == childId && pc.RelationshipType == RelationshipType.Biological);

                    if (!existsInDb)
                    {
                        _context.ParentChildren.Add(new ParentChild
                        {
                            Id = Guid.NewGuid(),
                            ParentId = husbandId.Value,
                            ChildId = childId,
                            RelationshipType = RelationshipType.Biological,
                            CreatedAt = DateTime.UtcNow
                        });
                        relationshipsCreated++;
                    }
                    addedPairs.Add(key);
                }
            }

            if (wifeId.HasValue)
            {
                var key = (wifeId.Value, childId, RelationshipType.Biological);
                if (!addedPairs.Contains(key))
                {
                    var existsInDb = await _context.ParentChildren.AnyAsync(pc =>
                        pc.ParentId == wifeId.Value && pc.ChildId == childId && pc.RelationshipType == RelationshipType.Biological);

                    if (!existsInDb)
                    {
                        _context.ParentChildren.Add(new ParentChild
                        {
                            Id = Guid.NewGuid(),
                            ParentId = wifeId.Value,
                            ChildId = childId,
                            RelationshipType = RelationshipType.Biological,
                            CreatedAt = DateTime.UtcNow
                        });
                        relationshipsCreated++;
                    }
                    addedPairs.Add(key);
                }
            }
        }

        return (unionCreated, relationshipsCreated);
    }
}
