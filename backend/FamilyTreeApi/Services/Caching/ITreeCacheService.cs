using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services.Caching;

public interface ITreeCacheService
{
    // Get cached tree data (OrgId for authorization validation)
    Task<TreePersonNode?> GetPedigreeAsync(Guid personId, int generations, Guid orgId, CancellationToken ct = default);
    Task<TreePersonNode?> GetDescendantsAsync(Guid personId, int generations, Guid orgId, CancellationToken ct = default);
    Task<TreePersonNode?> GetHourglassAsync(Guid personId, int ancestorGen, int descendantGen, Guid orgId, CancellationToken ct = default);
    Task<RelationshipPathResponse?> GetRelationshipPathAsync(Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default);
    Task<RootPersonsResponse?> GetRootPersonsAsync(Guid treeId, CancellationToken ct = default);

    // Set cached tree data
    Task SetPedigreeAsync(Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default);
    Task SetDescendantsAsync(Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default);
    Task SetHourglassAsync(Guid personId, int ancestorGen, int descendantGen, Guid orgId, TreePersonNode data, CancellationToken ct = default);
    Task SetRelationshipPathAsync(Guid person1Id, Guid person2Id, Guid orgId, RelationshipPathResponse data, CancellationToken ct = default);
    Task SetRootPersonsAsync(Guid treeId, RootPersonsResponse data, CancellationToken ct = default);

    // Invalidation - complete invalidation for a person
    Task InvalidatePersonAsync(Guid personId, Guid orgId, CancellationToken ct = default);
    Task InvalidateRelationshipPathAsync(Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default);
}
