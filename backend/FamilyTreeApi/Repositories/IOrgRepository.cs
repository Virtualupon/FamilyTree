// File: Repositories/IOrgRepository.cs
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Org-specific repository interface for tree/organization queries.
/// </summary>
public interface IOrgRepository : IRepository<Org>
{
    /// <summary>
    /// Check if an admin user is assigned to a specific tree.
    /// </summary>
    Task<bool> IsAdminAssignedToTreeAsync(long userId, Guid treeId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Check if a user is a member of an organization.
    /// </summary>
    Task<bool> IsUserMemberOfOrgAsync(long userId, Guid orgId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Check if an admin user has any tree assignments.
    /// </summary>
    Task<bool> HasAdminAssignmentsAsync(long userId, CancellationToken cancellationToken = default);
}
