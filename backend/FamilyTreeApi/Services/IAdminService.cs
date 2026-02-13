// File: Services/IAdminService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Admin operations (Developer/SuperAdmin only).
/// All methods require UserContext for service-layer authorization (defense in depth).
/// </summary>
public interface IAdminService
{
    // User Management
    Task<ServiceResult<List<UserSystemRoleResponse>>> GetAllUsersAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UserSystemRoleResponse>> CreateUserAsync(
        CreateUserRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UserSystemRoleResponse>> UpdateUserSystemRoleAsync(
        long userId,
        UpdateSystemRoleRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // Admin Tree Assignments (legacy)
    Task<ServiceResult<List<AdminAssignmentResponse>>> GetAllAssignmentsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<AdminAssignmentResponse>>> GetUserAssignmentsAsync(
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<AdminAssignmentResponse>> CreateAssignmentAsync(
        CreateAdminAssignmentRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteAssignmentAsync(
        Guid assignmentId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // Admin Town Assignments (town-scoped access)
    Task<ServiceResult<List<AdminTownAssignmentResponse>>> GetAllTownAssignmentsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<AdminTownAssignmentResponse>>> GetUserTownAssignmentsAsync(
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<AdminTownAssignmentResponse>> CreateTownAssignmentAsync(
        CreateAdminTownAssignmentRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<AdminTownAssignmentResponse>>> CreateTownAssignmentsBulkAsync(
        CreateAdminTownAssignmentBulkRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteTownAssignmentAsync(
        Guid assignmentId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeactivateTownAssignmentAsync(
        Guid assignmentId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get towns assigned to an admin user (for login flow)
    /// </summary>
    Task<ServiceResult<AdminLoginResponse>> GetAdminTownsAsync(
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // Statistics
    Task<ServiceResult<AdminStatsDto>> GetStatsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default);
}

public record AdminStatsDto(
    int TotalUsers,
    int SuperAdmins,
    int Admins,
    int TotalTrees,
    int PublicTrees,
    int TotalPeople,
    int TotalMedia,
    int TotalRelationships,
    List<RecentUserDto> RecentUsers,
    List<LargestTreeDto> LargestTrees
);

public record RecentUserDto(long Id, string? Email, string? FirstName, string? LastName, DateTime CreatedAt);
public record LargestTreeDto(Guid Id, string Name, int PersonCount);
