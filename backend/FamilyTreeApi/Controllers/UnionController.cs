using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UnionController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<UnionController> _logger;

    public UnionController(ApplicationDbContext context, ILogger<UnionController> logger)
    {
        _context = context;
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

    private Guid? TryGetUserOrgId()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrEmpty(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
            return null;
        }
        return orgId;
    }

    private string GetSystemRole()
    {
        var systemRole = User.FindFirst("systemRole")?.Value;
        return systemRole ?? "User";
    }

    private bool IsSuperAdmin() => GetSystemRole() == "SuperAdmin";
    private bool IsAdmin() => GetSystemRole() == "Admin";

    /// <summary>
    /// Resolves the effective OrgId based on user role and optional treeId parameter
    /// </summary>
    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(Guid? requestedTreeId)
    {
        // SuperAdmin can access any tree
        if (IsSuperAdmin())
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _context.Orgs.AnyAsync(o => o.Id == requestedTreeId.Value);
                if (!treeExists)
                {
                    return (null, "The specified tree does not exist.");
                }
                return (requestedTreeId, null);
            }

            var tokenOrgId = TryGetUserOrgId();
            if (tokenOrgId.HasValue)
            {
                return (tokenOrgId, null);
            }

            return (null, "SuperAdmin must specify a treeId or be a member of a tree.");
        }

        // Admin can access assigned trees
        if (IsAdmin())
        {
            var userId = GetUserId();

            if (requestedTreeId.HasValue)
            {
                var isAssigned = await _context.Set<AdminTreeAssignment>()
                    .AnyAsync(a => a.UserId == userId && a.TreeId == requestedTreeId.Value);

                if (isAssigned)
                {
                    return (requestedTreeId, null);
                }

                var isMember = await _context.OrgUsers
                    .AnyAsync(ou => ou.UserId == userId && ou.OrgId == requestedTreeId.Value);

                if (isMember)
                {
                    return (requestedTreeId, null);
                }

                return (null, "You are not assigned to this tree.");
            }

            var tokenOrgId = TryGetUserOrgId();
            if (tokenOrgId.HasValue)
            {
                return (tokenOrgId, null);
            }

            return (null, "Admin must specify a treeId to work on an assigned tree.");
        }

        // Regular user - must be a member
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return (null, "You must be a member of a family tree.");
        }

        if (requestedTreeId.HasValue && requestedTreeId.Value != orgId.Value)
        {
            var userId = GetUserId();
            var isMember = await _context.OrgUsers
                .AnyAsync(ou => ou.UserId == userId && ou.OrgId == requestedTreeId.Value);

            if (!isMember)
            {
                return (null, "You are not a member of this tree.");
            }

            return (requestedTreeId, null);
        }

        return (orgId, null);
    }

    private bool HasEditPermission()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        return role == "Owner" || role == "Admin" || role == "Editor" || role == "SuperAdmin";
    }

    /// <summary>
    /// Search unions (marriages/partnerships) with filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<UnionResponse>>> SearchUnions([FromQuery] UnionSearchRequest request)
    {
        _logger.LogInformation("SearchUnions called: TreeId={TreeId}, PersonId={PersonId}, SystemRole={SystemRole}",
            request.TreeId, request.PersonId, GetSystemRole());

        // If personId is provided but treeId is not, infer treeId from the person
        Guid? effectiveTreeId = request.TreeId;
        if (request.PersonId.HasValue && !request.TreeId.HasValue)
        {
            var person = await _context.People.FindAsync(request.PersonId.Value);
            if (person != null)
            {
                effectiveTreeId = person.OrgId;
                _logger.LogInformation("SearchUnions - Inferred TreeId from PersonId: {TreeId}", effectiveTreeId);
            }
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId);
        if (orgId == null)
        {
            _logger.LogWarning("SearchUnions - ResolveOrgIdAsync returned null: {Error}", error);
            return BadRequest(new { message = error });
        }

        _logger.LogInformation("SearchUnions - Resolved OrgId: {OrgId}", orgId);

        var query = _context.Unions
            .Include(u => u.StartPlace)
            .Include(u => u.EndPlace)
            .Include(u => u.Members)
                .ThenInclude(um => um.Person)
            .Where(u => u.OrgId == orgId);

        if (request.Type.HasValue)
        {
            query = query.Where(u => u.Type == request.Type.Value);
        }

        if (request.PersonId.HasValue)
        {
            query = query.Where(u => u.Members.Any(um => um.PersonId == request.PersonId.Value));
        }

        if (request.StartDateFrom.HasValue)
        {
            query = query.Where(u => u.StartDate >= request.StartDateFrom.Value);
        }

        if (request.StartDateTo.HasValue)
        {
            query = query.Where(u => u.StartDate <= request.StartDateTo.Value);
        }

        if (request.PlaceId.HasValue)
        {
            query = query.Where(u => u.StartPlaceId == request.PlaceId.Value || u.EndPlaceId == request.PlaceId.Value);
        }

        var total = await query.CountAsync();
        var unions = await query
            .OrderByDescending(u => u.StartDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync();

        var items = unions.Select(u => MapToResponse(u)).ToList();

        return new PagedResult<UnionResponse>(
            items,
            total,
            request.Page,
            request.PageSize,
            (int)Math.Ceiling(total / (double)request.PageSize)
        );
    }

    /// <summary>
    /// Get a specific union by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<UnionResponse>> GetUnion(Guid id)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to view unions." });
        }

        var union = await _context.Unions
            .Include(u => u.StartPlace)
            .Include(u => u.EndPlace)
            .Include(u => u.Members)
                .ThenInclude(um => um.Person)
            .FirstOrDefaultAsync(u => u.Id == id && u.OrgId == orgId);

        if (union == null)
        {
            return NotFound(new { message = "Union not found" });
        }

        return MapToResponse(union);
    }

    /// <summary>
    /// Create a new union (marriage/partnership)
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<UnionResponse>> CreateUnion(CreateUnionRequest request)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to create unions." });
        }

        // Validate start place
        if (request.StartPlaceId.HasValue)
        {
            var placeExists = await _context.Places.AnyAsync(p => p.Id == request.StartPlaceId.Value && p.OrgId == orgId);
            if (!placeExists)
            {
                return BadRequest(new { message = "Start place not found in organization" });
            }
        }

        // Validate end place
        if (request.EndPlaceId.HasValue)
        {
            var placeExists = await _context.Places.AnyAsync(p => p.Id == request.EndPlaceId.Value && p.OrgId == orgId);
            if (!placeExists)
            {
                return BadRequest(new { message = "End place not found in organization" });
            }
        }

        // Validate members
        if (request.MemberIds.Any())
        {
            var memberPersons = await _context.People
                .Where(p => request.MemberIds.Contains(p.Id))
                .ToListAsync();

            if (memberPersons.Count != request.MemberIds.Count)
            {
                return BadRequest(new { message = "One or more members not found" });
            }

            if (memberPersons.Any(p => p.OrgId != orgId))
            {
                return BadRequest(new { message = "All members must belong to the same organization" });
            }
        }

        // Validate dates
        if (request.StartDate.HasValue && request.EndDate.HasValue && request.EndDate < request.StartDate)
        {
            return BadRequest(new { message = "End date cannot be before start date" });
        }

        var union = new Union
        {
            Id = Guid.NewGuid(),
            OrgId = orgId.Value,
            Type = request.Type,
            StartDate = request.StartDate,
            StartPrecision = request.StartPrecision,
            StartPlaceId = request.StartPlaceId,
            EndDate = request.EndDate,
            EndPrecision = request.EndPrecision,
            EndPlaceId = request.EndPlaceId,
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Unions.Add(union);
        await _context.SaveChangesAsync();

        // Add members
        foreach (var memberId in request.MemberIds)
        {
            var unionMember = new UnionMember
            {
                Id = Guid.NewGuid(),
                UnionId = union.Id,
                PersonId = memberId
            };
            _context.UnionMembers.Add(unionMember);
        }

        await _context.SaveChangesAsync();

        var createdUnion = await _context.Unions
            .Include(u => u.StartPlace)
            .Include(u => u.EndPlace)
            .Include(u => u.Members)
                .ThenInclude(um => um.Person)
            .FirstAsync(u => u.Id == union.Id);

        _logger.LogInformation("Union created: {UnionId} with {MemberCount} members", union.Id, request.MemberIds.Count);

        return CreatedAtAction(nameof(GetUnion), new { id = union.Id }, MapToResponse(createdUnion));
    }

    /// <summary>
    /// Update a union
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<ActionResult<UnionResponse>> UpdateUnion(Guid id, UpdateUnionRequest request)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to update unions." });
        }

        var union = await _context.Unions.FirstOrDefaultAsync(u => u.Id == id && u.OrgId == orgId);
        if (union == null)
        {
            return NotFound(new { message = "Union not found" });
        }

        if (request.StartPlaceId.HasValue)
        {
            var placeExists = await _context.Places.AnyAsync(p => p.Id == request.StartPlaceId.Value && p.OrgId == orgId);
            if (!placeExists)
            {
                return BadRequest(new { message = "Start place not found in organization" });
            }
        }

        if (request.EndPlaceId.HasValue)
        {
            var placeExists = await _context.Places.AnyAsync(p => p.Id == request.EndPlaceId.Value && p.OrgId == orgId);
            if (!placeExists)
            {
                return BadRequest(new { message = "End place not found in organization" });
            }
        }

        if (request.StartDate.HasValue && request.EndDate.HasValue && request.EndDate < request.StartDate)
        {
            return BadRequest(new { message = "End date cannot be before start date" });
        }

        if (request.Type.HasValue) union.Type = request.Type.Value;
        if (request.StartDate.HasValue) union.StartDate = request.StartDate;
        if (request.StartPrecision.HasValue) union.StartPrecision = request.StartPrecision.Value;
        union.StartPlaceId = request.StartPlaceId;
        if (request.EndDate.HasValue) union.EndDate = request.EndDate;
        if (request.EndPrecision.HasValue) union.EndPrecision = request.EndPrecision.Value;
        union.EndPlaceId = request.EndPlaceId;
        if (request.Notes != null) union.Notes = request.Notes;
        union.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var updatedUnion = await _context.Unions
            .Include(u => u.StartPlace)
            .Include(u => u.EndPlace)
            .Include(u => u.Members)
                .ThenInclude(um => um.Person)
            .FirstAsync(u => u.Id == id);

        _logger.LogInformation("Union updated: {UnionId}", id);

        return MapToResponse(updatedUnion);
    }

    /// <summary>
    /// Delete a union
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> DeleteUnion(Guid id)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to delete unions." });
        }

        var union = await _context.Unions.FirstOrDefaultAsync(u => u.Id == id && u.OrgId == orgId);
        if (union == null)
        {
            return NotFound(new { message = "Union not found" });
        }

        var memberCount = await _context.UnionMembers.CountAsync(um => um.UnionId == id);

        _context.Unions.Remove(union);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Union deleted: {UnionId} with {MemberCount} members", id, memberCount);

        return NoContent();
    }

    /// <summary>
    /// Add a member (spouse/partner) to a union
    /// </summary>
    [HttpPost("{id}/members")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<ActionResult<UnionResponse>> AddMember(Guid id, AddUnionMemberRequest request)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to add members." });
        }

        var union = await _context.Unions.FirstOrDefaultAsync(u => u.Id == id && u.OrgId == orgId);
        if (union == null)
        {
            return NotFound(new { message = "Union not found" });
        }

        var person = await _context.People.FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId);
        if (person == null)
        {
            return BadRequest(new { message = "Person not found in organization" });
        }

        var existingMember = await _context.UnionMembers
            .AnyAsync(um => um.UnionId == id && um.PersonId == request.PersonId);

        if (existingMember)
        {
            return BadRequest(new { message = "Person is already a member of this union" });
        }

        var unionMember = new UnionMember
        {
            Id = Guid.NewGuid(),
            UnionId = id,
            PersonId = request.PersonId
        };

        _context.UnionMembers.Add(unionMember);
        await _context.SaveChangesAsync();

        var updatedUnion = await _context.Unions
            .Include(u => u.StartPlace)
            .Include(u => u.EndPlace)
            .Include(u => u.Members)
                .ThenInclude(um => um.Person)
            .FirstAsync(u => u.Id == id);

        _logger.LogInformation("Member added to union: {UnionId}, Person: {PersonId}", id, request.PersonId);

        return MapToResponse(updatedUnion);
    }

    /// <summary>
    /// Remove a member from a union
    /// </summary>
    [HttpDelete("{unionId}/members/{personId}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveMember(Guid unionId, Guid personId)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to remove members." });
        }

        var union = await _context.Unions.FirstOrDefaultAsync(u => u.Id == unionId && u.OrgId == orgId);
        if (union == null)
        {
            return NotFound(new { message = "Union not found" });
        }

        var unionMember = await _context.UnionMembers
            .Include(um => um.Person)
            .FirstOrDefaultAsync(um => um.UnionId == unionId && um.PersonId == personId && um.Person.OrgId == orgId);

        if (unionMember == null)
        {
            return NotFound(new { message = "Member not found in union" });
        }

        _context.UnionMembers.Remove(unionMember);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Member removed from union: {UnionId}, Person: {PersonId}", unionId, personId);

        return NoContent();
    }

    private UnionResponse MapToResponse(Union union)
    {
        return new UnionResponse
        {
            Id = union.Id,
            OrgId = union.OrgId,
            Type = union.Type,
            StartDate = union.StartDate,
            StartPrecision = union.StartPrecision,
            StartPlaceId = union.StartPlaceId,
            StartPlace = union.StartPlace?.Name,
            EndDate = union.EndDate,
            EndPrecision = union.EndPrecision,
            EndPlaceId = union.EndPlaceId,
            EndPlace = union.EndPlace?.Name,
            Notes = union.Notes,
            Members = union.Members.Select(um => new UnionMemberDto
            {
                Id = um.Id,
                PersonId = um.PersonId,
                PersonName = um.Person?.PrimaryName,
                Sex = um.Person?.Sex
            }).ToList(),
            CreatedAt = union.CreatedAt,
            UpdatedAt = union.UpdatedAt
        };
    }
}