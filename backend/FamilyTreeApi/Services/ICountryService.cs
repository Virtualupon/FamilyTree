using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Country lookup operations.
/// </summary>
public interface ICountryService
{
    /// <summary>
    /// Get all active countries
    /// </summary>
    Task<IEnumerable<CountryDto>> GetAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Get a specific country by code
    /// </summary>
    Task<CountryDto?> GetByCodeAsync(string code, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get countries filtered by region
    /// </summary>
    Task<IEnumerable<CountryDto>> GetByRegionAsync(string region, CancellationToken cancellationToken = default);
}
