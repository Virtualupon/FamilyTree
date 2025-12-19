using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using System.Security.Claims;
using System.Globalization;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TownController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<TownController> _logger;

    public TownController(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        ILogger<TownController> logger)
    {
        _context = context;
        _userManager = userManager;
        _logger = logger;
    }

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
        {
            throw new UnauthorizedAccessException("User ID not found in token");
        }
        return userId;
    }

    private async Task<ApplicationUser?> GetCurrentUser()
    {
        var userId = GetUserId();
        return await _userManager.FindByIdAsync(userId.ToString());
    }

    private async Task<bool> IsAdminOrSuperAdmin()
    {
        var user = await GetCurrentUser();
        if (user == null) return false;

        return await _userManager.IsInRoleAsync(user, "SuperAdmin") ||
               await _userManager.IsInRoleAsync(user, "Admin");
    }

    private async Task<bool> IsSuperAdmin()
    {
        var user = await GetCurrentUser();
        if (user == null) return false;

        return await _userManager.IsInRoleAsync(user, "SuperAdmin");
    }

    // ========================================================================
    // TOWN CRUD
    // ========================================================================

    /// <summary>
    /// Get all towns with pagination and filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<TownListItemDto>>> GetTowns(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? nameQuery = null,
        [FromQuery] string? country = null)
    {
        var query = _context.Towns.AsQueryable();

        // Apply filters
        if (!string.IsNullOrWhiteSpace(nameQuery))
        {
            var searchTerm = nameQuery.ToLower();
            query = query.Where(t =>
                t.Name.ToLower().Contains(searchTerm) ||
                (t.NameEn != null && t.NameEn.ToLower().Contains(searchTerm)) ||
                (t.NameAr != null && t.NameAr.ToLower().Contains(searchTerm)) ||
                (t.NameLocal != null && t.NameLocal.ToLower().Contains(searchTerm)));
        }

        if (!string.IsNullOrWhiteSpace(country))
        {
            query = query.Where(t => t.Country == country);
        }

        var totalCount = await query.CountAsync();

        var towns = await query
            .OrderBy(t => t.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
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
            .ToListAsync();

        return new PagedResult<TownListItemDto>(
            towns,
            totalCount,
            page,
            pageSize,
            (int)Math.Ceiling((double)totalCount / pageSize)
        );
    }

    /// <summary>
    /// Get a specific town by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<TownDetailDto>> GetTown(Guid id)
    {
        var town = await _context.Towns
            .Include(t => t.FamilyTrees)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (town == null)
        {
            return NotFound(new { message = "Town not found" });
        }

        return new TownDetailDto(
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
    }

    /// <summary>
    /// Get all trees in a specific town
    /// </summary>
    [HttpGet("{id}/trees")]
    public async Task<ActionResult<List<FamilyTreeListItem>>> GetTownTrees(Guid id)
    {
        var town = await _context.Towns.FindAsync(id);
        if (town == null)
        {
            return NotFound(new { message = "Town not found" });
        }

        var userId = GetUserId();
        var user = await GetCurrentUser();
        var isSuperAdmin = user != null && await _userManager.IsInRoleAsync(user, "SuperAdmin");
        var isAdmin = user != null && await _userManager.IsInRoleAsync(user, "Admin");

        IQueryable<Org> query = _context.Orgs.Where(o => o.TownId == id);

        // Filter based on access
        if (!isSuperAdmin)
        {
            if (isAdmin)
            {
                // Admin sees trees they have assignment to + public trees + member trees
                var assignedTreeIds = await _context.AdminTreeAssignments
                    .Where(a => a.UserId == userId)
                    .Select(a => a.TreeId)
                    .ToListAsync();

                var memberTreeIds = await _context.OrgUsers
                    .Where(ou => ou.UserId == userId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync();

                var accessibleTreeIds = assignedTreeIds.Union(memberTreeIds).ToList();
                query = query.Where(o => o.IsPublic || accessibleTreeIds.Contains(o.Id));
            }
            else
            {
                // Regular user sees public trees + member trees
                var memberTreeIds = await _context.OrgUsers
                    .Where(ou => ou.UserId == userId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync();

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
                o.OrgUsers.Where(ou => ou.UserId == userId).Select(ou => (Models.Enums.OrgRole?)ou.Role).FirstOrDefault(),
                o.CreatedAt
            ))
            .ToListAsync();

        return trees;
    }

    /// <summary>
    /// Create a new town (Admin/SuperAdmin only)
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<TownDetailDto>> CreateTown(CreateTownDto request)
    {
        if (!await IsAdminOrSuperAdmin())
        {
            return Forbid();
        }

        // Check for duplicate name
        var existingTown = await _context.Towns
            .FirstOrDefaultAsync(t => t.Name.ToLower() == request.Name.ToLower());

        if (existingTown != null)
        {
            return BadRequest(new { message = "A town with this name already exists" });
        }

        var town = new Town
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            NameEn = request.NameEn,
            NameAr = request.NameAr,
            NameLocal = request.NameLocal,
            Description = request.Description,
            Country = request.Country,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Towns.Add(town);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Town created: {TownId} - {TownName}", town.Id, town.Name);

        return CreatedAtAction(nameof(GetTown), new { id = town.Id }, new TownDetailDto(
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
        ));
    }

    /// <summary>
    /// Update an existing town (Admin/SuperAdmin only)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<TownDetailDto>> UpdateTown(Guid id, UpdateTownDto request)
    {
        if (!await IsAdminOrSuperAdmin())
        {
            return Forbid();
        }

        var town = await _context.Towns
            .Include(t => t.FamilyTrees)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (town == null)
        {
            return NotFound(new { message = "Town not found" });
        }

        // Check for duplicate name if name is being changed
        if (request.Name != null && request.Name.ToLower() != town.Name.ToLower())
        {
            var existingTown = await _context.Towns
                .FirstOrDefaultAsync(t => t.Name.ToLower() == request.Name.ToLower() && t.Id != id);

            if (existingTown != null)
            {
                return BadRequest(new { message = "A town with this name already exists" });
            }
        }

        if (request.Name != null) town.Name = request.Name;
        if (request.NameEn != null) town.NameEn = request.NameEn;
        if (request.NameAr != null) town.NameAr = request.NameAr;
        if (request.NameLocal != null) town.NameLocal = request.NameLocal;
        if (request.Description != null) town.Description = request.Description;
        if (request.Country != null) town.Country = request.Country;
        town.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Town updated: {TownId}", id);

        return new TownDetailDto(
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
    }

    /// <summary>
    /// Delete a town (SuperAdmin only)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTown(Guid id)
    {
        if (!await IsSuperAdmin())
        {
            return Forbid();
        }

        var town = await _context.Towns
            .Include(t => t.FamilyTrees)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (town == null)
        {
            return NotFound(new { message = "Town not found" });
        }

        // Check if town has trees
        if (town.FamilyTrees.Count > 0)
        {
            return BadRequest(new { message = $"Cannot delete town. It has {town.FamilyTrees.Count} family tree(s) associated with it." });
        }

        _context.Towns.Remove(town);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Town deleted: {TownId}", id);

        return NoContent();
    }

    // ========================================================================
    // CSV IMPORT
    // ========================================================================

    /// <summary>
    /// Import towns from CSV file (Admin/SuperAdmin only)
    /// Expected format: name,name_en,name_ar,name_local,country
    /// </summary>
    [HttpPost("import")]
    public async Task<ActionResult<TownImportResultDto>> ImportTowns(IFormFile file)
    {
        if (!await IsAdminOrSuperAdmin())
        {
            return Forbid();
        }

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "No file provided" });
        }

        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "File must be a CSV file" });
        }

        var result = new TownImportResultDto(0, 0, 0, 0, new List<TownImportErrorDto>());
        var errors = new List<TownImportErrorDto>();
        var created = 0;
        var skipped = 0;
        var totalRows = 0;

        using var reader = new StreamReader(file.OpenReadStream());
        var headerLine = await reader.ReadLineAsync();

        if (string.IsNullOrWhiteSpace(headerLine))
        {
            return BadRequest(new { message = "CSV file is empty" });
        }

        // Validate headers
        var headers = headerLine.Split(',').Select(h => h.Trim().ToLower()).ToList();
        var expectedHeaders = new[] { "name", "name_en", "name_ar", "name_local", "country" };

        if (!expectedHeaders.All(h => headers.Contains(h)))
        {
            return BadRequest(new { message = $"CSV must contain headers: {string.Join(", ", expectedHeaders)}" });
        }

        var nameIndex = headers.IndexOf("name");
        var nameEnIndex = headers.IndexOf("name_en");
        var nameArIndex = headers.IndexOf("name_ar");
        var nameLocalIndex = headers.IndexOf("name_local");
        var countryIndex = headers.IndexOf("country");

        var existingTownsList = await _context.Towns
            .Select(t => t.Name.ToLower())
            .ToListAsync();
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
            _context.Towns.AddRange(townsToAdd);
            await _context.SaveChangesAsync();
        }

        _logger.LogInformation("CSV import completed: {Created} created, {Skipped} skipped, {Errors} errors",
            created, skipped, errors.Count);

        return new TownImportResultDto(
            totalRows,
            created,
            skipped,
            errors.Count,
            errors
        );
    }

    /// <summary>
    /// Get list of unique countries from all towns
    /// </summary>
    [HttpGet("countries")]
    public async Task<ActionResult<List<string>>> GetCountries()
    {
        var countries = await _context.Towns
            .Where(t => t.Country != null)
            .Select(t => t.Country!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        return countries;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

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
