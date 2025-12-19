using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// ============================================================================
// PERSON DTOs
// ============================================================================

public record PersonListItemDto(
    Guid Id,
    string? PrimaryName,
    Sex? Sex,
    DateTime? BirthDate,
    DatePrecision BirthPrecision,
    DateTime? DeathDate,
    DatePrecision DeathPrecision,
    string? BirthPlace,
    string? DeathPlace,
    bool IsVerified,
    bool NeedsReview
);

public record PersonResponseDto(
    Guid Id,
    Guid OrgId,
    string? PrimaryName,
    Sex? Sex,
    string? Gender,
    DateTime? BirthDate,
    DatePrecision BirthPrecision,
    Guid? BirthPlaceId,
    string? BirthPlace,
    DateTime? DeathDate,
    DatePrecision DeathPrecision,
    Guid? DeathPlaceId,
    string? DeathPlace,
    PrivacyLevel PrivacyLevel,
    string? Occupation,
    string? Education,
    string? Religion,
    string? Nationality,
    string? Ethnicity,
    string? Notes,
    bool IsVerified,
    bool NeedsReview,
    bool HasConflict,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<PersonNameDto> Names
);

public record CreatePersonDto(
    Guid? TreeId = null,  // Optional: for SuperAdmin/Admin to specify which tree
    string? PrimaryName = null,
    Sex? Sex = null,
    string? Gender = null,
    DateTime? BirthDate = null,
    DatePrecision BirthPrecision = DatePrecision.Exact,
    Guid? BirthPlaceId = null,
    DateTime? DeathDate = null,
    DatePrecision DeathPrecision = DatePrecision.Exact,
    Guid? DeathPlaceId = null,
    PrivacyLevel PrivacyLevel = PrivacyLevel.FamilyOnly,
    string? Occupation = null,
    string? Education = null,
    string? Religion = null,
    string? Nationality = null,
    string? Ethnicity = null,
    string? Notes = null,
    List<PersonNameDto>? Names = null
);

public record UpdatePersonDto(
    string? PrimaryName = null,
    Sex? Sex = null,
    string? Gender = null,
    DateTime? BirthDate = null,
    DatePrecision? BirthPrecision = null,
    Guid? BirthPlaceId = null,
    DateTime? DeathDate = null,
    DatePrecision? DeathPrecision = null,
    Guid? DeathPlaceId = null,
    PrivacyLevel? PrivacyLevel = null,
    string? Occupation = null,
    string? Education = null,
    string? Religion = null,
    string? Nationality = null,
    string? Ethnicity = null,
    string? Notes = null,
    bool? IsVerified = null,
    bool? NeedsReview = null
);

public record PersonNameDto(
    Guid? Id,
    string? Script,
    string? Given,
    string? Middle,
    string? Family,
    string? Full,
    string? Transliteration,
    NameType Type = NameType.Primary
);

public record PersonSearchDto(
    Guid? TreeId = null,  // Optional: for SuperAdmin/Admin to specify which tree
    string? NameQuery = null,
    Sex? Sex = null,
    DateTime? BirthDateFrom = null,
    DateTime? BirthDateTo = null,
    DateTime? DeathDateFrom = null,
    DateTime? DeathDateTo = null,
    Guid? BirthPlaceId = null,
    Guid? DeathPlaceId = null,
    PrivacyLevel? PrivacyLevel = null,
    bool? IsVerified = null,
    bool? NeedsReview = null,
    int Page = 1,
    int PageSize = 20
);

// ============================================================================
// GENERIC PAGED RESULT
// ============================================================================

public record PagedResult<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);