using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for family relationship type operations
/// </summary>
public interface IFamilyRelationshipTypeService
{
    /// <summary>
    /// Get all active family relationship types
    /// </summary>
    Task<IEnumerable<FamilyRelationshipTypeDto>> GetAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Get all active family relationship types grouped by category
    /// </summary>
    Task<IEnumerable<FamilyRelationshipTypeGroupedDto>> GetAllGroupedAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Get a specific family relationship type by ID
    /// </summary>
    Task<FamilyRelationshipTypeDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
}
