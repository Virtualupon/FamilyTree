// File: Repositories/IPersonRepository.cs
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Person-specific repository interface for complex Person queries.
/// Extends generic repository with domain-specific operations.
/// </summary>
public interface IPersonRepository : IRepository<Person>
{
    /// <summary>
    /// Get a person by ID within a specific organization, including names and places.
    /// </summary>
    Task<Person?> GetByIdWithDetailsAsync(Guid id, Guid orgId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get paginated and filtered list of persons for an organization.
    /// </summary>
    Task<(List<PersonListItemDto> Items, int TotalCount)> GetPagedAsync(
        Guid orgId,
        PersonSearchDto search,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Check if a person exists in an organization.
    /// </summary>
    Task<bool> ExistsInOrgAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get all parent-child relationships for a person including related entities.
    /// </summary>
    Task<List<ParentChild>> GetParentChildRelationshipsAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Check if person has cross-organization relationships that prevent deletion.
    /// </summary>
    Task<bool> HasCrossOrgRelationshipsAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get union memberships for a person within their organization.
    /// </summary>
    Task<List<UnionMember>> GetUnionMembershipsAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get person tags for a person within their organization.
    /// </summary>
    Task<List<PersonTag>> GetPersonTagsAsync(Guid personId, Guid orgId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Remove all related entities for cascade delete (parent-child, union memberships, tags).
    /// </summary>
    Task RemoveRelatedEntitiesAsync(
        List<ParentChild> parentChildRecords,
        List<UnionMember> unionMemberships,
        List<PersonTag> personTags,
        CancellationToken cancellationToken = default);
}
