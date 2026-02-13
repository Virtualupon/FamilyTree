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

    /// <summary>
    /// Find the relationship path between two people using BFS.
    /// Returns the shortest path with full person details and relationship labels.
    /// </summary>
    Task<ServiceResult<RelationshipPathResponse>> FindRelationshipPathAsync(
        RelationshipPathRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get root persons (top-level ancestors with no parents) for a tree.
    /// These are the starting points for visualizing the family hierarchy.
    /// Results are limited to prevent performance issues with malformed trees.
    /// </summary>
    Task<ServiceResult<RootPersonsResponse>> GetRootPersonsAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
