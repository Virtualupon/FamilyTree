namespace FamilyTreeApi.DTOs;

// ============================================================================
// ANALYTICS DTOs
// ============================================================================

/// <summary>
/// A single data point in a time-series (date + count).
/// </summary>
public record TimeSeriesPoint(DateTime Date, int Count);

// ============================================================================
// GROWTH METRICS
// ============================================================================

/// <summary>
/// Growth metrics: registrations, trees, people over time.
/// </summary>
public record GrowthMetricsDto(
    List<TimeSeriesPoint> UserRegistrations,
    List<TimeSeriesPoint> TreeCreations,
    List<TimeSeriesPoint> PeopleAdded,
    int TotalUsersInPeriod,
    int TotalTreesInPeriod,
    int TotalPeopleInPeriod
);

// ============================================================================
// USER ENGAGEMENT
// ============================================================================

/// <summary>
/// Active user counts by time window.
/// </summary>
public record ActiveUsersDto(
    int DailyActiveUsers,
    int WeeklyActiveUsers,
    int MonthlyActiveUsers
);

/// <summary>
/// Distribution of users across system roles.
/// </summary>
public record RoleDistributionDto(string Role, int Count);

/// <summary>
/// A top contributor (user who owns trees with most people).
/// </summary>
public record TopContributorDto(
    long UserId,
    string? Email,
    string? FirstName,
    string? LastName,
    int PeopleAdded,
    int TreesOwned
);

/// <summary>
/// Complete user engagement analytics.
/// </summary>
public record UserEngagementDto(
    ActiveUsersDto ActiveUsers,
    List<RoleDistributionDto> RoleDistribution,
    List<TopContributorDto> TopContributors
);

// ============================================================================
// CONTENT ANALYTICS
// ============================================================================

/// <summary>
/// Per-town content statistics.
/// </summary>
public record TownContentDto(
    Guid TownId,
    string TownName,
    string? TownNameAr,
    int TreeCount,
    int PersonCount
);

/// <summary>
/// Tree size distribution bucket.
/// </summary>
public record TreeSizeBucketDto(string Label, int Count);

/// <summary>
/// Content analytics overview.
/// </summary>
public record ContentAnalyticsDto(
    List<TownContentDto> TreesByTown,
    double AverageTreeSize,
    int LargestTreeSize,
    List<TreeSizeBucketDto> TreeSizeDistribution,
    int TotalRelationships,
    int TotalParentChild,
    int TotalUnions
);

// ============================================================================
// DATA QUALITY
// ============================================================================

/// <summary>
/// Privacy level distribution.
/// </summary>
public record PrivacyDistributionDto(string Level, int Count);

/// <summary>
/// Data quality metrics.
/// </summary>
public record DataQualityDto(
    int PeopleWithNoName,
    int PeopleWithNoBirthDate,
    int PeopleWithUnknownSex,
    int PeopleWithNoRelationships,
    double ProfileCompletenessPercent,
    List<PrivacyDistributionDto> PrivacyDistribution
);

// ============================================================================
// SYSTEM ACTIVITY
// ============================================================================

/// <summary>
/// Summary of audit log actions.
/// </summary>
public record AuditActionSummaryDto(string Action, string EntityType, int Count);

/// <summary>
/// Recent audit log entry for display.
/// </summary>
public record RecentAuditLogDto(
    Guid Id,
    string Action,
    string EntityType,
    DateTime Timestamp,
    long? ActorId,
    string? ActorName
);

/// <summary>
/// System activity overview.
/// </summary>
public record SystemActivityDto(
    List<AuditActionSummaryDto> ActionSummary,
    List<RecentAuditLogDto> RecentLogs,
    int TotalActionsLast24Hours,
    int TotalActionsLast7Days
);

// ============================================================================
// SUGGESTION WORKFLOW
// ============================================================================

/// <summary>
/// Suggestion workflow statistics.
/// </summary>
public record AnalyticsSuggestionStatsDto(
    int TotalSuggestions,
    int Pending,
    int Approved,
    int Rejected,
    int NeedsInfo,
    double AverageReviewTimeHours,
    List<TimeSeriesPoint> SubmissionsOverTime
);

// ============================================================================
// COMBINED ANALYTICS RESPONSE
// ============================================================================

/// <summary>
/// Full analytics dashboard payload.
/// </summary>
public record AnalyticsDashboardDto(
    GrowthMetricsDto Growth,
    UserEngagementDto Engagement,
    ContentAnalyticsDto Content,
    DataQualityDto DataQuality,
    SystemActivityDto SystemActivity,
    AnalyticsSuggestionStatsDto Suggestions
);

// ============================================================================
// ACTIVITY LOGS
// ============================================================================

/// <summary>
/// Query parameters for paginated activity log retrieval.
/// </summary>
public class ActivityLogQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public long? ActorId { get; set; }
    public string? Action { get; set; }
    public string? EntityType { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public string? Search { get; set; }
}

/// <summary>
/// Single activity log entry for display.
/// </summary>
public record ActivityLogItemDto(
    Guid Id,
    string Action,
    string EntityType,
    Guid EntityId,
    string? ChangeDescription,
    DateTime Timestamp,
    long? ActorId,
    string? ActorName,
    string? ActorEmail,
    string? IpAddress
);

/// <summary>
/// Paginated activity log response.
/// </summary>
public record ActivityLogResponse(
    List<ActivityLogItemDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

/// <summary>
/// Available filter values for activity log dropdowns.
/// </summary>
public record ActivityLogFiltersDto(
    List<string> Actions,
    List<string> EntityTypes
);
