using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository implementation for RelationshipSuggestion operations
/// </summary>
public class SuggestionRepository : Repository<RelationshipSuggestion>, ISuggestionRepository
{
    public SuggestionRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<RelationshipSuggestion?> GetWithDetailsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Include(s => s.Town)
            .Include(s => s.Tree)
            .Include(s => s.TargetPerson)
            .Include(s => s.SecondaryPerson)
            .Include(s => s.TargetUnion)
                .ThenInclude(u => u!.Members)
                    .ThenInclude(m => m.Person)
            .Include(s => s.SubmittedByUser)
            .Include(s => s.ReviewedByUser)
            .Include(s => s.Evidence)
                .ThenInclude(e => e.Media)
            .Include(s => s.Comments)
                .ThenInclude(c => c.AuthorUser)
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);
    }

    public async Task<(List<RelationshipSuggestion> Items, int TotalCount)> GetPagedAsync(
        SuggestionQueryParams queryParams,
        CancellationToken cancellationToken = default)
    {
        var query = _dbSet
            .Include(s => s.Town)
            .Include(s => s.Tree)
            .Include(s => s.TargetPerson)
            .Include(s => s.SecondaryPerson)
            .Include(s => s.SubmittedByUser)
            .Where(s => !s.IsDeleted);

        // Apply filters
        if (queryParams.TownId.HasValue)
            query = query.Where(s => s.TownId == queryParams.TownId.Value);

        if (queryParams.TreeId.HasValue)
            query = query.Where(s => s.TreeId == queryParams.TreeId.Value);

        if (queryParams.Status.HasValue)
            query = query.Where(s => s.Status == queryParams.Status.Value);

        if (queryParams.Type.HasValue)
            query = query.Where(s => s.Type == queryParams.Type.Value);

        if (queryParams.SubmittedByUserId.HasValue)
            query = query.Where(s => s.SubmittedByUserId == queryParams.SubmittedByUserId.Value);

        if (queryParams.FromDate.HasValue)
            query = query.Where(s => s.CreatedAt >= queryParams.FromDate.Value);

        if (queryParams.ToDate.HasValue)
            query = query.Where(s => s.CreatedAt <= queryParams.ToDate.Value);

        // Get total count before pagination
        var totalCount = await query.CountAsync(cancellationToken);

        // Apply sorting
        query = queryParams.SortBy?.ToLower() switch
        {
            "createdat" => queryParams.SortDesc
                ? query.OrderByDescending(s => s.CreatedAt)
                : query.OrderBy(s => s.CreatedAt),
            "submittedat" => queryParams.SortDesc
                ? query.OrderByDescending(s => s.SubmittedAt)
                : query.OrderBy(s => s.SubmittedAt),
            "status" => queryParams.SortDesc
                ? query.OrderByDescending(s => s.Status)
                : query.OrderBy(s => s.Status),
            "type" => queryParams.SortDesc
                ? query.OrderByDescending(s => s.Type)
                : query.OrderBy(s => s.Type),
            _ => queryParams.SortDesc
                ? query.OrderByDescending(s => s.CreatedAt)
                : query.OrderBy(s => s.CreatedAt)
        };

        // Apply pagination
        var items = await query
            .Skip((queryParams.Page - 1) * queryParams.PageSize)
            .Take(queryParams.PageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<List<PendingByTownDto>> GetPendingCountByTownAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Towns
            .GroupJoin(
                _dbSet.Where(s => s.Status == SuggestionStatus.Pending && !s.IsDeleted),
                t => t.Id,
                s => s.TownId,
                (town, suggestions) => new { town, suggestions }
            )
            .Select(x => new PendingByTownDto(
                x.town.Id,
                x.town.Name,
                x.town.NameEn,
                x.town.NameAr,
                x.suggestions.Count(),
                x.suggestions.Any() ? x.suggestions.Min(s => s.CreatedAt) : null
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<SuggestionStatsDto> GetStatisticsAsync(
        Guid? townId = null,
        Guid? treeId = null,
        long? userId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _dbSet.Where(s => !s.IsDeleted);

        if (townId.HasValue)
            query = query.Where(s => s.TownId == townId.Value);

        if (treeId.HasValue)
            query = query.Where(s => s.TreeId == treeId.Value);

        if (userId.HasValue)
            query = query.Where(s => s.SubmittedByUserId == userId.Value);

        // Get counts using separate efficient queries
        var totalCount = await query.CountAsync(cancellationToken);
        var pendingCount = await query.CountAsync(s => s.Status == SuggestionStatus.Pending, cancellationToken);
        var approvedCount = await query.CountAsync(s => s.Status == SuggestionStatus.Approved, cancellationToken);
        var rejectedCount = await query.CountAsync(s => s.Status == SuggestionStatus.Rejected, cancellationToken);
        var needsInfoCount = await query.CountAsync(s => s.Status == SuggestionStatus.NeedsInfo, cancellationToken);
        var withdrawnCount = await query.CountAsync(s => s.Status == SuggestionStatus.Withdrawn, cancellationToken);

        // Get oldest pending date
        var oldestPendingDate = await query
            .Where(s => s.Status == SuggestionStatus.Pending)
            .OrderBy(s => s.CreatedAt)
            .Select(s => (DateTime?)s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        // Calculate average review time in memory (PostgreSQL doesn't support DateDiffHour)
        decimal? avgReviewTimeHours = null;
        var reviewedSuggestions = await query
            .Where(s => s.ReviewedAt != null)
            .Select(s => new { s.SubmittedAt, ReviewedAt = s.ReviewedAt!.Value })
            .ToListAsync(cancellationToken);

        if (reviewedSuggestions.Count > 0)
        {
            avgReviewTimeHours = (decimal)reviewedSuggestions
                .Average(s => (s.ReviewedAt - s.SubmittedAt).TotalHours);
        }

        var oldestPendingDays = oldestPendingDate.HasValue
            ? (int)(DateTime.UtcNow - oldestPendingDate.Value).TotalDays
            : 0;

        return new SuggestionStatsDto(
            totalCount,
            pendingCount,
            approvedCount,
            rejectedCount,
            needsInfoCount,
            withdrawnCount,
            avgReviewTimeHours,
            oldestPendingDays
        );
    }

    public async Task<DuplicateCheckResponse> CheckDuplicateAsync(
        Guid treeId,
        SuggestionType type,
        Guid? targetPersonId,
        Guid? secondaryPersonId = null,
        CancellationToken cancellationToken = default)
    {
        var duplicate = await _dbSet
            .Include(s => s.SubmittedByUser)
            .Where(s =>
                s.TreeId == treeId &&
                s.Type == type &&
                s.Status == SuggestionStatus.Pending &&
                !s.IsDeleted &&
                s.TargetPersonId == targetPersonId &&
                s.SecondaryPersonId == secondaryPersonId)
            .FirstOrDefaultAsync(cancellationToken);

        if (duplicate == null)
        {
            return new DuplicateCheckResponse(false, null, null, null);
        }

        var submitterName = $"{duplicate.SubmittedByUser?.FirstName} {duplicate.SubmittedByUser?.LastName}".Trim();

        return new DuplicateCheckResponse(
            true,
            duplicate.Id,
            duplicate.SubmittedAt,
            submitterName
        );
    }

    public async Task<List<RelationshipSuggestion>> GetBySubmitterAsync(
        long userId,
        SuggestionStatus? status = null,
        CancellationToken cancellationToken = default)
    {
        var query = _dbSet
            .Include(s => s.Town)
            .Include(s => s.Tree)
            .Include(s => s.TargetPerson)
            .Include(s => s.SecondaryPerson)
            .Where(s => s.SubmittedByUserId == userId && !s.IsDeleted);

        if (status.HasValue)
            query = query.Where(s => s.Status == status.Value);

        return await query
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<RelationshipSuggestion>> GetForPersonAsync(
        Guid personId,
        CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Include(s => s.Town)
            .Include(s => s.Tree)
            .Include(s => s.SubmittedByUser)
            .Where(s =>
                (s.TargetPersonId == personId || s.SecondaryPersonId == personId) &&
                !s.IsDeleted)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task SoftDeleteAsync(Guid id, long deletedByUserId, CancellationToken cancellationToken = default)
    {
        var suggestion = await _dbSet.FindAsync(new object[] { id }, cancellationToken);
        if (suggestion != null)
        {
            suggestion.IsDeleted = true;
            suggestion.DeletedAt = DateTime.UtcNow;
            suggestion.DeletedByUserId = deletedByUserId;
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}

/// <summary>
/// Repository implementation for SuggestionEvidence operations
/// </summary>
public class SuggestionEvidenceRepository : Repository<SuggestionEvidence>, ISuggestionEvidenceRepository
{
    public SuggestionEvidenceRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<List<SuggestionEvidence>> GetBySuggestionAsync(Guid suggestionId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Include(e => e.Media)
            .Where(e => e.SuggestionId == suggestionId)
            .OrderBy(e => e.SortOrder)
            .ToListAsync(cancellationToken);
    }

    public async Task ReorderAsync(Guid suggestionId, List<Guid> orderedIds, CancellationToken cancellationToken = default)
    {
        var evidence = await _dbSet
            .Where(e => e.SuggestionId == suggestionId)
            .ToListAsync(cancellationToken);

        for (int i = 0; i < orderedIds.Count; i++)
        {
            var item = evidence.FirstOrDefault(e => e.Id == orderedIds[i]);
            if (item != null)
            {
                item.SortOrder = i;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Repository implementation for SuggestionComment operations
/// </summary>
public class SuggestionCommentRepository : Repository<SuggestionComment>, ISuggestionCommentRepository
{
    public SuggestionCommentRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<List<SuggestionComment>> GetBySuggestionAsync(Guid suggestionId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Include(c => c.AuthorUser)
            .Where(c => c.SuggestionId == suggestionId)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<SuggestionComment?> GetLatestAsync(Guid suggestionId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Include(c => c.AuthorUser)
            .Where(c => c.SuggestionId == suggestionId)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
