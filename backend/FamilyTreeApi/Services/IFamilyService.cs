using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Family operations.
/// Families group people within a family tree.
/// </summary>
public interface IFamilyService
{
    // ========================================================================
    // FAMILY CRUD
    // ========================================================================

    /// <summary>Get all families in a tree</summary>
    Task<ServiceResult<List<FamilyListItem>>> GetFamiliesByTreeAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Get all families in a town (across all accessible trees)</summary>
    Task<ServiceResult<List<FamilyListItem>>> GetFamiliesByTownAsync(
        Guid townId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Get a specific family by ID</summary>
    Task<ServiceResult<FamilyResponse>> GetFamilyAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Get a family with its members</summary>
    Task<ServiceResult<FamilyWithMembersResponse>> GetFamilyWithMembersAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Create a new family</summary>
    Task<ServiceResult<FamilyResponse>> CreateFamilyAsync(
        CreateFamilyRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Update an existing family</summary>
    Task<ServiceResult<FamilyResponse>> UpdateFamilyAsync(
        Guid id,
        UpdateFamilyRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Delete a family</summary>
    Task<ServiceResult> DeleteFamilyAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // ========================================================================
    // MEMBER ASSIGNMENT
    // ========================================================================

    /// <summary>Assign a person to a family (or remove by passing null FamilyId)</summary>
    Task<ServiceResult> AssignPersonToFamilyAsync(
        AssignFamilyRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>Bulk assign multiple people to a family</summary>
    Task<ServiceResult<int>> BulkAssignToFamilyAsync(
        Guid familyId,
        List<Guid> personIds,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
