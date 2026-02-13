using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Analytics service for the SuperAdmin/Developer dashboard.
/// All methods require UserContext with HasAdminPanelAccess.
/// </summary>
public interface IAnalyticsService
{
    /// <summary>
    /// Get complete analytics dashboard data.
    /// Uses Redis caching (15 min TTL) for performance.
    /// </summary>
    Task<ServiceResult<AnalyticsDashboardDto>> GetDashboardAsync(
        int periodDays,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get growth metrics for a specific period (for period toggle without reloading everything).
    /// </summary>
    Task<ServiceResult<GrowthMetricsDto>> GetGrowthMetricsAsync(
        int periodDays,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
