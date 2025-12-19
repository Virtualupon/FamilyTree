// File: Services/TownService.cs
using AutoMapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Town service implementation containing all business logic.
/// Uses repositories for data access and AutoMapper for DTO mapping.
/// Services do NOT reference DbContext directly.
/// </summary>
public class TownService : ITownService
{
    private readonly IRepository<Town> _townRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly IRepository<OrgUser> _orgUserRepository;
    private readonly IRepository<AdminTreeAssignment> _adminAssignmentRepository;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IMapper _mapper;
    private readonly ILogger<TownService> _logger;

    public TownService(
        IRepository<Town> townRepository,
        IOrgRepository orgRepository,
        IRepository<OrgUser> orgUserRepository,
        IRepository<AdminTreeAssignment> adminAssignmentRepository,
        UserManager<ApplicationUser> userManager,
        IMapper mapper,
        ILogger<TownService> logger)
    {
        _townRepository = townRepository;
        _orgRepository = orgRepository;
        _orgUserRepository = orgUserRepository;
        _adminAssignmentRepository = adminAssignmentRepository;
        _userManager = userManager;
        _mapper = mapper;
        _logger = logger;
    }

    // ============================================================================
    // TOWN OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<PagedResult<TownListItemDto>>> GetTownsAsync(
        TownSearchDto search,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("GetTowns called: Page={Page}, PageSize={PageSize}, NameQuery={NameQuery}, Country={Country}",
                search.Page, search.PageSize, search.NameQuery, search.Country);

            var query = _townRepository.QueryNoTracking();

            // Apply filters
            if (!string.IsNullOrWhiteSpace(search.NameQuery))
            {
                var searchTerm = search.NameQuery.ToLower();
                query = query.Where(t =>
                    t.Name.ToLower().Contains(searchTerm) ||
                    (t.NameEn != null && t.NameEn.ToLower().Contains(searchTerm)) ||
                    (t.NameAr != null && t.NameAr.ToLower().Contains(searchTerm)) ||
                    (t.NameLocal != null && t.NameLocal.ToLower().Contains(searchTerm)));
            }

            if (!string.IsNullOrWhiteSpace(search.Country))
            {
                query = query.Where(t => t.Country == search.Country);
            }

            var totalCount = await query.CountAsync(cancellationToken);

            var towns = await query
                .OrderBy(t => t.Name)
                .Skip((search.Page - 1) * search.PageSize)
                .Take(search.PageSize)
                .Select(t => new TownListItemDto(
                    t.Id,
                    t.Name,
                    t.NameEn,
                    t.NameAr,
                    t.NameLocal,
                    t.Country,
                    t.FamilyTrees.Count,
                    t.CreatedAt
                ))
                .ToListAsync(cancellationToken);

            var totalPages = (int)Math.Ceiling(totalCount / (double)search.PageSize);

            var result = new PagedResult<TownListItemDto>(
                towns,
                totalCount,
                search.Page,
                search.PageSize,
                totalPages
            );

            return ServiceResult<PagedResult<TownListItemDto>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting towns. Exception type: {ExceptionType}, Message: {Message}",
                ex.GetType().Name, ex.Message);
            return ServiceResult<PagedResult<TownListItemDto>>.InternalError("Error loading towns");
        }
    }

    public async Task<ServiceResult<TownDetailDto>> GetTownAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var town = await _townRepository.QueryNoTracking()
                .Include(t => t.FamilyTrees)
                .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

            if (town == null)
            {
                return ServiceResult<TownDetailDto>.NotFound("Town not found");
            }

            var dto = new TownDetailDto(
                town.Id,
                town.Name,
                town.NameEn,
                town.NameAr,
                town.NameLocal,
                town.Description,
                town.Country,
                town.FamilyTrees.Count,
                town.CreatedAt,
                town.UpdatedAt
            );

            return ServiceResult<TownDetailDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting town {TownId}: {Message}", id, ex.Message);
            return ServiceResult<TownDetailDto>.InternalError("Error loading town");
        }
    }

    public async Task<ServiceResult<List<FamilyTreeListItem>>> GetTownTreesAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var town = await _townRepository.GetByIdAsync(id, cancellationToken);
            if (town == null)
            {
                return ServiceResult<List<FamilyTreeListItem>>.NotFound("Town not found");
            }

            IQueryable<Org> query = _orgRepository.QueryNoTracking()
                .Where(o => o.TownId == id);

            // Filter based on access
            if (!userContext.IsSuperAdmin)
            {
                if (userContext.IsAdmin)
                {
                    // Admin sees trees they have assignment to + public trees + member trees
                    var assignedTreeIds = await _adminAssignmentRepository.QueryNoTracking()
                        .Where(a => a.UserId == userContext.UserId)
                        .Select(a => a.TreeId)
                        .ToListAsync(cancellationToken);

                    var memberTreeIds = await _orgUserRepository.QueryNoTracking()
                        .Where(ou => ou.UserId == userContext.UserId)
                        .Select(ou => ou.OrgId)
                        .ToListAsync(cancellationToken);

                    var accessibleTreeIds = assignedTreeIds.Union(memberTreeIds).ToList();
                    query = query.Where(o => o.IsPublic || accessibleTreeIds.Contains(o.Id));
                }
                else
                {
                    // Regular user sees public trees + member trees
                    var memberTreeIds = await _orgUserRepository.QueryNoTracking()
                        .Where(ou => ou.UserId == userContext.UserId)
                        .Select(ou => ou.OrgId)
                        .ToListAsync(cancellationToken);

                    query = query.Where(o => o.IsPublic || memberTreeIds.Contains(o.Id));
                }
            }

            var trees = await query
                .OrderBy(o => o.Name)
                .Select(o => new FamilyTreeListItem(
                    o.Id,
                    o.Name,
                    o.Description,
                    o.IsPublic,
                    o.CoverImageUrl,
                    o.People.Count,
                    o.OrgUsers.Where(ou => ou.UserId == userContext.UserId).Select(ou => (OrgRole?)ou.Role).FirstOrDefault(),
                    o.CreatedAt
                ))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<FamilyTreeListItem>>.Success(trees);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting trees for town {TownId}: {Message}", id, ex.Message);
            return ServiceResult<List<FamilyTreeListItem>>.InternalError("Error loading town trees");
        }
    }

    public async Task<ServiceResult<TownDetailDto>> CreateTownAsync(
        CreateTownDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsSuperAdmin && !userContext.IsAdmin)
        {
            return ServiceResult<TownDetailDto>.Forbidden();
        }

        try
        {
            // Check for duplicate name
            var existingTown = await _townRepository.FirstOrDefaultAsync(
                t => t.Name.ToLower() == dto.Name.ToLower(),
                cancellationToken);

            if (existingTown != null)
            {
                return ServiceResult<TownDetailDto>.Failure("A town with this name already exists");
            }

            var town = new Town
            {
                Id = Guid.NewGuid(),
                Name = dto.Name,
                NameEn = dto.NameEn,
                NameAr = dto.NameAr,
                NameLocal = dto.NameLocal,
                Description = dto.Description,
                Country = dto.Country,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _townRepository.Add(town);
            await _townRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Town created: {TownId} - {TownName}", town.Id, town.Name);

            var resultDto = new TownDetailDto(
                town.Id,
                town.Name,
                town.NameEn,
                town.NameAr,
                town.NameLocal,
                town.Description,
                town.Country,
                0,
                town.CreatedAt,
                town.UpdatedAt
            );

            return ServiceResult<TownDetailDto>.Success(resultDto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating town: {Message}", ex.Message);
            return ServiceResult<TownDetailDto>.InternalError("Error creating town");
        }
    }

    public async Task<ServiceResult<TownDetailDto>> UpdateTownAsync(
        Guid id,
        UpdateTownDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsSuperAdmin && !userContext.IsAdmin)
        {
            return ServiceResult<TownDetailDto>.Forbidden();
        }

        try
        {
            var town = await _townRepository.QueryNoTracking()
                .Include(t => t.FamilyTrees)
                .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

            if (town == null)
            {
                return ServiceResult<TownDetailDto>.NotFound("Town not found");
            }

            // Detach the tracked entity and get a fresh one for update
            var townToUpdate = await _townRepository.GetByIdAsync(id, cancellationToken);
            if (townToUpdate == null)
            {
                return ServiceResult<TownDetailDto>.NotFound("Town not found");
            }

            // Check for duplicate name if name is being changed
            if (dto.Name != null && dto.Name.ToLower() != townToUpdate.Name.ToLower())
            {
                var existingTown = await _townRepository.FirstOrDefaultAsync(
                    t => t.Name.ToLower() == dto.Name.ToLower() && t.Id != id,
                    cancellationToken);

                if (existingTown != null)
                {
                    return ServiceResult<TownDetailDto>.Failure("A town with this name already exists");
                }
            }

            // Apply partial updates
            if (dto.Name != null) townToUpdate.Name = dto.Name;
            if (dto.NameEn != null) townToUpdate.NameEn = dto.NameEn;
            if (dto.NameAr != null) townToUpdate.NameAr = dto.NameAr;
            if (dto.NameLocal != null) townToUpdate.NameLocal = dto.NameLocal;
            if (dto.Description != null) townToUpdate.Description = dto.Description;
            if (dto.Country != null) townToUpdate.Country = dto.Country;
            townToUpdate.UpdatedAt = DateTime.UtcNow;

            await _townRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Town updated: {TownId}", id);

            var resultDto = new TownDetailDto(
                townToUpdate.Id,
                townToUpdate.Name,
                townToUpdate.NameEn,
                townToUpdate.NameAr,
                townToUpdate.NameLocal,
                townToUpdate.Description,
                townToUpdate.Country,
                town.FamilyTrees.Count,
                townToUpdate.CreatedAt,
                townToUpdate.UpdatedAt
            );

            return ServiceResult<TownDetailDto>.Success(resultDto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating town {TownId}: {Message}", id, ex.Message);
            return ServiceResult<TownDetailDto>.InternalError("Error updating town");
        }
    }

    public async Task<ServiceResult> DeleteTownAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsSuperAdmin)
        {
            return ServiceResult.Forbidden();
        }

        try
        {
            var town = await _townRepository.Query()
                .Include(t => t.FamilyTrees)
                .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

            if (town == null)
            {
                return ServiceResult.NotFound("Town not found");
            }

            // Check if town has trees
            if (town.FamilyTrees.Count > 0)
            {
                return ServiceResult.Failure($"Cannot delete town. It has {town.FamilyTrees.Count} family tree(s) associated with it.");
            }

            _townRepository.Remove(town);
            await _townRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Town deleted: {TownId}", id);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting town {TownId}: {Message}", id, ex.Message);
            return ServiceResult.InternalError("Error deleting town");
        }
    }

    // ============================================================================
    // CSV IMPORT
    // ============================================================================

    public async Task<ServiceResult<TownImportResultDto>> ImportTownsAsync(
        IFormFile file,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsSuperAdmin && !userContext.IsAdmin)
        {
            return ServiceResult<TownImportResultDto>.Forbidden();
        }

        try
        {
            if (file == null || file.Length == 0)
            {
                return ServiceResult<TownImportResultDto>.Failure("No file provided");
            }

            if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            {
                return ServiceResult<TownImportResultDto>.Failure("File must be a CSV file");
            }

            var errors = new List<TownImportErrorDto>();
            var created = 0;
            var skipped = 0;
            var totalRows = 0;

            using var reader = new StreamReader(file.OpenReadStream());
            var headerLine = await reader.ReadLineAsync();

            if (string.IsNullOrWhiteSpace(headerLine))
            {
                return ServiceResult<TownImportResultDto>.Failure("CSV file is empty");
            }

            // Validate headers
            var headers = headerLine.Split(',').Select(h => h.Trim().ToLower()).ToList();
            var expectedHeaders = new[] { "name", "name_en", "name_ar", "name_local", "country" };

            if (!expectedHeaders.All(h => headers.Contains(h)))
            {
                return ServiceResult<TownImportResultDto>.Failure($"CSV must contain headers: {string.Join(", ", expectedHeaders)}");
            }

            var nameIndex = headers.IndexOf("name");
            var nameEnIndex = headers.IndexOf("name_en");
            var nameArIndex = headers.IndexOf("name_ar");
            var nameLocalIndex = headers.IndexOf("name_local");
            var countryIndex = headers.IndexOf("country");

            var existingTownsList = await _townRepository.QueryNoTracking()
                .Select(t => t.Name.ToLower())
                .ToListAsync(cancellationToken);
            var existingTowns = existingTownsList.ToHashSet();

            var townsToAdd = new List<Town>();
            var rowNumber = 1; // Header is row 1

            string? line;
            while ((line = await reader.ReadLineAsync()) != null)
            {
                rowNumber++;
                totalRows++;

                if (string.IsNullOrWhiteSpace(line)) continue;

                var values = ParseCsvLine(line);

                if (values.Count < headers.Count)
                {
                    errors.Add(new TownImportErrorDto(rowNumber, "", "Invalid row format - too few columns"));
                    continue;
                }

                var name = GetValueAtIndex(values, nameIndex);
                var nameEn = GetValueAtIndex(values, nameEnIndex);
                var nameAr = GetValueAtIndex(values, nameArIndex);
                var nameLocal = GetValueAtIndex(values, nameLocalIndex);
                var country = GetValueAtIndex(values, countryIndex);

                if (string.IsNullOrWhiteSpace(name))
                {
                    errors.Add(new TownImportErrorDto(rowNumber, "", "Name is required"));
                    continue;
                }

                // Check for duplicate in existing or in this batch
                if (existingTowns.Contains(name.ToLower()) ||
                    townsToAdd.Any(t => t.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
                {
                    skipped++;
                    continue;
                }

                townsToAdd.Add(new Town
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    NameEn = string.IsNullOrWhiteSpace(nameEn) ? null : nameEn,
                    NameAr = string.IsNullOrWhiteSpace(nameAr) ? null : nameAr,
                    NameLocal = string.IsNullOrWhiteSpace(nameLocal) ? null : nameLocal,
                    Country = string.IsNullOrWhiteSpace(country) ? null : country,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });

                created++;
            }

            if (townsToAdd.Count > 0)
            {
                _townRepository.AddRange(townsToAdd);
                await _townRepository.SaveChangesAsync(cancellationToken);
            }

            _logger.LogInformation("CSV import completed: {Created} created, {Skipped} skipped, {Errors} errors",
                created, skipped, errors.Count);

            var result = new TownImportResultDto(
                totalRows,
                created,
                skipped,
                errors.Count,
                errors
            );

            return ServiceResult<TownImportResultDto>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error importing towns: {Message}", ex.Message);
            return ServiceResult<TownImportResultDto>.InternalError("Error importing towns");
        }
    }

    public async Task<ServiceResult<List<string>>> GetCountriesAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            var countries = await _townRepository.QueryNoTracking()
                .Where(t => t.Country != null)
                .Select(t => t.Country!)
                .Distinct()
                .OrderBy(c => c)
                .ToListAsync(cancellationToken);

            return ServiceResult<List<string>>.Success(countries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting countries: {Message}", ex.Message);
            return ServiceResult<List<string>>.InternalError("Error loading countries");
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    private static List<string> ParseCsvLine(string line)
    {
        var values = new List<string>();
        var inQuotes = false;
        var currentValue = "";

        for (int i = 0; i < line.Length; i++)
        {
            var c = line[i];

            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    // Escaped quote
                    currentValue += '"';
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                values.Add(currentValue.Trim());
                currentValue = "";
            }
            else
            {
                currentValue += c;
            }
        }

        values.Add(currentValue.Trim());
        return values;
    }

    private static string? GetValueAtIndex(List<string> values, int index)
    {
        if (index < 0 || index >= values.Count)
            return null;

        var value = values[index];
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
