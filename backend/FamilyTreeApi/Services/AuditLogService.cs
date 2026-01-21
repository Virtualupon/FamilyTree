using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service implementation for audit logging
/// </summary>
public class AuditLogService : IAuditLogService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(ApplicationDbContext context, ILogger<AuditLogService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task LogAsync(
        long? actorId,
        string action,
        string entityType,
        Guid entityId,
        string? changeDescription = null,
        string? previousValuesJson = null,
        string? newValuesJson = null,
        Guid? suggestionId = null,
        string? ipAddress = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var auditLog = new AuditLog
            {
                ActorId = actorId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                ChangeJson = changeDescription,
                PreviousValuesJson = previousValuesJson,
                NewValuesJson = newValuesJson,
                SuggestionId = suggestionId,
                IpAddress = ipAddress,
                Timestamp = DateTime.UtcNow
            };

            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogDebug(
                "Audit: {Action} on {EntityType}/{EntityId} by user {ActorId}",
                action, entityType, entityId, actorId);
        }
        catch (Exception ex)
        {
            // Log but don't fail the main operation
            _logger.LogError(ex, "Failed to create audit log for {Action} on {EntityType}/{EntityId}",
                action, entityType, entityId);
        }
    }

    public async Task<List<AuditLog>> GetLogsForEntityAsync(
        string entityType,
        Guid entityId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AuditLogs
            .Include(a => a.Actor)
            .Where(a => a.EntityType == entityType && a.EntityId == entityId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<AuditLog>> GetLogsForSuggestionAsync(
        Guid suggestionId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AuditLogs
            .Include(a => a.Actor)
            .Where(a => a.SuggestionId == suggestionId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<AuditLog>> GetLogsByActorAsync(
        long actorId,
        int limit = 100,
        CancellationToken cancellationToken = default)
    {
        return await _context.AuditLogs
            .Where(a => a.ActorId == actorId)
            .OrderByDescending(a => a.Timestamp)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }
}
