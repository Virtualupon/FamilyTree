// File: Repositories/UnionRepository.cs
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Union-specific repository implementation.
/// </summary>
public class UnionRepository : Repository<Union>, IUnionRepository
{
    public UnionRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<Union?> GetByIdWithDetailsAsync(Guid id, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Where(u => u.Id == id && u.OrgId == orgId)
            .Include(u => u.Members)
                .ThenInclude(m => m.Person)
                .ThenInclude(p => p.Names)
            .Include(u => u.StartPlace)
            .Include(u => u.EndPlace)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<(List<UnionListItemDto> Items, int TotalCount)> GetPagedAsync(
        Guid orgId,
        UnionSearchDto search,
        CancellationToken cancellationToken = default)
    {
        var query = _dbSet
            .Where(u => u.OrgId == orgId)
            .Include(u => u.Members)
                .ThenInclude(m => m.Person)
            .Include(u => u.StartPlace)
            .AsQueryable();

        // Apply filters
        if (search.Type.HasValue)
        {
            query = query.Where(u => u.Type == search.Type.Value);
        }

        if (search.PersonId.HasValue)
        {
            query = query.Where(u => u.Members.Any(m => m.PersonId == search.PersonId.Value));
        }

        if (search.StartDateFrom.HasValue)
        {
            query = query.Where(u => u.StartDate >= search.StartDateFrom.Value);
        }

        if (search.StartDateTo.HasValue)
        {
            query = query.Where(u => u.StartDate <= search.StartDateTo.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var unions = await query
            .OrderByDescending(u => u.StartDate)
            .Skip((search.Page - 1) * search.PageSize)
            .Take(search.PageSize)
            .Select(u => new UnionListItemDto(
                u.Id,
                u.Type,
                u.StartDate,
                u.EndDate,
                u.StartPlace != null ? u.StartPlace.Name : null,
                u.Members.Select(m => new UnionMemberSummaryDto(
                    m.PersonId,
                    m.Person.PrimaryName,
                    m.Role
                )).ToList()
            ))
            .ToListAsync(cancellationToken);

        return (unions, totalCount);
    }

    public async Task<bool> ExistsInOrgAsync(Guid unionId, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _dbSet.AnyAsync(u => u.Id == unionId && u.OrgId == orgId, cancellationToken);
    }

    public async Task<List<UnionMember>> GetMembersAsync(Guid unionId, CancellationToken cancellationToken = default)
    {
        return await _context.UnionMembers
            .Include(m => m.Person)
                .ThenInclude(p => p.Names)
            .Where(m => m.UnionId == unionId)
            .ToListAsync(cancellationToken);
    }

    public async Task<UnionMember?> GetMemberAsync(Guid unionId, Guid personId, CancellationToken cancellationToken = default)
    {
        return await _context.UnionMembers
            .Include(m => m.Person)
            .FirstOrDefaultAsync(m => m.UnionId == unionId && m.PersonId == personId, cancellationToken);
    }

    public async Task<List<ParentChild>> GetChildrenRelationshipsAsync(Guid unionId, CancellationToken cancellationToken = default)
    {
        // Get all members of the union
        var memberIds = await _context.UnionMembers
            .Where(m => m.UnionId == unionId)
            .Select(m => m.PersonId)
            .ToListAsync(cancellationToken);

        // Get children where both parents are members of this union
        return await _context.ParentChildren
            .Include(pc => pc.Child)
                .ThenInclude(c => c.Names)
            .Include(pc => pc.Child)
                .ThenInclude(c => c.BirthPlace)
            .Where(pc => memberIds.Contains(pc.ParentId))
            .ToListAsync(cancellationToken);
    }
}
