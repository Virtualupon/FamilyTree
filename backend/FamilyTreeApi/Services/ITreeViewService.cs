// File: Services/ITreeViewService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for tree view operations (pedigree, descendants, hourglass).
/// </summary>
public interface ITreeViewService
{
    Task<ServiceResult<TreePersonNode>> GetPedigreeAsync(
        TreeViewRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TreePersonNode>> GetDescendantsAsync(
        TreeViewRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TreePersonNode>> GetHourglassAsync(
        TreeViewRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<FamilyGroupResponse>> GetFamilyGroupAsync(
        Guid personId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<RelationshipResponse>> GetRelationshipAsync(
        Guid person1Id,
        Guid person2Id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
