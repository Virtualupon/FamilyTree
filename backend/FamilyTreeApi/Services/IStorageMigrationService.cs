using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service for migrating media files between storage providers.
/// </summary>
public interface IStorageMigrationService
{
    /// <summary>
    /// Get count of files pending migration from local storage.
    /// </summary>
    Task<MigrationPendingCount> GetPendingCountAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Get current migration status.
    /// </summary>
    MigrationStatusResponse GetStatus();

    /// <summary>
    /// Check if a migration is currently running.
    /// </summary>
    bool IsMigrationRunning { get; }

    /// <summary>
    /// Start migration from local storage to Cloudflare R2.
    /// </summary>
    Task<MigrationResult> MigrateToCloudflareAsync(
        MigrationRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Cancel a running migration.
    /// </summary>
    void CancelMigration();
}
