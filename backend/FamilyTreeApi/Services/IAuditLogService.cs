using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for audit logging
/// </summary>
public interface IAuditLogService
{
    /// <summary>
    /// Log an audit entry
    /// </summary>
    /// <param name="actorId">User ID performing the action. Nullable for system actions.</param>
    Task LogAsync(
        long? actorId,
        string action,
        string entityType,
        Guid entityId,
        string? changeDescription = null,
        string? previousValuesJson = null,
        string? newValuesJson = null,
        Guid? suggestionId = null,
        string? ipAddress = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get audit logs for an entity
    /// </summary>
    Task<List<AuditLog>> GetLogsForEntityAsync(
        string entityType,
        Guid entityId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get audit logs for a suggestion
    /// </summary>
    Task<List<AuditLog>> GetLogsForSuggestionAsync(
        Guid suggestionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get audit logs by actor (user)
    /// </summary>
    Task<List<AuditLog>> GetLogsByActorAsync(
        long actorId,
        int limit = 100,
        CancellationToken cancellationToken = default);
}
