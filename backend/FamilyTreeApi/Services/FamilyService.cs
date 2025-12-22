using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Services;

/// <summary>
/// Family service implementation for managing family groups within trees.
/// </summary>
public class FamilyService : IFamilyService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<FamilyService> _logger;

    public FamilyService(
        ApplicationDbContext context,
        ILogger<FamilyService> logger)
    {
        _context = context;
        _logger = logger;
    }

    // ========================================================================
    // FAMILY CRUD
    // ========================================================================

    public async Task<ServiceResult<List<FamilyListItem>>> GetFamiliesByTreeAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<List<FamilyListItem>>.Forbidden("You do not have access to this tree");
            }

            var families = await _context.Set<Family>()
                .Where(f => f.OrgId == treeId)
                .OrderBy(f => f.SortOrder)
                .ThenBy(f => f.Name)
                .Select(f => new FamilyListItem(
                    f.Id,
                    f.Name,
                    f.NameEn,
                    f.NameAr,
                    f.NameLocal,
                    f.Color,
                    f.Members.Count,
                    f.SortOrder
                ))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<FamilyListItem>>.Success(families);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting families for tree {TreeId}", treeId);
            return ServiceResult<List<FamilyListItem>>.InternalError("Error loading families");
        }
    }

    public async Task<ServiceResult<List<FamilyListItem>>> GetFamiliesByTownAsync(
        Guid townId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Get accessible tree IDs for this user
            var accessibleTreeIds = await GetAccessibleTreeIdsAsync(userContext, cancellationToken);

            var families = await _context.Set<Family>()
                .Where(f => f.TownId == townId && accessibleTreeIds.Contains(f.OrgId))
                .OrderBy(f => f.Org.Name)
                .ThenBy(f => f.SortOrder)
                .ThenBy(f => f.Name)
                .Select(f => new FamilyListItem(
                    f.Id,
                    f.Name,
                    f.NameEn,
                    f.NameAr,
                    f.NameLocal,
                    f.Color,
                    f.Members.Count,
                    f.SortOrder
                ))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<FamilyListItem>>.Success(families);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting families for town {TownId}", townId);
            return ServiceResult<List<FamilyListItem>>.InternalError("Error loading families");
        }
    }

    public async Task<ServiceResult<FamilyResponse>> GetFamilyAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var family = await _context.Set<Family>()
                .Include(f => f.Org)
                .Include(f => f.Town)
                .Include(f => f.Patriarch)
                .Include(f => f.Matriarch)
                .Include(f => f.Members)
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (family == null)
            {
                return ServiceResult<FamilyResponse>.NotFound("Family not found");
            }

            if (!await HasTreeAccessAsync(family.OrgId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<FamilyResponse>.Forbidden("You do not have access to this family");
            }

            var response = MapToFamilyResponse(family);
            return ServiceResult<FamilyResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family {FamilyId}", id);
            return ServiceResult<FamilyResponse>.InternalError("Error loading family");
        }
    }

    public async Task<ServiceResult<FamilyWithMembersResponse>> GetFamilyWithMembersAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var family = await _context.Set<Family>()
                .Include(f => f.Org)
                .Include(f => f.Town)
                .Include(f => f.Patriarch)
                .Include(f => f.Matriarch)
                .Include(f => f.Members)
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (family == null)
            {
                return ServiceResult<FamilyWithMembersResponse>.NotFound("Family not found");
            }

            if (!await HasTreeAccessAsync(family.OrgId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<FamilyWithMembersResponse>.Forbidden("You do not have access to this family");
            }

            var members = family.Members
                .OrderBy(p => p.PrimaryName ?? "")
                .Select(p => new FamilyMemberDto(
                    p.Id,
                    p.PrimaryName ?? p.Names.FirstOrDefault(n => n.Type == Models.Enums.NameType.Primary)?.Full ?? p.Names.FirstOrDefault()?.Full,
                    (int)p.Sex,
                    p.BirthDate?.ToString("yyyy-MM-dd"),
                    p.DeathDate?.ToString("yyyy-MM-dd"),
                    p.DeathDate == null  // IsLiving = no death date recorded
                ))
                .ToList();

            var response = new FamilyWithMembersResponse(
                family.Id,
                family.Name,
                family.NameEn,
                family.NameAr,
                family.NameLocal,
                family.Description,
                family.OrgId,
                family.Org.Name,
                family.TownId,
                family.Town.Name,
                family.PatriarchId,
                GetPersonPrimaryName(family.Patriarch),
                family.MatriarchId,
                GetPersonPrimaryName(family.Matriarch),
                family.Color,
                family.SortOrder,
                members,
                family.CreatedAt,
                family.UpdatedAt
            );

            return ServiceResult<FamilyWithMembersResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family with members {FamilyId}", id);
            return ServiceResult<FamilyWithMembersResponse>.InternalError("Error loading family");
        }
    }

    public async Task<ServiceResult<FamilyResponse>> CreateFamilyAsync(
        CreateFamilyRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check tree access (Editor or above can create families)
            if (!await HasTreeAccessAsync(request.OrgId, userContext, OrgRole.Editor, cancellationToken))
            {
                return ServiceResult<FamilyResponse>.Forbidden("You do not have permission to create families in this tree");
            }

            // Get the org to get TownId
            var org = await _context.Orgs
                .Include(o => o.Town)
                .FirstOrDefaultAsync(o => o.Id == request.OrgId, cancellationToken);

            if (org == null)
            {
                return ServiceResult<FamilyResponse>.Failure("Family tree not found", ServiceErrorType.NotFound);
            }

            // Check for duplicate family name in the same town
            var duplicateExists = await _context.Set<Family>()
                .AnyAsync(f => f.TownId == org.TownId && f.Name == request.Name, cancellationToken);

            if (duplicateExists)
            {
                return ServiceResult<FamilyResponse>.Failure(
                    $"A family with the name '{request.Name}' already exists in this town",
                    ServiceErrorType.BadRequest);
            }

            var family = new Family
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                NameEn = request.NameEn,
                NameAr = request.NameAr,
                NameLocal = request.NameLocal,
                Description = request.Description,
                OrgId = request.OrgId,
                TownId = org.TownId,
                PatriarchId = request.PatriarchId,
                MatriarchId = request.MatriarchId,
                Color = request.Color,
                SortOrder = request.SortOrder,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Set<Family>().Add(family);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Family created: {FamilyId} in tree {TreeId} by user {UserId}",
                family.Id, family.OrgId, userContext.UserId);

            // Reload with relationships
            family = await _context.Set<Family>()
                .Include(f => f.Org)
                .Include(f => f.Town)
                .Include(f => f.Patriarch)
                .Include(f => f.Matriarch)
                .Include(f => f.Members)
                .FirstAsync(f => f.Id == family.Id, cancellationToken);

            var response = MapToFamilyResponse(family);
            return ServiceResult<FamilyResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating family");
            return ServiceResult<FamilyResponse>.InternalError("Error creating family");
        }
    }

    public async Task<ServiceResult<FamilyResponse>> UpdateFamilyAsync(
        Guid id,
        UpdateFamilyRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var family = await _context.Set<Family>()
                .Include(f => f.Org)
                .Include(f => f.Town)
                .Include(f => f.Patriarch)
                .Include(f => f.Matriarch)
                .Include(f => f.Members)
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (family == null)
            {
                return ServiceResult<FamilyResponse>.NotFound("Family not found");
            }

            if (!await HasTreeAccessAsync(family.OrgId, userContext, OrgRole.Editor, cancellationToken))
            {
                return ServiceResult<FamilyResponse>.Forbidden("You do not have permission to update this family");
            }

            // Check for duplicate family name in the same town (if name is being changed)
            if (request.Name != null && request.Name != family.Name)
            {
                var duplicateExists = await _context.Set<Family>()
                    .AnyAsync(f => f.TownId == family.TownId && f.Name == request.Name && f.Id != id, cancellationToken);

                if (duplicateExists)
                {
                    return ServiceResult<FamilyResponse>.Failure(
                        $"A family with the name '{request.Name}' already exists in this town",
                        ServiceErrorType.BadRequest);
                }
            }

            // Update fields
            if (request.Name != null) family.Name = request.Name;
            if (request.NameEn != null) family.NameEn = request.NameEn;
            if (request.NameAr != null) family.NameAr = request.NameAr;
            if (request.NameLocal != null) family.NameLocal = request.NameLocal;
            if (request.Description != null) family.Description = request.Description;
            if (request.PatriarchId.HasValue) family.PatriarchId = request.PatriarchId.Value == Guid.Empty ? null : request.PatriarchId;
            if (request.MatriarchId.HasValue) family.MatriarchId = request.MatriarchId.Value == Guid.Empty ? null : request.MatriarchId;
            if (request.Color != null) family.Color = request.Color;
            if (request.SortOrder.HasValue) family.SortOrder = request.SortOrder.Value;

            family.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Family updated: {FamilyId}", id);

            // Reload patriarch/matriarch if changed
            if (request.PatriarchId.HasValue && family.PatriarchId.HasValue)
            {
                family.Patriarch = await _context.People.FindAsync(new object[] { family.PatriarchId.Value }, cancellationToken);
            }
            if (request.MatriarchId.HasValue && family.MatriarchId.HasValue)
            {
                family.Matriarch = await _context.People.FindAsync(new object[] { family.MatriarchId.Value }, cancellationToken);
            }

            var response = MapToFamilyResponse(family);
            return ServiceResult<FamilyResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating family {FamilyId}", id);
            return ServiceResult<FamilyResponse>.InternalError("Error updating family");
        }
    }

    public async Task<ServiceResult> DeleteFamilyAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var family = await _context.Set<Family>()
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (family == null)
            {
                return ServiceResult.NotFound("Family not found");
            }

            if (!await HasTreeAccessAsync(family.OrgId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult.Forbidden("You do not have permission to delete this family");
            }

            // Remove family assignments from people (set FamilyId to null)
            var peopleInFamily = await _context.People
                .Where(p => p.FamilyId == id)
                .ToListAsync(cancellationToken);

            foreach (var person in peopleInFamily)
            {
                person.FamilyId = null;
            }

            _context.Set<Family>().Remove(family);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Family deleted: {FamilyId} by user {UserId}", id, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting family {FamilyId}", id);
            return ServiceResult.InternalError("Error deleting family");
        }
    }

    // ========================================================================
    // MEMBER ASSIGNMENT
    // ========================================================================

    public async Task<ServiceResult> AssignPersonToFamilyAsync(
        AssignFamilyRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var person = await _context.People.FindAsync(new object[] { request.PersonId }, cancellationToken);
            if (person == null)
            {
                return ServiceResult.NotFound("Person not found");
            }

            if (!await HasTreeAccessAsync(person.OrgId, userContext, OrgRole.Editor, cancellationToken))
            {
                return ServiceResult.Forbidden("You do not have permission to assign family members");
            }

            if (request.FamilyId.HasValue)
            {
                // Verify family exists and is in the same tree
                var family = await _context.Set<Family>().FindAsync(new object[] { request.FamilyId.Value }, cancellationToken);
                if (family == null)
                {
                    return ServiceResult.Failure("Family not found", ServiceErrorType.NotFound);
                }
                if (family.OrgId != person.OrgId)
                {
                    return ServiceResult.Failure("Family must be in the same tree as the person", ServiceErrorType.BadRequest);
                }
            }

            person.FamilyId = request.FamilyId;
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Person {PersonId} assigned to family {FamilyId}",
                request.PersonId, request.FamilyId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assigning person to family");
            return ServiceResult.InternalError("Error assigning family");
        }
    }

    public async Task<ServiceResult<int>> BulkAssignToFamilyAsync(
        Guid familyId,
        List<Guid> personIds,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var family = await _context.Set<Family>().FindAsync(new object[] { familyId }, cancellationToken);
            if (family == null)
            {
                return ServiceResult<int>.NotFound("Family not found");
            }

            if (!await HasTreeAccessAsync(family.OrgId, userContext, OrgRole.Editor, cancellationToken))
            {
                return ServiceResult<int>.Forbidden("You do not have permission to assign family members");
            }

            var people = await _context.People
                .Where(p => personIds.Contains(p.Id) && p.OrgId == family.OrgId)
                .ToListAsync(cancellationToken);

            foreach (var person in people)
            {
                person.FamilyId = familyId;
            }

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("{Count} people assigned to family {FamilyId}", people.Count, familyId);

            return ServiceResult<int>.Success(people.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error bulk assigning to family");
            return ServiceResult<int>.InternalError("Error assigning family members");
        }
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private FamilyResponse MapToFamilyResponse(Family family)
    {
        return new FamilyResponse(
            family.Id,
            family.Name,
            family.NameEn,
            family.NameAr,
            family.NameLocal,
            family.Description,
            family.OrgId,
            family.Org?.Name ?? "",
            family.TownId,
            family.Town?.Name ?? "",
            family.PatriarchId,
            GetPersonPrimaryName(family.Patriarch),
            family.MatriarchId,
            GetPersonPrimaryName(family.Matriarch),
            family.Color,
            family.SortOrder,
            family.Members?.Count ?? 0,
            family.CreatedAt,
            family.UpdatedAt
        );
    }

    private static string? GetPersonPrimaryName(Person? person)
    {
        if (person == null) return null;
        return person.PrimaryName
            ?? person.Names?.FirstOrDefault(n => n.Type == Models.Enums.NameType.Primary)?.Full
            ?? person.Names?.FirstOrDefault()?.Full;
    }

    private async Task<bool> HasTreeAccessAsync(
        Guid treeId,
        UserContext userContext,
        OrgRole minRole = OrgRole.Viewer,
        CancellationToken cancellationToken = default)
    {
        if (userContext.IsSuperAdmin) return true;

        if (userContext.IsAdmin)
        {
            var hasAssignment = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == userContext.UserId && a.TreeId == treeId, cancellationToken);
            if (hasAssignment) return true;
        }

        var orgUser = await _context.OrgUsers
            .FirstOrDefaultAsync(ou => ou.UserId == userContext.UserId && ou.OrgId == treeId, cancellationToken);

        return orgUser != null && orgUser.Role >= minRole;
    }

    private async Task<List<Guid>> GetAccessibleTreeIdsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (userContext.IsSuperAdmin)
        {
            return await _context.Orgs.Select(o => o.Id).ToListAsync(cancellationToken);
        }

        var memberTreeIds = await _context.OrgUsers
            .Where(ou => ou.UserId == userContext.UserId)
            .Select(ou => ou.OrgId)
            .ToListAsync(cancellationToken);

        if (userContext.IsAdmin)
        {
            var assignedTreeIds = await _context.Set<AdminTreeAssignment>()
                .Where(a => a.UserId == userContext.UserId)
                .Select(a => a.TreeId)
                .ToListAsync(cancellationToken);

            return memberTreeIds.Union(assignedTreeIds).Distinct().ToList();
        }

        return memberTreeIds;
    }
}
