namespace FamilyTreeApi.DTOs;

/// <summary>
/// Result of a GEDCOM file import operation
/// </summary>
public record GedcomImportResult(
    bool Success,
    string Message,
    int IndividualsImported,
    int FamiliesImported,
    int RelationshipsCreated,
    List<string> Warnings,
    List<string> Errors,
    TimeSpan Duration
);

/// <summary>
/// Options for controlling GEDCOM import behavior
/// </summary>
public record GedcomImportOptions(
    bool CreateNewTree = true,
    string? TreeName = null,
    Guid? ExistingTreeId = null,
    Guid? TownId = null,
    bool MergeExisting = false,
    bool ImportNotes = true,
    bool ImportPlaces = true,
    bool ImportOccupations = true
);

/// <summary>
/// Parsed individual from GEDCOM
/// </summary>
public class GedcomIndividual
{
    public string Id { get; set; } = string.Empty;
    public string? GivenName { get; set; }
    public string? Surname { get; set; }
    public string? FullName { get; set; }
    public string? Sex { get; set; }
    public GedcomDate? BirthDate { get; set; }
    public string? BirthPlace { get; set; }
    public GedcomDate? DeathDate { get; set; }
    public string? DeathPlace { get; set; }
    public string? Occupation { get; set; }
    public string? Notes { get; set; }
    public List<string> FamilySpouseIds { get; set; } = new();
    public List<string> FamilyChildIds { get; set; } = new();
}

/// <summary>
/// Parsed family from GEDCOM
/// </summary>
public class GedcomFamily
{
    public string Id { get; set; } = string.Empty;
    public string? HusbandId { get; set; }
    public string? WifeId { get; set; }
    public List<string> ChildIds { get; set; } = new();
    public GedcomDate? MarriageDate { get; set; }
    public string? MarriagePlace { get; set; }
    public GedcomDate? DivorceDate { get; set; }
}

/// <summary>
/// Parsed date from GEDCOM (supports various formats)
/// </summary>
public class GedcomDate
{
    public string OriginalText { get; set; } = string.Empty;
    public DateTime? ParsedDate { get; set; }
    public bool IsApproximate { get; set; }
    public bool IsRange { get; set; }
    public string? Modifier { get; set; } // ABT, BEF, AFT, etc.
}
