// File: Services/IAdminService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Admin operations (SuperAdmin only).
/// </summary>
public interface IAdminService
{
    // User Management
    Task<ServiceResult<List<UserSystemRoleResponse>>> GetAllUsersAsync(
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

    // Admin Tree Assignments
    Task<ServiceResult<List<AdminAssignmentResponse>>> GetAllAssignmentsAsync(
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<AdminAssignmentResponse>>> GetUserAssignmentsAsync(
        long userId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<AdminAssignmentResponse>> CreateAssignmentAsync(
        CreateAdminAssignmentRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteAssignmentAsync(
        Guid assignmentId,
        CancellationToken cancellationToken = default);

    // Statistics
    Task<ServiceResult<AdminStatsDto>> GetStatsAsync(
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
