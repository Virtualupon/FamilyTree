// File: Services/IPersonService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Person operations.
/// Contains all business logic, validation, and orchestration.
/// Uses AutoMapper for DTO ↔ Entity mapping.
/// </summary>
public interface IPersonService
{
    // ============================================================================
    // PERSON OPERATIONS
    // ============================================================================

    /// <summary>
    /// Get paginated list of persons with filtering.
    /// </summary>
    /// <param name="search">Search/filter criteria</param>
    /// <param name="userContext">User context for authorization</param>
    /// <returns>Paginated result or error message</returns>
    Task<ServiceResult<PagedResult<PersonListItemDto>>> GetPersonsAsync(
        PersonSearchDto search,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get a single person by ID.
    /// </summary>
    Task<ServiceResult<PersonResponseDto>> GetPersonAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Create a new person.
    /// </summary>
    Task<ServiceResult<PersonResponseDto>> CreatePersonAsync(
        CreatePersonDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Update an existing person.
    /// </summary>
    Task<ServiceResult<PersonResponseDto>> UpdatePersonAsync(
        Guid id,
        UpdatePersonDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Delete a person and all related data.
    /// </summary>
    Task<ServiceResult> DeletePersonAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // ============================================================================
    // AVATAR OPERATIONS
    // ============================================================================

    /// <summary>
    /// Upload avatar for a person (atomic: creates media + sets AvatarMediaId in one transaction).
    /// </summary>
    Task<ServiceResult<UploadPersonAvatarResponse>> UploadAvatarAsync(
        Guid personId,
        UploadPersonAvatarRequest request,
        UserContext userContext,
        Guid? treeId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Remove avatar from a person (clears AvatarMediaId, optionally deletes media).
    /// </summary>
    Task<ServiceResult> RemoveAvatarAsync(
        Guid personId,
        bool deleteMedia,
        UserContext userContext,
        Guid? treeId = null,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Represents the result of a service operation.
/// </summary>
public class ServiceResult
{
    public bool IsSuccess { get; init; }
    public string? ErrorMessage { get; init; }
    public ServiceErrorType ErrorType { get; init; }

    public static ServiceResult Success() => new() { IsSuccess = true };
    public static ServiceResult Failure(string message, ServiceErrorType type = ServiceErrorType.BadRequest)
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = type };

    public static ServiceResult NotFound(string message = "Resource not found")
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = ServiceErrorType.NotFound };

    public static ServiceResult Forbidden(string message = "Access denied")
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = ServiceErrorType.Forbidden };

    public static ServiceResult InternalError(string message = "An error occurred")
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = ServiceErrorType.InternalError };
}

/// <summary>
/// Represents the result of a service operation with data.
/// </summary>
public class ServiceResult<T> : ServiceResult
{
    public T? Data { get; init; }

    public static ServiceResult<T> Success(T data) => new() { IsSuccess = true, Data = data };

    public new static ServiceResult<T> Failure(string message, ServiceErrorType type = ServiceErrorType.BadRequest)
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = type };

    public new static ServiceResult<T> NotFound(string message = "Resource not found")
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = ServiceErrorType.NotFound };

    public new static ServiceResult<T> Forbidden(string message = "Access denied")
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = ServiceErrorType.Forbidden };

    public new static ServiceResult<T> InternalError(string message = "An error occurred")
        => new() { IsSuccess = false, ErrorMessage = message, ErrorType = ServiceErrorType.InternalError };
}

/// <summary>
/// Types of service errors for proper HTTP status code mapping.
/// </summary>
public enum ServiceErrorType
{
    BadRequest,
    NotFound,
    Forbidden,
    Unauthorized,
    InternalError
}

/// <summary>
/// User context extracted from JWT claims for service-layer authorization.
/// </summary>
public class UserContext
{
    public long UserId { get; init; }
    public Guid? OrgId { get; init; }
    public Guid? SelectedTownId { get; init; }
    public string SystemRole { get; init; } = "User";
    public string TreeRole { get; init; } = "Viewer";

    public bool IsDeveloper => SystemRole == "Developer";
    public bool IsSuperAdmin => SystemRole == "SuperAdmin";
    public bool IsAdmin => SystemRole == "Admin";

    /// <summary>
    /// Returns true if the user has Developer or SuperAdmin privileges (admin-panel access).
    /// </summary>
    public bool HasAdminPanelAccess => IsDeveloper || IsSuperAdmin;

    /// <summary>
    /// Returns true if the user has Developer, SuperAdmin, or Admin privileges.
    /// </summary>
    public bool HasAdminOrHigherAccess => IsDeveloper || IsSuperAdmin || IsAdmin;

    public bool CanEdit()
    {
        if (IsDeveloper || IsSuperAdmin || IsAdmin) return true;
        return TreeRole is "Owner" or "Admin" or "Editor";
    }

    public bool CanContribute()
    {
        if (IsDeveloper || IsSuperAdmin || IsAdmin) return true;
        return TreeRole is "Owner" or "Admin" or "Editor" or "Contributor";
    }
}
