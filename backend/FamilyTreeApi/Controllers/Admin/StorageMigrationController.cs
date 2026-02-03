using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers.Admin;

/// <summary>
/// Admin controller for storage migration operations.
/// Allows migrating media files from local storage to Cloudflare R2.
/// </summary>
[ApiController]
[Route("api/admin/storage-migration")]
[Authorize(Roles = "Admin,SuperAdmin")]
public class StorageMigrationController : ControllerBase
{
    private readonly IStorageMigrationService _migrationService;
    private readonly ILogger<StorageMigrationController> _logger;

    public StorageMigrationController(
        IStorageMigrationService migrationService,
        ILogger<StorageMigrationController> logger)
    {
        _migrationService = migrationService;
        _logger = logger;
    }

    /// <summary>
    /// Get count of files pending migration from local storage.
    /// </summary>
    [HttpGet("pending-count")]
    public async Task<ActionResult<MigrationPendingCount>> GetPendingCount(CancellationToken cancellationToken)
    {
        var result = await _migrationService.GetPendingCountAsync(cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Get current migration status/progress.
    /// </summary>
    [HttpGet("status")]
    public ActionResult<MigrationStatusResponse> GetStatus()
    {
        var status = _migrationService.GetStatus();
        return Ok(status);
    }

    /// <summary>
    /// Start migration from local storage to Cloudflare R2.
    /// Use dryRun=true (default) to preview changes without executing.
    /// </summary>
    /// <param name="request">Migration request parameters</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Migration result with progress details</returns>
    [HttpPost("migrate-to-cloudflare")]
    public async Task<ActionResult<MigrationResult>> MigrateToCloudflare(
        [FromBody] MigrationRequest request,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Migration requested: DryRun={DryRun}, OrgId={OrgId}, MaxFiles={MaxFiles}, BatchSize={BatchSize}, Concurrency={Concurrency}",
            request.DryRun, request.OrgId, request.MaxFiles, request.BatchSize, request.MaxConcurrency);

        var result = await _migrationService.MigrateToCloudflareAsync(request, cancellationToken);

        if (!result.Success && _migrationService.IsMigrationRunning)
        {
            return Conflict(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Preview migration changes without executing (shorthand for dryRun=true).
    /// </summary>
    [HttpPost("preview")]
    public async Task<ActionResult<MigrationResult>> PreviewMigration(
        [FromBody] MigrationRequest request,
        CancellationToken cancellationToken)
    {
        request.DryRun = true;
        return await MigrateToCloudflare(request, cancellationToken);
    }

    /// <summary>
    /// Cancel a running migration.
    /// </summary>
    [HttpPost("cancel")]
    public ActionResult CancelMigration()
    {
        if (!_migrationService.IsMigrationRunning)
        {
            return BadRequest(new { message = "No migration is currently running" });
        }

        _migrationService.CancelMigration();
        return Ok(new { message = "Cancellation requested" });
    }
}
