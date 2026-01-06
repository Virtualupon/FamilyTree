using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository implementation for PersonMedia junction table operations
/// </summary>
public class PersonMediaRepository : Repository<PersonMedia>, IPersonMediaRepository
{
    public PersonMediaRepository(ApplicationDbContext context) : base(context)
    {
    }

    /// <inheritdoc />
    public async Task<IEnumerable<PersonMedia>> GetByPersonIdWithMediaAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        // Only include Media without the PersonLinks navigation to avoid cycle:
        // PersonMedia -> Media -> PersonLinks -> Person -> PersonMedia (cycle!)
        // The PersonLinks can be loaded separately if needed
        return await _dbSet
            .AsNoTracking()
            .Include(pm => pm.Media)
            .Where(pm => pm.PersonId == personId)
            .OrderBy(pm => pm.SortOrder)
            .ThenByDescending(pm => pm.LinkedAt)
            .ToListAsync(cancellationToken);
    }

    /// <inheritdoc />
    public async Task<IEnumerable<PersonMedia>> GetByMediaIdWithPersonsAsync(Guid mediaId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .AsNoTracking()
            .Include(pm => pm.Person)
            .Where(pm => pm.MediaId == mediaId)
            .OrderByDescending(pm => pm.IsPrimary)
            .ThenBy(pm => pm.LinkedAt)
            .ToListAsync(cancellationToken);
    }

    /// <inheritdoc />
    public async Task<PersonMedia?> GetLinkAsync(Guid personId, Guid mediaId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .FirstOrDefaultAsync(pm => pm.PersonId == personId && pm.MediaId == mediaId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<bool> LinkExistsAsync(Guid personId, Guid mediaId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .AnyAsync(pm => pm.PersonId == personId && pm.MediaId == mediaId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<bool> PersonExistsAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        return await _context.People.AnyAsync(p => p.Id == personId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<bool> MediaExistsAsync(Guid mediaId, CancellationToken cancellationToken = default)
    {
        return await _context.MediaFiles.AnyAsync(m => m.Id == mediaId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task RemoveAllLinksForMediaAsync(Guid mediaId, CancellationToken cancellationToken = default)
    {
        var links = await _dbSet
            .Where(pm => pm.MediaId == mediaId)
            .ToListAsync(cancellationToken);

        _dbSet.RemoveRange(links);
    }

    /// <inheritdoc />
    public async Task<Media?> GetMediaByIdAsync(Guid mediaId, CancellationToken cancellationToken = default)
    {
        return await _context.MediaFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mediaId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<IEnumerable<PersonMedia>> GetByMediaIdsWithPersonsAsync(IEnumerable<Guid> mediaIds, CancellationToken cancellationToken = default)
    {
        var mediaIdList = mediaIds.ToList();
        return await _dbSet
            .AsNoTracking()
            .Include(pm => pm.Person)
            .Where(pm => mediaIdList.Contains(pm.MediaId))
            .ToListAsync(cancellationToken);
    }
}