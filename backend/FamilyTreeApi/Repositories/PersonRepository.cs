// File: Repositories/PersonRepository.cs
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Person-specific repository implementation with complex queries.
/// All database access for Person entities goes through this repository.
/// </summary>
public class PersonRepository : Repository<Person>, IPersonRepository
{
    public PersonRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<Person?> GetByIdWithDetailsAsync(Guid id, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Where(p => p.Id == id && p.OrgId == orgId)
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<(List<PersonListItemDto> Items, int TotalCount)> GetPagedAsync(
        Guid orgId,
        PersonSearchDto search,
        CancellationToken cancellationToken = default)
    {
        var query = _dbSet
            .Where(p => p.OrgId == orgId)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .AsQueryable();

        // Apply filters
        if (!string.IsNullOrWhiteSpace(search.NameQuery))
        {
            var searchTerm = search.NameQuery.Trim().ToLower();
            query = query.Where(p =>
                (p.PrimaryName != null && p.PrimaryName.ToLower().Contains(searchTerm)) ||
                p.Names.Any(n =>
                    (n.Full != null && n.Full.ToLower().Contains(searchTerm)) ||
                    (n.Given != null && n.Given.ToLower().Contains(searchTerm)) ||
                    (n.Middle != null && n.Middle.ToLower().Contains(searchTerm)) ||
                    (n.Transliteration != null && n.Transliteration.ToLower().Contains(searchTerm))
                )
            );
        }

        if (search.Sex.HasValue)
        {
            query = query.Where(p => p.Sex == search.Sex.Value);
        }

        if (search.BirthDateFrom.HasValue)
        {
            query = query.Where(p => p.BirthDate >= search.BirthDateFrom.Value);
        }

        if (search.BirthDateTo.HasValue)
        {
            query = query.Where(p => p.BirthDate <= search.BirthDateTo.Value);
        }

        if (search.DeathDateFrom.HasValue)
        {
            query = query.Where(p => p.DeathDate >= search.DeathDateFrom.Value);
        }

        if (search.DeathDateTo.HasValue)
        {
            query = query.Where(p => p.DeathDate <= search.DeathDateTo.Value);
        }

        if (search.BirthPlaceId.HasValue)
        {
            query = query.Where(p => p.BirthPlaceId == search.BirthPlaceId.Value);
        }

        if (search.DeathPlaceId.HasValue)
        {
            query = query.Where(p => p.DeathPlaceId == search.DeathPlaceId.Value);
        }

        if (search.PrivacyLevel.HasValue)
        {
            query = query.Where(p => p.PrivacyLevel == search.PrivacyLevel.Value);
        }

        if (search.IsVerified.HasValue)
        {
            query = query.Where(p => p.IsVerified == search.IsVerified.Value);
        }

        if (search.NeedsReview.HasValue)
        {
            query = query.Where(p => p.NeedsReview == search.NeedsReview.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        // Use GroupJoin to get media counts - more reliable across different DB providers
        var persons = await query
            .OrderBy(p => p.PrimaryName)
            .Skip((search.Page - 1) * search.PageSize)
            .Take(search.PageSize)
            .GroupJoin(
                _context.PersonMedia,
                p => p.Id,
                pm => pm.PersonId,
                (p, mediaGroup) => new PersonListItemDto(
                    p.Id,
                    p.PrimaryName,
                    p.Sex,
                    p.BirthDate,
                    p.BirthPrecision,
                    p.DeathDate,
                    p.DeathPrecision,
                    p.BirthPlace != null ? p.BirthPlace.Name : null,
                    p.DeathPlace != null ? p.DeathPlace.Name : null,
                    p.IsVerified,
                    p.NeedsReview,
                    mediaGroup.Count()
                ))
            .ToListAsync(cancellationToken);

        return (persons, totalCount);
    }

    public async Task<bool> ExistsInOrgAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _dbSet.AnyAsync(p => p.Id == personId && p.OrgId == orgId, cancellationToken);
    }

    public async Task<List<ParentChild>> GetParentChildRelationshipsAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        return await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .Where(pc => pc.ParentId == personId || pc.ChildId == personId)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> HasCrossOrgRelationshipsAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default)
    {
        var relationships = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .Where(pc => pc.ParentId == personId || pc.ChildId == personId)
            .ToListAsync(cancellationToken);

        return relationships.Any(pc => pc.Parent.OrgId != orgId || pc.Child.OrgId != orgId);
    }

    public async Task<List<UnionMember>> GetUnionMembershipsAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _context.UnionMembers
            .Include(um => um.Union)
            .Where(um => um.PersonId == personId && um.Union.OrgId == orgId)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<PersonTag>> GetPersonTagsAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _context.PersonTags
            .Include(pt => pt.Tag)
            .Where(pt => pt.PersonId == personId && pt.Tag.OrgId == orgId)
            .ToListAsync(cancellationToken);
    }

    public async Task<(List<PersonListItemDto> Items, int TotalCount)> GetPagedByTownAsync(
        Guid townId,
        PersonSearchDto search,
        CancellationToken cancellationToken = default)
    {
        // Get all Orgs (trees) that belong to this town
        var treeIds = await _context.Orgs
            .Where(o => o.TownId == townId)
            .Select(o => o.Id)
            .ToListAsync(cancellationToken);

        if (treeIds.Count == 0)
        {
            return (new List<PersonListItemDto>(), 0);
        }

        var query = _dbSet
            .Where(p => treeIds.Contains(p.OrgId))
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .AsQueryable();

        // Apply filters
        if (!string.IsNullOrWhiteSpace(search.NameQuery))
        {
            var searchTerm = search.NameQuery.Trim().ToLower();
            query = query.Where(p =>
                (p.PrimaryName != null && p.PrimaryName.ToLower().Contains(searchTerm)) ||
                p.Names.Any(n =>
                    (n.Full != null && n.Full.ToLower().Contains(searchTerm)) ||
                    (n.Given != null && n.Given.ToLower().Contains(searchTerm)) ||
                    (n.Middle != null && n.Middle.ToLower().Contains(searchTerm)) ||
                    (n.Transliteration != null && n.Transliteration.ToLower().Contains(searchTerm))
                )
            );
        }

        if (search.Sex.HasValue)
        {
            query = query.Where(p => p.Sex == search.Sex.Value);
        }

        if (search.BirthDateFrom.HasValue)
        {
            query = query.Where(p => p.BirthDate >= search.BirthDateFrom.Value);
        }

        if (search.BirthDateTo.HasValue)
        {
            query = query.Where(p => p.BirthDate <= search.BirthDateTo.Value);
        }

        if (search.DeathDateFrom.HasValue)
        {
            query = query.Where(p => p.DeathDate >= search.DeathDateFrom.Value);
        }

        if (search.DeathDateTo.HasValue)
        {
            query = query.Where(p => p.DeathDate <= search.DeathDateTo.Value);
        }

        if (search.BirthPlaceId.HasValue)
        {
            query = query.Where(p => p.BirthPlaceId == search.BirthPlaceId.Value);
        }

        if (search.DeathPlaceId.HasValue)
        {
            query = query.Where(p => p.DeathPlaceId == search.DeathPlaceId.Value);
        }

        if (search.PrivacyLevel.HasValue)
        {
            query = query.Where(p => p.PrivacyLevel == search.PrivacyLevel.Value);
        }

        if (search.IsVerified.HasValue)
        {
            query = query.Where(p => p.IsVerified == search.IsVerified.Value);
        }

        if (search.NeedsReview.HasValue)
        {
            query = query.Where(p => p.NeedsReview == search.NeedsReview.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var persons = await query
            .OrderBy(p => p.PrimaryName)
            .Skip((search.Page - 1) * search.PageSize)
            .Take(search.PageSize)
            .GroupJoin(
                _context.PersonMedia,
                p => p.Id,
                pm => pm.PersonId,
                (p, mediaGroup) => new PersonListItemDto(
                    p.Id,
                    p.PrimaryName,
                    p.Sex,
                    p.BirthDate,
                    p.BirthPrecision,
                    p.DeathDate,
                    p.DeathPrecision,
                    p.BirthPlace != null ? p.BirthPlace.Name : null,
                    p.DeathPlace != null ? p.DeathPlace.Name : null,
                    p.IsVerified,
                    p.NeedsReview,
                    mediaGroup.Count()
                ))
            .ToListAsync(cancellationToken);

        return (persons, totalCount);
    }

    public Task RemoveRelatedEntitiesAsync(
        List<ParentChild> parentChildRecords,
        List<UnionMember> unionMemberships,
        List<PersonTag> personTags,
        CancellationToken cancellationToken = default)
    {
        _context.ParentChildren.RemoveRange(parentChildRecords);
        _context.UnionMembers.RemoveRange(unionMemberships);
        _context.PersonTags.RemoveRange(personTags);
        return Task.CompletedTask;
    }
}
