using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;
using FamilyTreeApi.Services.Caching;

namespace FamilyTreeApi.Services;

/// <summary>
/// Analytics service for the SuperAdmin/Developer dashboard.
/// Uses Redis caching for performance (15 min TTL).
/// All queries use QueryNoTracking() for read-only performance.
/// </summary>
public class AnalyticsService : IAnalyticsService
{
    private readonly IRepository<Org> _orgRepository;
    private readonly IRepository<Person> _personRepository;
    private readonly IRepository<ParentChild> _parentChildRepository;
    private readonly IRepository<Union> _unionRepository;
    private readonly IRepository<AuditLog> _auditLogRepository;
    private readonly IRepository<RelationshipSuggestion> _suggestionRepository;
    private readonly IRepository<OrgUser> _orgUserRepository;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ApplicationDbContext _context;
    private readonly IResilientCacheService _cache;
    private readonly ILogger<AnalyticsService> _logger;

    public AnalyticsService(
        IRepository<Org> orgRepository,
        IRepository<Person> personRepository,
        IRepository<ParentChild> parentChildRepository,
        IRepository<Union> unionRepository,
        IRepository<AuditLog> auditLogRepository,
        IRepository<RelationshipSuggestion> suggestionRepository,
        IRepository<OrgUser> orgUserRepository,
        UserManager<ApplicationUser> userManager,
        ApplicationDbContext context,
        IResilientCacheService cache,
        ILogger<AnalyticsService> logger)
    {
        _orgRepository = orgRepository;
        _personRepository = personRepository;
        _parentChildRepository = parentChildRepository;
        _unionRepository = unionRepository;
        _auditLogRepository = auditLogRepository;
        _suggestionRepository = suggestionRepository;
        _orgUserRepository = orgUserRepository;
        _userManager = userManager;
        _context = context;
        _cache = cache;
        _logger = logger;
    }

    public async Task<ServiceResult<AnalyticsDashboardDto>> GetDashboardAsync(
        int periodDays,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<AnalyticsDashboardDto>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        // Clamp period
        periodDays = periodDays switch
        {
            <= 30 => 30,
            <= 90 => 90,
            _ => 365
        };

        try
        {
            // Try cache first
            var cacheKey = $"analytics:dashboard:{periodDays}";
            var cached = await _cache.GetAsync<AnalyticsDashboardDto>(cacheKey, cancellationToken);
            if (cached != null)
                return ServiceResult<AnalyticsDashboardDto>.Success(cached);

            // Build all sections SEQUENTIALLY to avoid DbContext concurrency issues
            // DbContext is NOT thread-safe - cannot run parallel queries on same instance
            var growth = await BuildGrowthMetricsAsync(periodDays, cancellationToken);
            var engagement = await BuildEngagementAsync(cancellationToken);
            var content = await BuildContentAnalyticsAsync(cancellationToken);
            var quality = await BuildDataQualityAsync(cancellationToken);
            var activity = await BuildSystemActivityAsync(cancellationToken);
            var suggestions = await BuildSuggestionStatsAsync(periodDays, cancellationToken);

            var dashboard = new AnalyticsDashboardDto(
                Growth: growth,
                Engagement: engagement,
                Content: content,
                DataQuality: quality,
                SystemActivity: activity,
                Suggestions: suggestions
            );

            // Cache for 15 minutes
            await _cache.SetAsync(cacheKey, dashboard, CacheLifeTime.Short, cancellationToken);

            return ServiceResult<AnalyticsDashboardDto>.Success(dashboard);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to build analytics dashboard");
            return ServiceResult<AnalyticsDashboardDto>.InternalError("Failed to load analytics data.");
        }
    }

    public async Task<ServiceResult<GrowthMetricsDto>> GetGrowthMetricsAsync(
        int periodDays,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<GrowthMetricsDto>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        periodDays = periodDays switch
        {
            <= 30 => 30,
            <= 90 => 90,
            _ => 365
        };

        try
        {
            var cacheKey = $"analytics:growth:{periodDays}";
            var cached = await _cache.GetAsync<GrowthMetricsDto>(cacheKey, cancellationToken);
            if (cached != null)
                return ServiceResult<GrowthMetricsDto>.Success(cached);

            var growth = await BuildGrowthMetricsAsync(periodDays, cancellationToken);

            await _cache.SetAsync(cacheKey, growth, CacheLifeTime.Short, cancellationToken);

            return ServiceResult<GrowthMetricsDto>.Success(growth);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to build growth metrics");
            return ServiceResult<GrowthMetricsDto>.InternalError("Failed to load growth metrics.");
        }
    }

    // ========================================================================
    // PRIVATE: Growth Metrics
    // ========================================================================

    private async Task<GrowthMetricsDto> BuildGrowthMetricsAsync(int periodDays, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddDays(-periodDays);

        // Execute sequentially to avoid DbContext concurrency issues
        // Fetch raw data then group in memory (PostgreSQL can't translate .Date)
        var userRegData = await _userManager.Users
            .Where(u => u.CreatedAt >= cutoff)
            .Select(u => u.CreatedAt.Date)
            .ToListAsync(ct);

        var userRegs = userRegData
            .GroupBy(d => d)
            .Select(g => new TimeSeriesPoint(g.Key, g.Count()))
            .OrderBy(p => p.Date)
            .ToList();

        var treeCreationData = await _orgRepository.QueryNoTracking()
            .Where(o => o.CreatedAt >= cutoff)
            .Select(o => o.CreatedAt.Date)
            .ToListAsync(ct);

        var treeCreations = treeCreationData
            .GroupBy(d => d)
            .Select(g => new TimeSeriesPoint(g.Key, g.Count()))
            .OrderBy(p => p.Date)
            .ToList();

        var peopleAddedData = await _personRepository.QueryNoTracking()
            .Where(p => p.CreatedAt >= cutoff)
            .Select(p => p.CreatedAt.Date)
            .ToListAsync(ct);

        var peopleAdded = peopleAddedData
            .GroupBy(d => d)
            .Select(g => new TimeSeriesPoint(g.Key, g.Count()))
            .OrderBy(p => p.Date)
            .ToList();

        return new GrowthMetricsDto(
            UserRegistrations: userRegs,
            TreeCreations: treeCreations,
            PeopleAdded: peopleAdded,
            TotalUsersInPeriod: userRegs.Sum(p => p.Count),
            TotalTreesInPeriod: treeCreations.Sum(p => p.Count),
            TotalPeopleInPeriod: peopleAdded.Sum(p => p.Count)
        );
    }

    // ========================================================================
    // PRIVATE: User Engagement
    // ========================================================================

    private async Task<UserEngagementDto> BuildEngagementAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        // Execute sequentially to avoid DbContext concurrency issues
        var dau = await _userManager.Users.CountAsync(u => u.LastActiveAt >= now.AddHours(-24), ct);
        var wau = await _userManager.Users.CountAsync(u => u.LastActiveAt >= now.AddDays(-7), ct);
        var mau = await _userManager.Users.CountAsync(u => u.LastActiveAt >= now.AddDays(-30), ct);

        // Role distribution - fetch data first, then group in memory (PostgreSQL can't translate GroupBy with projection)
        var roleData = await _context.UserRoles
            .Join(_context.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name!)
            .ToListAsync(ct);

        var roleDist = roleData
            .GroupBy(roleName => roleName)
            .Select(g => new RoleDistributionDto(g.Key ?? "Unknown", g.Count()))
            .OrderByDescending(r => r.Count)
            .ToList();

        // Top contributors: users who own trees with the most people
        var topContribData = await _orgUserRepository.QueryNoTracking()
            .Where(ou => ou.Role == OrgRole.Owner)
            .GroupBy(ou => ou.UserId)
            .Select(g => new
            {
                UserId = g.Key,
                TreesOwned = g.Count(),
                PeopleAdded = g.Sum(ou => ou.Org.People.Count)
            })
            .OrderByDescending(x => x.PeopleAdded)
            .Take(10)
            .ToListAsync(ct);

        // Fetch user details for top contributors
        var topUserIds = topContribData.Select(t => t.UserId).ToList();
        var topUsers = await _userManager.Users
            .Where(u => topUserIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Email, u.FirstName, u.LastName })
            .ToListAsync(ct);

        var topContributors = topContribData.Select(t =>
        {
            var user = topUsers.FirstOrDefault(u => u.Id == t.UserId);
            return new TopContributorDto(
                t.UserId,
                user?.Email,
                user?.FirstName,
                user?.LastName,
                t.PeopleAdded,
                t.TreesOwned
            );
        }).ToList();

        return new UserEngagementDto(
            ActiveUsers: new ActiveUsersDto(dau, wau, mau),
            RoleDistribution: roleDist,
            TopContributors: topContributors
        );
    }

    // ========================================================================
    // PRIVATE: Content Analytics
    // ========================================================================

    private async Task<ContentAnalyticsDto> BuildContentAnalyticsAsync(CancellationToken ct)
    {
        // Execute sequentially to avoid DbContext concurrency issues

        // Trees by town - fetch data first, then group in memory (PostgreSQL can't translate complex GroupBy)
        var treeData = await _orgRepository.QueryNoTracking()
            .Select(o => new { o.TownId, TownName = o.Town.Name, TownNameAr = o.Town.NameAr, PeopleCount = o.People.Count })
            .ToListAsync(ct);

        var treesByTown = treeData
            .GroupBy(o => new { o.TownId, o.TownName, o.TownNameAr })
            .Select(g => new TownContentDto(
                g.Key.TownId,
                g.Key.TownName,
                g.Key.TownNameAr,
                g.Count(),
                g.Sum(o => o.PeopleCount)
            ))
            .OrderByDescending(t => t.TreeCount)
            .Take(20)
            .ToList();

        // Tree sizes for distribution
        var treeSizes = await _orgRepository.QueryNoTracking()
            .Select(o => o.People.Count)
            .ToListAsync(ct);

        var avgSize = treeSizes.Count > 0 ? treeSizes.Average() : 0;
        var maxSize = treeSizes.Count > 0 ? treeSizes.Max() : 0;

        // Bucket tree sizes
        var distribution = new List<TreeSizeBucketDto>
        {
            new("1-10", treeSizes.Count(s => s >= 1 && s <= 10)),
            new("11-50", treeSizes.Count(s => s >= 11 && s <= 50)),
            new("51-200", treeSizes.Count(s => s >= 51 && s <= 200)),
            new("201+", treeSizes.Count(s => s > 200))
        };

        // Relationship counts
        var parentChildCount = await _parentChildRepository.CountAsync(null, ct);
        var unionCount = await _unionRepository.CountAsync(null, ct);

        return new ContentAnalyticsDto(
            TreesByTown: treesByTown,
            AverageTreeSize: Math.Round(avgSize, 1),
            LargestTreeSize: maxSize,
            TreeSizeDistribution: distribution,
            TotalRelationships: parentChildCount + unionCount,
            TotalParentChild: parentChildCount,
            TotalUnions: unionCount
        );
    }

    // ========================================================================
    // PRIVATE: Data Quality
    // ========================================================================

    private async Task<DataQualityDto> BuildDataQualityAsync(CancellationToken ct)
    {
        // Execute sequentially to avoid DbContext concurrency issues
        var totalPeople = await _personRepository.CountAsync(null, ct);
        var noName = await _personRepository.CountAsync(
            p => p.PrimaryName == null || p.PrimaryName == "", ct);
        var noBirthDate = await _personRepository.CountAsync(
            p => p.BirthDate == null, ct);
        var unknownSex = await _personRepository.CountAsync(
            p => p.Sex == Sex.Unknown, ct);

        // People with no relationships (no ParentChild or UnionMember connections)
        var noRel = await _personRepository.QueryNoTracking()
            .Where(p =>
                !_parentChildRepository.QueryNoTracking().Any(pc => pc.ParentId == p.Id || pc.ChildId == p.Id) &&
                !_context.UnionMembers.Any(um => um.PersonId == p.Id))
            .CountAsync(ct);

        // Privacy distribution - fetch data first, then group in memory
        var privacyData = await _personRepository.QueryNoTracking()
            .Select(p => p.PrivacyLevel)
            .ToListAsync(ct);

        var privacyDist = privacyData
            .GroupBy(level => level)
            .Select(g => new PrivacyDistributionDto(g.Key.ToString(), g.Count()))
            .ToList();

        // Profile completeness: percentage of people who have name + birth date + known sex
        double completeness = 0;
        if (totalPeople > 0)
        {
            var completeFields = 0;
            completeFields += (totalPeople - noName);      // Has name
            completeFields += (totalPeople - noBirthDate); // Has birth date
            completeFields += (totalPeople - unknownSex);  // Has known sex
            completeness = Math.Round((double)completeFields / (totalPeople * 3) * 100, 1);
        }

        return new DataQualityDto(
            PeopleWithNoName: noName,
            PeopleWithNoBirthDate: noBirthDate,
            PeopleWithUnknownSex: unknownSex,
            PeopleWithNoRelationships: noRel,
            ProfileCompletenessPercent: completeness,
            PrivacyDistribution: privacyDist
        );
    }

    // ========================================================================
    // PRIVATE: System Activity
    // ========================================================================

    private async Task<SystemActivityDto> BuildSystemActivityAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        // Execute sequentially to avoid DbContext concurrency issues

        // Action summary: top 10 action types in last 30 days - fetch data first, then group in memory
        var actionData = await _auditLogRepository.QueryNoTracking()
            .Where(a => a.Timestamp >= now.AddDays(-30))
            .Select(a => new { a.Action, a.EntityType })
            .ToListAsync(ct);

        var actionSummary = actionData
            .GroupBy(a => new { a.Action, a.EntityType })
            .Select(g => new AuditActionSummaryDto(g.Key.Action, g.Key.EntityType, g.Count()))
            .OrderByDescending(a => a.Count)
            .Take(10)
            .ToList();

        // Recent logs: last 20
        var recentLogs = await _auditLogRepository.QueryNoTracking()
            .Include(a => a.Actor)
            .OrderByDescending(a => a.Timestamp)
            .Take(20)
            .Select(a => new RecentAuditLogDto(
                a.Id,
                a.Action,
                a.EntityType,
                a.Timestamp,
                a.ActorId,
                a.Actor != null ? (a.Actor.FirstName + " " + a.Actor.LastName) : null
            ))
            .ToListAsync(ct);

        // Counts by time window
        var last24h = await _auditLogRepository.CountAsync(
            a => a.Timestamp >= now.AddHours(-24), ct);
        var last7d = await _auditLogRepository.CountAsync(
            a => a.Timestamp >= now.AddDays(-7), ct);

        return new SystemActivityDto(
            ActionSummary: actionSummary,
            RecentLogs: recentLogs,
            TotalActionsLast24Hours: last24h,
            TotalActionsLast7Days: last7d
        );
    }

    // ========================================================================
    // PRIVATE: Suggestion Workflow
    // ========================================================================

    private async Task<AnalyticsSuggestionStatsDto> BuildSuggestionStatsAsync(int periodDays, CancellationToken ct)
    {
        // Execute sequentially to avoid DbContext concurrency issues
        var total = await _suggestionRepository.CountAsync(null, ct);
        var pending = await _suggestionRepository.CountAsync(
            s => s.Status == SuggestionStatus.Pending, ct);
        var approved = await _suggestionRepository.CountAsync(
            s => s.Status == SuggestionStatus.Approved, ct);
        var rejected = await _suggestionRepository.CountAsync(
            s => s.Status == SuggestionStatus.Rejected, ct);
        var needsInfo = await _suggestionRepository.CountAsync(
            s => s.Status == SuggestionStatus.NeedsInfo, ct);

        // Average review time: fetch reviewed dates and compute in memory (PostgreSQL-compatible)
        var reviewTimes = await _suggestionRepository.QueryNoTracking()
            .Where(s => s.ReviewedAt != null)
            .Select(s => new { s.SubmittedAt, ReviewedAt = s.ReviewedAt!.Value })
            .ToListAsync(ct);

        var avgMinutes = reviewTimes.Count > 0
            ? reviewTimes.Average(r => (r.ReviewedAt - r.SubmittedAt).TotalMinutes)
            : 0;

        // Submissions over time (last N days) - fetch raw dates then group in memory
        var cutoff = DateTime.UtcNow.AddDays(-periodDays);
        var submissionDates = await _suggestionRepository.QueryNoTracking()
            .Where(s => s.SubmittedAt >= cutoff)
            .Select(s => s.SubmittedAt.Date)
            .ToListAsync(ct);

        var submissions = submissionDates
            .GroupBy(d => d)
            .Select(g => new TimeSeriesPoint(g.Key, g.Count()))
            .OrderBy(p => p.Date)
            .ToList();

        return new AnalyticsSuggestionStatsDto(
            TotalSuggestions: total,
            Pending: pending,
            Approved: approved,
            Rejected: rejected,
            NeedsInfo: needsInfo,
            AverageReviewTimeHours: Math.Round(avgMinutes / 60.0, 1),
            SubmissionsOverTime: submissions
        );
    }
}
