// File: Services/IParentChildService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Parent-Child relationship operations.
/// </summary>
public interface IParentChildService
{
    Task<ServiceResult<List<ParentChildResponse>>> GetParentsAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<ParentChildResponse>>> GetChildrenAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<ParentChildResponse>> AddParentAsync(
        Guid childId,
        Guid parentId,
        AddParentChildRequest? request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<ParentChildResponse>> UpdateRelationshipAsync(
        Guid id,
        UpdateParentChildRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteRelationshipAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> RemoveParentAsync(
        Guid childId,
        Guid parentId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<SiblingResponse>>> GetSiblingsAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
