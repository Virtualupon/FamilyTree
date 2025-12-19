// File: Repositories/OrgRepository.cs
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Org-specific repository implementation.
/// </summary>
public class OrgRepository : Repository<Org>, IOrgRepository
{
    public OrgRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<bool> IsAdminAssignedToTreeAsync(long userId, Guid treeId, CancellationToken cancellationToken = default)
    {
        return await _context.Set<AdminTreeAssignment>()
            .AnyAsync(a => a.UserId == userId && a.TreeId == treeId, cancellationToken);
    }

    public async Task<bool> IsUserMemberOfOrgAsync(long userId, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _context.OrgUsers
            .AnyAsync(ou => ou.UserId == userId && ou.OrgId == orgId, cancellationToken);
    }

    public async Task<bool> HasAdminAssignmentsAsync(long userId, CancellationToken cancellationToken = default)
    {
        return await _context.Set<AdminTreeAssignment>()
            .AnyAsync(a => a.UserId == userId, cancellationToken);
    }
}
