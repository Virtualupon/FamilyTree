namespace FamilyTreeApi.DTOs;

/// <summary>
/// DTO for displaying a family relationship type with trilingual names
/// </summary>
public record FamilyRelationshipTypeDto(
    int Id,
    string NameArabic,
    string NameEnglish,
    string NameNubian,
    string? Category,
    int SortOrder
);

/// <summary>
/// DTO for grouped relationship types by category
/// </summary>
public record FamilyRelationshipTypeGroupedDto(
    string Category,
    List<FamilyRelationshipTypeDto> Types
);
