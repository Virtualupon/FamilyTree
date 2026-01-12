using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// ============================================================================
// FAMILY TREE DTOs
// ============================================================================

public record FamilyTreeResponse(
    Guid Id,
    string Name,
    string? Description,
    bool IsPublic,
    bool AllowCrossTreeLinking,
    string? CoverImageUrl,
    long? OwnerId,
    string? OwnerName,
    Guid TownId,       // REQUIRED: Every tree belongs to a town
    string TownName,   // REQUIRED: Town name for display
    int MemberCount,
    int PersonCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record FamilyTreeListItem(
    Guid Id,
    string Name,
    string? Description,
    bool IsPublic,
    string? CoverImageUrl,
    int PersonCount,
    OrgRole? UserRole,
    Guid TownId,       // REQUIRED: Every tree belongs to a town
    string TownName,   // REQUIRED: Town name for filtering/display
    DateTime CreatedAt
);

/// <summary>
/// Request to create a new family tree.
/// TownId is REQUIRED - every tree must belong to a town per hierarchy rules.
/// </summary>
public record CreateFamilyTreeRequest(
    string Name,
    Guid TownId,  // REQUIRED: Every tree must belong to a town
    string? Description = null,
    bool IsPublic = false,
    bool AllowCrossTreeLinking = true
);

/// <summary>
/// Request to update a family tree.
/// Using class instead of record for proper JSON deserialization with System.Text.Json.
/// </summary>
public class UpdateFamilyTreeRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool? IsPublic { get; set; }
    public bool? AllowCrossTreeLinking { get; set; }
    public string? CoverImageUrl { get; set; }
    public Guid? TownId { get; set; }
}

// ============================================================================
// TREE MEMBER DTOs
// ============================================================================

public record TreeMemberResponse(
    Guid Id,
    long UserId,
    string Email,
    string? FirstName,
    string? LastName,
    OrgRole Role,
    DateTime JoinedAt
);

public record AddTreeMemberRequest(
    long UserId,
    OrgRole Role = OrgRole.Viewer
);

public record UpdateTreeMemberRoleRequest(
    OrgRole Role
);

// ============================================================================
// INVITATION DTOs
// ============================================================================

public record TreeInvitationResponse(
    Guid Id,
    string Email,
    OrgRole Role,
    string InvitedByName,
    DateTime ExpiresAt,
    bool IsAccepted,
    DateTime CreatedAt
);

public record CreateInvitationRequest(
    string Email,
    OrgRole Role = OrgRole.Viewer,
    int ExpirationDays = 7
);

public record AcceptInvitationRequest(
    string Token
);

// ============================================================================
// PERSON LINK DTOs (Cross-tree linking)
// ============================================================================

public record PersonLinkResponse(
    Guid Id,
    Guid SourcePersonId,
    string? SourcePersonName,
    Guid SourceTreeId,
    string? SourceTreeName,
    Guid TargetPersonId,
    string? TargetPersonName,
    Guid TargetTreeId,
    string? TargetTreeName,
    PersonLinkType LinkType,
    int Confidence,
    string? Notes,
    PersonLinkStatus Status,
    string? CreatedByName,
    string? ApprovedByName,
    DateTime CreatedAt
);

public record CreatePersonLinkRequest(
    Guid SourcePersonId,
    Guid TargetPersonId,
    PersonLinkType LinkType = PersonLinkType.SamePerson,
    int Confidence = 100,
    string? Notes = null
);

public record ApprovePersonLinkRequest(
    bool Approve,
    string? Notes = null
);

/// <summary>
/// Summary of a cross-tree link for D3 visualization
/// </summary>
public record PersonLinkSummaryDto(
    Guid LinkId,
    PersonLinkType LinkType,
    Guid LinkedPersonId,
    string LinkedPersonName,
    Guid LinkedTreeId,
    string LinkedTreeName,
    Guid? LinkedTownId,
    string? LinkedTownName
);

// ============================================================================
// ADMIN MANAGEMENT DTOs
// ============================================================================

// Tree-level assignments (legacy - still supported)
public record AdminAssignmentResponse(
    Guid Id,
    long UserId,
    string? UserEmail,
    string? UserName,
    Guid TreeId,
    string? TreeName,
    string? AssignedByName,
    DateTime AssignedAt
);

public record CreateAdminAssignmentRequest(
    long UserId,
    Guid TreeId
);

// Town-level assignments (new - town-scoped admin access)
public record AdminTownAssignmentResponse(
    Guid Id,
    long UserId,
    string? UserEmail,
    string? UserName,
    Guid TownId,
    string? TownName,
    string? TownNameEn,
    string? TownNameAr,
    string? TownNameLocal,
    int TreeCount,        // Number of trees in this town
    string? AssignedByName,
    DateTime AssignedAt,
    bool IsActive
);

public record CreateAdminTownAssignmentRequest(
    long UserId,
    Guid TownId
);

public record CreateAdminTownAssignmentBulkRequest(
    long UserId,
    List<Guid> TownIds  // Multi-select support
);

public record AdminUserWithTownsResponse(
    long UserId,
    string Email,
    string? FirstName,
    string? LastName,
    string SystemRole,
    List<AdminTownAssignmentResponse> TownAssignments,
    DateTime CreatedAt
);

/// <summary>
/// Response after login for Admin users - includes assigned towns
/// </summary>
public record AdminLoginResponse(
    List<TownSummaryDto> AssignedTowns,
    bool RequiresTownSelection // True if admin has multiple towns
);

public record TownSummaryDto(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? NameLocal,
    int TreeCount
);

/// <summary>
/// Request to select a town after login (for multi-town admins)
/// </summary>
public record SelectTownRequest(
    Guid TownId
);

/// <summary>
/// Response after selecting a town - includes updated token
/// </summary>
public record SelectTownResponse(
    string AccessToken,
    Guid SelectedTownId,
    string TownName
);

public record UserSystemRoleResponse(
    long UserId,
    string Email,
    string? FirstName,
    string? LastName,
    string SystemRole,
    int TreeCount,
    DateTime CreatedAt
);

public record UpdateSystemRoleRequest(
    string SystemRole // "User", "Admin", "SuperAdmin"
);

public record CreateUserRequest(
    string Email,
    string Password,
    string? FirstName = null,
    string? LastName = null,
    string SystemRole = "User" // "User", "Admin", "SuperAdmin"
);


public record AddPersonMediaRequest(
    Guid MediaId,
    bool IsPrimary = false,
    int SortOrder = 0,
    string? Notes = null
);

public record UpdatePersonMediaRequest(
    bool? IsPrimary = null,
    int? SortOrder = null,
    string? Notes = null
);