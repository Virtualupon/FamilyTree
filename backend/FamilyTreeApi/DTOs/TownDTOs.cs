namespace FamilyTreeApi.DTOs;

// ============================================================================
// Town DTOs
// ============================================================================

/// <summary>
/// Summary view of a town for list display
/// </summary>
public record TownListItemDto(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? NameLocal,
    string? Country,
    int TreeCount,
    DateTime CreatedAt
);

/// <summary>
/// Full town details
/// </summary>
public record TownDetailDto(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? NameLocal,
    string? Description,
    string? Country,
    int TreeCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>
/// Request to create a new town
/// </summary>
public record CreateTownDto(
    string Name,
    string? NameEn = null,
    string? NameAr = null,
    string? NameLocal = null,
    string? Description = null,
    string? Country = null
);

/// <summary>
/// Request to update an existing town
/// </summary>
public record UpdateTownDto(
    string? Name = null,
    string? NameEn = null,
    string? NameAr = null,
    string? NameLocal = null,
    string? Description = null,
    string? Country = null
);

/// <summary>
/// Result of a CSV import operation
/// </summary>
public record TownImportResultDto(
    int TotalRows,
    int Created,
    int Skipped,
    int Errors,
    List<TownImportErrorDto> ErrorDetails
);

/// <summary>
/// Details about an error during import
/// </summary>
public record TownImportErrorDto(
    int Row,
    string Name,
    string ErrorMessage
);

/// <summary>
/// Pagination request for towns
/// </summary>
public record TownSearchDto(
    int Page = 1,
    int PageSize = 20,
    string? NameQuery = null,
    string? Country = null
);

/// <summary>
/// Statistics for a town including all family trees
/// </summary>
public record TownStatisticsDto(
    Guid TownId,
    string TownName,
    string? TownNameEn,
    string? TownNameAr,
    int TotalFamilyTrees,
    int TotalPeople,
    int TotalFamilies,
    int TotalRelationships,
    int TotalMediaFiles,
    List<FamilyTreeSummaryDto> FamilyTrees
);

/// <summary>
/// Summary of a family tree with counts for display in town overview
/// </summary>
public record FamilyTreeSummaryDto(
    Guid Id,
    string Name,
    string? Description,
    string? CoverImageUrl,
    int PeopleCount,
    int MaleCount,
    int FemaleCount,
    int FamiliesCount,
    int RelationshipsCount,
    int MediaFilesCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
