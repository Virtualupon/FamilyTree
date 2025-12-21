namespace FamilyTreeApi.DTOs;

// ============================================================================
// FAMILY DTOs
// ============================================================================

/// <summary>
/// Full family response with all details
/// </summary>
public record FamilyResponse(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? NameLocal,
    string? Description,
    Guid OrgId,
    string OrgName,
    Guid TownId,
    string TownName,
    Guid? PatriarchId,
    string? PatriarchName,
    Guid? MatriarchId,
    string? MatriarchName,
    string? Color,
    int SortOrder,
    int MemberCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>
/// Lightweight family item for lists/dropdowns
/// </summary>
public record FamilyListItem(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? NameLocal,
    string? Color,
    int MemberCount,
    int SortOrder
);

/// <summary>
/// Request to create a new family.
/// OrgId is REQUIRED - every family must belong to a tree.
/// </summary>
public record CreateFamilyRequest(
    string Name,
    Guid OrgId,
    string? NameEn = null,
    string? NameAr = null,
    string? NameLocal = null,
    string? Description = null,
    Guid? PatriarchId = null,
    Guid? MatriarchId = null,
    string? Color = null,
    int SortOrder = 0
);

/// <summary>
/// Request to update an existing family
/// </summary>
public record UpdateFamilyRequest(
    string? Name = null,
    string? NameEn = null,
    string? NameAr = null,
    string? NameLocal = null,
    string? Description = null,
    Guid? PatriarchId = null,
    Guid? MatriarchId = null,
    string? Color = null,
    int? SortOrder = null
);

/// <summary>
/// Family with its members for detailed view
/// </summary>
public record FamilyWithMembersResponse(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? NameLocal,
    string? Description,
    Guid OrgId,
    string OrgName,
    Guid TownId,
    string TownName,
    Guid? PatriarchId,
    string? PatriarchName,
    Guid? MatriarchId,
    string? MatriarchName,
    string? Color,
    int SortOrder,
    List<FamilyMemberDto> Members,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>
/// Lightweight member info for family member lists
/// </summary>
public record FamilyMemberDto(
    Guid Id,
    string? PrimaryName,
    int Sex,
    string? BirthDate,
    string? DeathDate,
    bool IsLiving
);

/// <summary>
/// Request to assign/remove a person to/from a family
/// </summary>
public record AssignFamilyRequest(
    Guid PersonId,
    Guid? FamilyId  // null to remove from family
);
