// File: Repositories/IPersonNameRepository.cs
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// PersonName-specific repository interface.
/// </summary>
public interface IPersonNameRepository : IRepository<PersonName>
{
    /// <summary>
    /// Get a person name by ID with person details, verifying organization ownership.
    /// </summary>
    Task<PersonName?> GetByIdWithPersonAsync(Guid nameId, Guid personId, Guid orgId, CancellationToken cancellationToken = default);
}
