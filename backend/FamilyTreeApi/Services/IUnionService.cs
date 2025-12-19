// File: Services/IUnionService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Union (marriage/partnership) operations.
/// </summary>
public interface IUnionService
{
    Task<ServiceResult<PagedResult<UnionListItemDto>>> GetUnionsAsync(
        UnionSearchDto search,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UnionResponseDto>> GetUnionAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UnionResponseDto>> CreateUnionAsync(
        CreateUnionDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UnionResponseDto>> UpdateUnionAsync(
        Guid id,
        UpdateUnionDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteUnionAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UnionMemberDto>> AddMemberAsync(
        Guid unionId,
        AddUnionMemberDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> RemoveMemberAsync(
        Guid unionId,
        Guid personId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<UnionChildDto>>> GetChildrenAsync(
        Guid unionId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<UnionChildDto>> AddChildAsync(
        Guid unionId,
        AddUnionChildDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> RemoveChildAsync(
        Guid unionId,
        Guid childId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
