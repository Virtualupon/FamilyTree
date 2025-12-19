// File: Repositories/IUnionRepository.cs
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Union-specific repository interface.
/// </summary>
public interface IUnionRepository : IRepository<Union>
{
    Task<Union?> GetByIdWithDetailsAsync(Guid id, Guid orgId, CancellationToken cancellationToken = default);

    Task<(List<UnionListItemDto> Items, int TotalCount)> GetPagedAsync(
        Guid orgId,
        UnionSearchDto search,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsInOrgAsync(Guid unionId, Guid orgId, CancellationToken cancellationToken = default);

    Task<List<UnionMember>> GetMembersAsync(Guid unionId, CancellationToken cancellationToken = default);

    Task<UnionMember?> GetMemberAsync(Guid unionId, Guid personId, CancellationToken cancellationToken = default);

    Task<List<ParentChild>> GetChildrenRelationshipsAsync(Guid unionId, CancellationToken cancellationToken = default);
}
