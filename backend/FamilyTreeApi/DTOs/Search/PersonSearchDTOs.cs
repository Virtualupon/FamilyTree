// FamilyTreeApi/DTOs/Search/PersonSearchDtos.cs
#nullable enable
using System;
using System.Collections.Generic;

namespace FamilyTreeApi.DTOs.Search;

// ============================================================================
// REQUEST DTOs
// ============================================================================

/// <summary>
/// Request parameters for unified person search
/// </summary>
public record PersonSearchRequest
{
    /// <summary>Search query text (multilingual)</summary>
    public string? Query { get; init; }

    /// <summary>Where to search: 'auto', 'name', 'arabic', 'latin', 'coptic', 'nobiin', 'all'</summary>
    public string SearchIn { get; init; } = "auto";

    /// <summary>Filter by family tree (organization)</summary>
    public Guid? TreeId { get; init; }

    /// <summary>Filter by town</summary>
    public Guid? TownId { get; init; }

    /// <summary>Filter by nationality (country code, e.g., "EG", "US")</summary>
    public string? Nationality { get; init; }

    /// <summary>Filter by family</summary>
    public Guid? FamilyId { get; init; }

    /// <summary>Filter by sex: 'Male', 'Female', 'Unknown'</summary>
    public string? Sex { get; init; }

    /// <summary>Filter by living status</summary>
    public bool? IsLiving { get; init; }

    /// <summary>Filter by birth year range (from)</summary>
    public int? BirthYearFrom { get; init; }

    /// <summary>Filter by birth year range (to)</summary>
    public int? BirthYearTo { get; init; }

    /// <summary>Page number (1-based)</summary>
    public int Page { get; init; } = 1;

    /// <summary>Page size (default 20, max 100)</summary>
    public int PageSize { get; init; } = 20;
}

/// <summary>
/// Request parameters for relationship path finding
/// </summary>
public record RelationshipPathRequest
{
    /// <summary>First person ID</summary>
    public Guid Person1Id { get; init; }

    /// <summary>Second person ID</summary>
    public Guid Person2Id { get; init; }

    /// <summary>Optional tree filter</summary>
    public Guid? TreeId { get; init; }

    /// <summary>Maximum search depth (default 15)</summary>
    public int MaxDepth { get; init; } = 15;
}

/// <summary>
/// Request parameters for family tree data
/// </summary>
public record FamilyTreeDataRequest
{
    /// <summary>Root person to start from</summary>
    public Guid RootPersonId { get; init; }

    /// <summary>View mode: 'pedigree', 'descendants', 'hourglass'</summary>
    public string ViewMode { get; init; } = "pedigree";

    /// <summary>Number of generations to include</summary>
    public int Generations { get; init; } = 3;

    /// <summary>Whether to include spouses</summary>
    public bool IncludeSpouses { get; init; } = true;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/// <summary>
/// Paginated search results for persons
/// </summary>
public record PersonSearchResult
{
    public int Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)Total / PageSize) : 0;
    public bool HasNextPage => Page < TotalPages;
    public bool HasPreviousPage => Page > 1;
    public List<PersonSearchItemDto> Items { get; init; } = new();
}

/// <summary>
/// Single person item in search results
/// </summary>
public record PersonSearchItemDto
{
    public Guid Id { get; init; }
    public string? PrimaryName { get; init; }
    public string? NameArabic { get; init; }
    public string? NameEnglish { get; init; }
    public string? NameNobiin { get; init; }
    // Father's names
    public Guid? FatherId { get; init; }
    public string? FatherNameArabic { get; init; }
    public string? FatherNameEnglish { get; init; }
    public string? FatherNameNobiin { get; init; }
    // Grandfather's names
    public Guid? GrandfatherId { get; init; }
    public string? GrandfatherNameArabic { get; init; }
    public string? GrandfatherNameEnglish { get; init; }
    public string? GrandfatherNameNobiin { get; init; }
    public int Sex { get; init; }
    public DateTime? BirthDate { get; init; }
    public int? BirthPrecision { get; init; }
    public DateTime? DeathDate { get; init; }
    public int? DeathPrecision { get; init; }
    public string? BirthPlaceName { get; init; }
    public string? DeathPlaceName { get; init; }
    public string? Nationality { get; init; }
    public bool IsLiving { get; init; }
    public Guid? FamilyId { get; init; }
    public string? FamilyName { get; init; }
    public Guid OrgId { get; init; }
    public string? TreeName { get; init; }
    public Guid? TownId { get; init; }
    public string? TownName { get; init; }
    public string? TownNameEn { get; init; }
    public string? TownNameAr { get; init; }
    // Country info (from Nationality)
    public string? CountryCode { get; init; }
    public string? CountryNameEn { get; init; }
    public string? CountryNameAr { get; init; }
    public List<PersonNameSearchDto> Names { get; init; } = new();
    public int ParentsCount { get; init; }
    public int ChildrenCount { get; init; }
    public int SpousesCount { get; init; }
    public int MediaCount { get; init; }
    public Guid? AvatarMediaId { get; init; }
    public string? AvatarUrl { get; init; }

    // Computed properties
    public int? BirthYear => BirthDate?.Year;
    public int? DeathYear => DeathDate?.Year;
    public string? LifeSpan => GetLifeSpan();

    private string? GetLifeSpan()
    {
        if (!BirthYear.HasValue && !DeathYear.HasValue) return null;
        var birth = BirthYear?.ToString() ?? "?";
        if (IsLiving) return $"b. {birth}";
        var death = DeathYear?.ToString() ?? "?";
        return $"{birth} - {death}";
    }
}

/// <summary>
/// Person name in search results
/// </summary>
public record PersonNameSearchDto
{
    public Guid Id { get; init; }
    public string? FullName { get; init; }
    public string? GivenName { get; init; }
    public string? MiddleName { get; init; }
    public string? Surname { get; init; }
    public string? Script { get; init; }
    public int NameType { get; init; }  // 0 = Primary
    public string? Transliteration { get; init; }
}

/// <summary>
/// Relationship path result - simplified with direct relationship labels
/// </summary>
public record RelationshipPathResult
{
    /// <summary>Whether a path was found</summary>
    public bool PathFound { get; init; }

    /// <summary>Relationship type code (e.g., 'sibling', 'parent', 'cousin')</summary>
    public string RelationshipType { get; init; } = string.Empty;

    /// <summary>Human-readable relationship label (e.g., 'Brother', 'Father', 'Cousin')</summary>
    public string RelationshipLabel { get; init; } = string.Empty;

    /// <summary>The i18n key for the relationship name (e.g., "relationship.father")</summary>
    public string RelationshipNameKey { get; init; } = string.Empty;

    /// <summary>Number of steps in the path</summary>
    public int PathLength { get; init; }

    /// <summary>Common ancestor ID if applicable (e.g., for siblings)</summary>
    public Guid? CommonAncestorId { get; init; }

    /// <summary>Array of person IDs in the path</summary>
    public Guid[] PathIds { get; init; } = Array.Empty<Guid>();
}

/// <summary>
/// Family tree data result
/// </summary>
public record FamilyTreeDataResult
{
    public Guid RootPersonId { get; init; }
    public string ViewMode { get; init; } = "pedigree";
    public int TotalPersons { get; init; }
    public List<TreePersonDto> Persons { get; init; } = new();
}

/// <summary>
/// Person in family tree view
/// </summary>
public record TreePersonDto
{
    public Guid Id { get; init; }
    public string? PrimaryName { get; init; }

    /// <summary>Name in Arabic script</summary>
    public string? NameArabic { get; init; }

    /// <summary>Name in English/Latin script</summary>
    public string? NameEnglish { get; init; }

    /// <summary>Name in Nobiin (Coptic) script</summary>
    public string? NameNobiin { get; init; }

    public int Sex { get; init; }
    public DateTime? BirthDate { get; init; }
    public DateTime? DeathDate { get; init; }
    public string? BirthPlace { get; init; }
    public string? DeathPlace { get; init; }
    public bool IsLiving { get; init; }
    public int GenerationLevel { get; init; }
    public string? RelationshipType { get; init; }
    public Guid? ParentId { get; init; }
    public Guid? SpouseUnionId { get; init; }

    /// <summary>Avatar/profile picture media ID</summary>
    public Guid? AvatarMediaId { get; init; }

    /// <summary>Legacy names collection - kept for backward compatibility</summary>
    [Obsolete("Use NameArabic, NameEnglish, NameNobiin directly")]
    public List<PersonNameSearchDto> Names { get; init; } = new();

    // Computed
    public int? BirthYear => BirthDate?.Year;
    public int? DeathYear => DeathDate?.Year;
}

/// <summary>
/// Person details result (full profile)
/// </summary>
public record PersonDetailsResult
{
    public Guid Id { get; init; }
    public string? PrimaryName { get; init; }
    public int Sex { get; init; }
    public DateTime? BirthDate { get; init; }
    public int? BirthPrecision { get; init; }
    public DateTime? DeathDate { get; init; }
    public int? DeathPrecision { get; init; }
    public Guid? BirthPlaceId { get; init; }
    public string? BirthPlaceName { get; init; }
    public Guid? DeathPlaceId { get; init; }
    public string? DeathPlaceName { get; init; }
    public bool IsLiving { get; init; }
    public string? Notes { get; init; }
    public Guid? FamilyId { get; init; }
    public string? FamilyName { get; init; }
    public Guid OrgId { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }

    public List<PersonNameSearchDto> Names { get; init; } = new();
    public List<RelatedPersonDto> Parents { get; init; } = new();
    public List<RelatedPersonDto> Children { get; init; } = new();
    public List<SpouseDto> Spouses { get; init; } = new();
    public List<RelatedPersonDto> Siblings { get; init; } = new();
}

/// <summary>
/// Related person (parent, child, sibling)
/// </summary>
public record RelatedPersonDto
{
    public Guid? RelationshipId { get; init; }
    public Guid PersonId { get; init; }
    public string? Name { get; init; }
    public int? Sex { get; init; }
    public string? RelationshipType { get; init; }
    public int? BirthYear { get; init; }
    public int? DeathYear { get; init; }
    public bool IsLiving { get; init; }
    public bool? IsFullSibling { get; init; }
}

/// <summary>
/// Spouse information
/// </summary>
public record SpouseDto
{
    public Guid UnionId { get; init; }
    public Guid PersonId { get; init; }
    public string? Name { get; init; }
    public int? Sex { get; init; }
    public string? UnionType { get; init; }
    public DateTime? StartDate { get; init; }
    public DateTime? EndDate { get; init; }
    public int? BirthYear { get; init; }
    public int? DeathYear { get; init; }
    public bool IsLiving { get; init; }
}