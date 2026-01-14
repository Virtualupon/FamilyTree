using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service implementation for Country lookup operations.
/// </summary>
public class CountryService : ICountryService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CountryService> _logger;

    public CountryService(ApplicationDbContext context, ILogger<CountryService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get all active countries, ordered by DisplayOrder then NameEn
    /// </summary>
    public async Task<IEnumerable<CountryDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var countries = await _context.Countries
            .Where(c => c.IsActive)
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.NameEn)
            .Select(c => new CountryDto
            {
                Code = c.Code,
                NameEn = c.NameEn,
                NameAr = c.NameAr,
                NameLocal = c.NameLocal,
                Region = c.Region
            })
            .ToListAsync(cancellationToken);

        return countries;
    }

    /// <summary>
    /// Get a specific country by its ISO code
    /// </summary>
    public async Task<CountryDto?> GetByCodeAsync(string code, CancellationToken cancellationToken = default)
    {
        var country = await _context.Countries
            .Where(c => c.Code == code.ToUpperInvariant() && c.IsActive)
            .Select(c => new CountryDto
            {
                Code = c.Code,
                NameEn = c.NameEn,
                NameAr = c.NameAr,
                NameLocal = c.NameLocal,
                Region = c.Region
            })
            .FirstOrDefaultAsync(cancellationToken);

        return country;
    }

    /// <summary>
    /// Get countries filtered by region
    /// </summary>
    public async Task<IEnumerable<CountryDto>> GetByRegionAsync(string region, CancellationToken cancellationToken = default)
    {
        var countries = await _context.Countries
            .Where(c => c.IsActive && c.Region == region)
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.NameEn)
            .Select(c => new CountryDto
            {
                Code = c.Code,
                NameEn = c.NameEn,
                NameAr = c.NameAr,
                NameLocal = c.NameLocal,
                Region = c.Region
            })
            .ToListAsync(cancellationToken);

        return countries;
    }
}
