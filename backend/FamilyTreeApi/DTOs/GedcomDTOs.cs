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

// ============================================================================
// GEDCOM PREVIEW DTOs
// ============================================================================

/// <summary>
/// Full preview response returned by the preview endpoint
/// </summary>
public class GedcomPreviewResponse
{
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string Encoding { get; set; } = "UTF-8";
    public int IndividualCount { get; set; }
    public int FamilyCount { get; set; }
    public List<string> Warnings { get; set; } = new();
    public int WarningCount { get; set; }
    public GedcomLinkageStatistics LinkageStatistics { get; set; } = new();
    public List<GedcomPreviewFamilyGroup> FamilyGroups { get; set; } = new();
    public bool FamilyGroupsTruncated { get; set; }
    public List<GedcomPreviewIndividual> OrphanedIndividuals { get; set; } = new();
    public List<GedcomPreviewIndividual> AllIndividuals { get; set; } = new();
    public bool AllIndividualsTruncated { get; set; }
    public List<GedcomDataQualityIssue> DataQualityIssues { get; set; } = new();
}

/// <summary>
/// Statistics about how individuals and families are linked in the GEDCOM file
/// </summary>
public class GedcomLinkageStatistics
{
    public int TotalIndividuals { get; set; }
    public int IndividualsWithFAMC { get; set; }
    public int IndividualsWithFAMS { get; set; }
    public int IndividualsInFamilies { get; set; }
    public int OrphanedCount { get; set; }
    public int TotalFamilies { get; set; }
    public int FamiliesWithBothSpouses { get; set; }
    public int FamiliesWithChildren { get; set; }
    public int FamiliesWithNoChildren { get; set; }
    /// <summary>
    /// "FAMC_FAMS" | "FAM_ONLY" | "MIXED" | "NONE"
    /// </summary>
    public string LinkingMethod { get; set; } = "NONE";
    public string LinkingMethodDescription { get; set; } = string.Empty;
}

/// <summary>
/// A resolved family group for preview display
/// </summary>
public class GedcomPreviewFamilyGroup
{
    public string FamilyId { get; set; } = string.Empty;
    public GedcomPreviewIndividual? Husband { get; set; }
    public GedcomPreviewIndividual? Wife { get; set; }
    public List<GedcomPreviewIndividual> Children { get; set; } = new();
    public string? MarriageDate { get; set; }
    public string? MarriagePlace { get; set; }
    public string? DivorceDate { get; set; }
    public List<string> Issues { get; set; } = new();
}

/// <summary>
/// Individual preview with linkage flags
/// </summary>
public class GedcomPreviewIndividual
{
    public string Id { get; set; } = string.Empty;
    public string? GivenName { get; set; }
    public string? Surname { get; set; }
    public string? FullName { get; set; }
    public string? Sex { get; set; }
    public string? BirthDate { get; set; }
    public string? BirthPlace { get; set; }
    public string? DeathDate { get; set; }
    public string? DeathPlace { get; set; }
    public string? Occupation { get; set; }
    public List<string> FamilyChildIds { get; set; } = new();
    public List<string> FamilySpouseIds { get; set; } = new();
    public bool HasFAMC { get; set; }
    public bool HasFAMS { get; set; }
    public bool IsInFamily { get; set; }
    public bool IsOrphaned { get; set; }
}

/// <summary>
/// A data quality issue detected during GEDCOM preview analysis
/// </summary>
public class GedcomDataQualityIssue
{
    /// <summary>"Error" | "Warning" | "Info"</summary>
    public string Severity { get; set; } = "Info";
    /// <summary>"Linkage" | "Data" | "Structure"</summary>
    public string Category { get; set; } = "Data";
    public string Message { get; set; } = string.Empty;
    public List<string> AffectedIds { get; set; } = new();
}
