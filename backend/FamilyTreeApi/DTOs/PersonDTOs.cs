using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// ============================================================================
// PERSON DTOs
// ============================================================================

public record PersonListItemDto(
    Guid Id,
    string? PrimaryName,
    string? NameArabic,
    string? NameEnglish,
    string? NameNobiin,
    Sex? Sex,
    DateTime? BirthDate,
    DatePrecision BirthPrecision,
    DateTime? DeathDate,
    DatePrecision DeathPrecision,
    string? BirthPlace,
    string? DeathPlace,
    bool IsVerified,
    bool NeedsReview,
    int MediaCount = 0,
    Guid? AvatarMediaId = null,
    string? AvatarUrl = null
);

public record PersonResponseDto(
    Guid Id,
    Guid OrgId,
    string? PrimaryName,
    string? NameArabic,
    string? NameEnglish,
    string? NameNobiin,
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
    Guid? AvatarMediaId = null,
    string? AvatarUrl = null,
    string? AvatarBase64 = null
);

public class CreatePersonDto
{
    /// <summary>Optional: for SuperAdmin/Admin to specify which tree</summary>
    public Guid? TreeId { get; set; }
    public string? PrimaryName { get; set; }
    public string? NameArabic { get; set; }
    public string? NameEnglish { get; set; }
    public string? NameNobiin { get; set; }
    public Sex? Sex { get; set; }
    public string? Gender { get; set; }
    public DateTime? BirthDate { get; set; }
    public DatePrecision BirthPrecision { get; set; } = DatePrecision.Exact;
    public Guid? BirthPlaceId { get; set; }
    public DateTime? DeathDate { get; set; }
    public DatePrecision DeathPrecision { get; set; } = DatePrecision.Exact;
    public Guid? DeathPlaceId { get; set; }
    public PrivacyLevel PrivacyLevel { get; set; } = PrivacyLevel.FamilyOnly;
    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Religion { get; set; }
    public string? Nationality { get; set; }
    public string? Ethnicity { get; set; }
    public string? Notes { get; set; }
}

public class UpdatePersonDto
{
    public string? PrimaryName { get; set; }
    public string? NameArabic { get; set; }
    public string? NameEnglish { get; set; }
    public string? NameNobiin { get; set; }
    public Sex? Sex { get; set; }
    public string? Gender { get; set; }
    public DateTime? BirthDate { get; set; }
    public DatePrecision? BirthPrecision { get; set; }
    public Guid? BirthPlaceId { get; set; }
    public DateTime? DeathDate { get; set; }
    public DatePrecision? DeathPrecision { get; set; }
    public Guid? DeathPlaceId { get; set; }
    public PrivacyLevel? PrivacyLevel { get; set; }
    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Religion { get; set; }
    public string? Nationality { get; set; }
    public string? Ethnicity { get; set; }
    public string? Notes { get; set; }
    public bool? IsVerified { get; set; }
    public bool? NeedsReview { get; set; }
}

/// <summary>
/// Legacy DTO for backward compatibility. Use direct name columns instead.
/// </summary>
[Obsolete("Use NameArabic, NameEnglish, NameNobiin columns directly on Person")]
public class PersonNameDto
{
    public Guid? Id { get; set; }
    public string? Script { get; set; }
    public string? Given { get; set; }
    public string? Middle { get; set; }
    public string? Family { get; set; }
    public string? Full { get; set; }
    public string? Transliteration { get; set; }
    public NameType Type { get; set; } = NameType.Primary;
}

public class PersonSearchDto
{
    /// <summary>Optional: for SuperAdmin/Admin to specify which tree</summary>
    public Guid? TreeId { get; set; }
    /// <summary>Optional: filter by town (searches across all trees in the town)</summary>
    public Guid? TownId { get; set; }
    public string? NameQuery { get; set; }
    public Sex? Sex { get; set; }
    public DateTime? BirthDateFrom { get; set; }
    public DateTime? BirthDateTo { get; set; }
    public DateTime? DeathDateFrom { get; set; }
    public DateTime? DeathDateTo { get; set; }
    public Guid? BirthPlaceId { get; set; }
    public Guid? DeathPlaceId { get; set; }
    public PrivacyLevel? PrivacyLevel { get; set; }
    public bool? IsVerified { get; set; }
    public bool? NeedsReview { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

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