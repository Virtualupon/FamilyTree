using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
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

    /// <summary>
    /// Log admin dashboard access for security audit trail.
    /// Uses a well-known EntityId for "Dashboard" entity since it's not a real entity.
    /// </summary>
    public async Task LogAdminAccessAsync(
        long actorId,
        string endpoint,
        string? ipAddress = null,
        CancellationToken cancellationToken = default)
    {
        // Use a fixed GUID for "Admin Dashboard" as the entity
        var dashboardEntityId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        // ChangeJson column is typed as json/jsonb in PostgreSQL — must be valid JSON
        var changeJson = JsonSerializer.Serialize(new { endpoint, timestamp = DateTime.UtcNow });

        await LogAsync(
            actorId: actorId,
            action: "AdminAccess",
            entityType: "Dashboard",
            entityId: dashboardEntityId,
            changeDescription: changeJson,
            ipAddress: ipAddress,
            cancellationToken: cancellationToken);
    }

    /// <summary>
    /// Get paginated, filtered activity logs for admin viewing.
    /// </summary>
    public async Task<ActivityLogResponse> GetPagedLogsAsync(
        ActivityLogQuery query,
        CancellationToken cancellationToken = default)
    {
        // Input validation
        query.Page = Math.Max(1, query.Page);
        query.PageSize = Math.Clamp(query.PageSize, 1, 100);

        var q = _context.AuditLogs.AsQueryable();

        // Filters
        if (query.ActorId.HasValue)
            q = q.Where(a => a.ActorId == query.ActorId.Value);
        if (!string.IsNullOrEmpty(query.Action))
            q = q.Where(a => a.Action == query.Action);
        if (!string.IsNullOrEmpty(query.EntityType))
            q = q.Where(a => a.EntityType == query.EntityType);
        if (query.From.HasValue)
            q = q.Where(a => a.Timestamp >= query.From.Value);
        if (query.To.HasValue)
            q = q.Where(a => a.Timestamp <= query.To.Value);

        // Text search — safe columns only (no JSONB), use EF.Functions.ILike for PostgreSQL
        if (!string.IsNullOrEmpty(query.Search))
        {
            var pattern = $"%{query.Search}%";
            q = q.Where(a =>
                EF.Functions.ILike(a.Action, pattern) ||
                EF.Functions.ILike(a.EntityType, pattern) ||
                (a.Actor != null && (
                    (a.Actor.Email != null && EF.Functions.ILike(a.Actor.Email, pattern)) ||
                    (a.Actor.FirstName != null && EF.Functions.ILike(a.Actor.FirstName, pattern)) ||
                    (a.Actor.LastName != null && EF.Functions.ILike(a.Actor.LastName, pattern))
                ))
            );
        }

        var totalCount = await q.CountAsync(cancellationToken);
        var totalPages = (int)Math.Ceiling(totalCount / (double)query.PageSize);

        var items = await q
            .OrderByDescending(a => a.Timestamp)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(a => new ActivityLogItemDto(
                a.Id, a.Action, a.EntityType, a.EntityId,
                a.ChangeJson,
                a.Timestamp,
                a.ActorId,
                a.Actor != null ? (a.Actor.FirstName + " " + a.Actor.LastName).Trim() : null,
                a.Actor != null ? a.Actor.Email : null,
                a.IpAddress
            ))
            .ToListAsync(cancellationToken);

        return new ActivityLogResponse(items, totalCount, query.Page, query.PageSize, totalPages);
    }

    /// <summary>
    /// Get available filter values for activity log dropdowns.
    /// Returns a static list to avoid full table scans.
    /// </summary>
    public Task<ActivityLogFiltersDto> GetFiltersAsync(
        CancellationToken cancellationToken = default)
    {
        var filters = new ActivityLogFiltersDto(
            Actions: new List<string>
            {
                "Create", "Update", "Delete", "Upload", "Unlink",
                "AddParent", "RemoveParent", "Review",
                "Login", "Register", "SelectTown",
                "Import", "AdminAccess", "UploadAvatar"
            },
            EntityTypes: new List<string>
            {
                "Person", "ParentChild", "Union", "Media", "PersonMedia",
                "PersonLink", "Auth", "Gedcom", "Dashboard"
            }
        );
        return Task.FromResult(filters);
    }
}
