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
public class PersonController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<PersonController> _logger;

    public PersonController(ApplicationDbContext context, ILogger<PersonController> logger)
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

    private Guid? TryGetOrgIdFromToken()
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

    private string GetTreeRole()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(role))
        {
            return "Viewer";
        }

        if (role.Contains(":"))
        {
            role = role.Split(':').Last();
        }

        return role;
    }

    /// <summary>
    /// Resolves the effective OrgId based on user role:
    /// - SuperAdmin: can access any tree (must specify treeId)
    /// - Admin: can access assigned trees (must specify treeId)
    /// - Regular user: uses orgId from token (tree membership)
    /// </summary>
    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(Guid? requestedTreeId)
    {
        // SuperAdmin can access any tree
        if (IsSuperAdmin())
        {
            if (requestedTreeId.HasValue)
            {
                // Verify tree exists
                var treeExists = await _context.Orgs.AnyAsync(o => o.Id == requestedTreeId.Value);
                if (!treeExists)
                {
                    return (null, "The specified tree does not exist.");
                }
                return (requestedTreeId, null);
            }

            // SuperAdmin without specified tree - try token orgId
            var tokenOrgId = TryGetOrgIdFromToken();
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
                // Check if admin is assigned to this tree
                var isAssigned = await _context.Set<AdminTreeAssignment>()
                    .AnyAsync(a => a.UserId == userId && a.TreeId == requestedTreeId.Value);

                if (isAssigned)
                {
                    return (requestedTreeId, null);
                }

                // Also check if admin is a member of the tree
                var isMember = await _context.OrgUsers
                    .AnyAsync(ou => ou.UserId == userId && ou.OrgId == requestedTreeId.Value);

                if (isMember)
                {
                    return (requestedTreeId, null);
                }

                return (null, "You are not assigned to this tree.");
            }

            // Admin without specified tree - try token orgId (if they're also a member)
            var tokenOrgId = TryGetOrgIdFromToken();
            if (tokenOrgId.HasValue)
            {
                return (tokenOrgId, null);
            }

            // Check if admin has any assignments
            var hasAssignments = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == userId);

            if (hasAssignments)
            {
                return (null, "Admin must specify a treeId to work on an assigned tree.");
            }

            return (null, "You must be assigned to a tree or be a member of one.");
        }

        // Regular user - must be a member
        var orgId = TryGetOrgIdFromToken();
        if (orgId == null)
        {
            return (null, "You must be a member of a family tree. Please create or join one first.");
        }

        // If a specific tree was requested, verify membership
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

    private bool CanEdit()
    {
        if (IsSuperAdmin() || IsAdmin()) return true;
        var role = GetTreeRole();
        return role is "Owner" or "Admin" or "Editor";
    }

    private bool CanContribute()
    {
        if (IsSuperAdmin() || IsAdmin()) return true;
        var role = GetTreeRole();
        return role is "Owner" or "Admin" or "Editor" or "Contributor";
    }

    /// <summary>
    /// Get all persons in the current tree with pagination and filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<PersonListItemDto>>> GetPersons(
        [FromQuery] PersonSearchDto search)
    {
        try
        {
            _logger.LogInformation("GetPersons called: TreeId={TreeId}, Page={Page}, PageSize={PageSize}",
                search.TreeId, search.Page, search.PageSize);

            var (orgId, error) = await ResolveOrgIdAsync(search.TreeId);
            if (orgId == null)
            {
                _logger.LogWarning("ResolveOrgIdAsync returned null: {Error}", error);
                return BadRequest(new { message = error });
            }

            _logger.LogInformation("Resolved OrgId: {OrgId}", orgId);

            var query = _context.People
                .Where(p => p.OrgId == orgId)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search.NameQuery))
            {
                var searchTerm = search.NameQuery.Trim().ToLower();
                query = query.Where(p =>
                    (p.PrimaryName != null && p.PrimaryName.ToLower().Contains(searchTerm)) ||
                    p.Names.Any(n =>
                        (n.Full != null && n.Full.ToLower().Contains(searchTerm)) ||
                        (n.Given != null && n.Given.ToLower().Contains(searchTerm)) ||
                        (n.Middle != null && n.Middle.ToLower().Contains(searchTerm)) ||
                        (n.Transliteration != null && n.Transliteration.ToLower().Contains(searchTerm))
                    )
                );
            }

            if (search.Sex.HasValue)
            {
                query = query.Where(p => p.Sex == search.Sex.Value);
            }

            if (search.BirthDateFrom.HasValue)
            {
                query = query.Where(p => p.BirthDate >= search.BirthDateFrom.Value);
            }

            if (search.BirthDateTo.HasValue)
            {
                query = query.Where(p => p.BirthDate <= search.BirthDateTo.Value);
            }

            if (search.DeathDateFrom.HasValue)
            {
                query = query.Where(p => p.DeathDate >= search.DeathDateFrom.Value);
            }

            if (search.DeathDateTo.HasValue)
            {
                query = query.Where(p => p.DeathDate <= search.DeathDateTo.Value);
            }

            if (search.BirthPlaceId.HasValue)
            {
                query = query.Where(p => p.BirthPlaceId == search.BirthPlaceId.Value);
            }

            if (search.DeathPlaceId.HasValue)
            {
                query = query.Where(p => p.DeathPlaceId == search.DeathPlaceId.Value);
            }

            if (search.PrivacyLevel.HasValue)
            {
                query = query.Where(p => p.PrivacyLevel == search.PrivacyLevel.Value);
            }

            if (search.IsVerified.HasValue)
            {
                query = query.Where(p => p.IsVerified == search.IsVerified.Value);
            }

            if (search.NeedsReview.HasValue)
            {
                query = query.Where(p => p.NeedsReview == search.NeedsReview.Value);
            }

            var totalCount = await query.CountAsync();

            var persons = await query
                .OrderBy(p => p.PrimaryName)
                .Skip((search.Page - 1) * search.PageSize)
                .Take(search.PageSize)
                .Select(p => new PersonListItemDto(
                    p.Id,
                    p.PrimaryName,
                    p.Sex,
                    p.BirthDate,
                    p.BirthPrecision,
                    p.DeathDate,
                    p.DeathPrecision,
                    p.BirthPlace != null ? p.BirthPlace.Name : null,
                    p.DeathPlace != null ? p.DeathPlace.Name : null,
                    p.IsVerified,
                    p.NeedsReview
                ))
                .ToListAsync();

            var totalPages = (int)Math.Ceiling(totalCount / (double)search.PageSize);

            return Ok(new PagedResult<PersonListItemDto>(
                persons,
                totalCount,
                search.Page,
                search.PageSize,
                totalPages
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting persons for tree {TreeId}. Exception type: {ExceptionType}, Message: {Message}, StackTrace: {StackTrace}",
                search.TreeId, ex.GetType().Name, ex.Message, ex.StackTrace);
            return StatusCode(500, new
            {
                message = "Error loading people",
                details = ex.Message,
                exceptionType = ex.GetType().Name,
                innerException = ex.InnerException?.Message
            });
        }
    }

    /// <summary>
    /// Get a specific person by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<PersonResponseDto>> GetPerson(Guid id, [FromQuery] Guid? treeId = null)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(treeId);
            if (orgId == null)
            {
                return BadRequest(new { message = error });
            }

            var person = await _context.People
                .Where(p => p.Id == id && p.OrgId == orgId)
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync();

            if (person == null)
            {
                return NotFound(new { message = "Person not found" });
            }

            return Ok(MapToResponseDto(person));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting person {PersonId} for tree {TreeId}: {Message}", id, treeId, ex.Message);
            return StatusCode(500, new { message = "Error loading person", details = ex.Message });
        }
    }

    /// <summary>
    /// Create a new person in the tree
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PersonResponseDto>> CreatePerson(CreatePersonDto dto)
    {
        if (!CanContribute())
        {
            return Forbid();
        }

        var (orgId, error) = await ResolveOrgIdAsync(dto.TreeId);
        if (orgId == null)
        {
            return BadRequest(new { message = error });
        }

        var person = new Person
        {
            OrgId = orgId.Value,
            PrimaryName = dto.PrimaryName,
            Sex = dto.Sex ?? Sex.Unknown,
            Gender = dto.Gender,
            BirthDate = dto.BirthDate,
            BirthPrecision = dto.BirthPrecision,
            BirthPlaceId = dto.BirthPlaceId,
            DeathDate = dto.DeathDate,
            DeathPrecision = dto.DeathPrecision,
            DeathPlaceId = dto.DeathPlaceId,
            PrivacyLevel = dto.PrivacyLevel,
            Occupation = dto.Occupation,
            Education = dto.Education,
            Religion = dto.Religion,
            Nationality = dto.Nationality,
            Ethnicity = dto.Ethnicity,
            Notes = dto.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.People.Add(person);
        await _context.SaveChangesAsync();

        if (dto.Names != null && dto.Names.Any())
        {
            foreach (var nameDto in dto.Names)
            {
                var personName = new PersonName
                {
                    PersonId = person.Id,
                    Script = nameDto.Script,
                    Given = nameDto.Given,
                    Middle = nameDto.Middle,
                    Family = nameDto.Family,
                    Full = nameDto.Full,
                    Transliteration = nameDto.Transliteration,
                    Type = nameDto.Type,
                    CreatedAt = DateTime.UtcNow
                };
                _context.PersonNames.Add(personName);
            }

            if (string.IsNullOrWhiteSpace(person.PrimaryName))
            {
                var primaryName = dto.Names.FirstOrDefault(n => n.Type == NameType.Primary);
                if (primaryName != null && !string.IsNullOrWhiteSpace(primaryName.Full))
                {
                    person.PrimaryName = primaryName.Full;
                }
            }

            await _context.SaveChangesAsync();
        }

        var createdPerson = await _context.People
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstAsync(p => p.Id == person.Id);

        _logger.LogInformation("Person created: {PersonId} in Org: {OrgId}", person.Id, orgId);

        return CreatedAtAction(nameof(GetPerson), new { id = person.Id }, MapToResponseDto(createdPerson));
    }

    /// <summary>
    /// Update a person
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<PersonResponseDto>> UpdatePerson(Guid id, UpdatePersonDto dto, [FromQuery] Guid? treeId = null)
    {
        if (!CanEdit())
        {
            return Forbid();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = error });
        }

        var person = await _context.People
            .Where(p => p.Id == id && p.OrgId == orgId)
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync();

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        if (dto.PrimaryName != null) person.PrimaryName = dto.PrimaryName;
        if (dto.Sex.HasValue) person.Sex = dto.Sex.Value;
        if (dto.Gender != null) person.Gender = dto.Gender;
        if (dto.BirthDate.HasValue) person.BirthDate = dto.BirthDate;
        if (dto.BirthPrecision.HasValue) person.BirthPrecision = dto.BirthPrecision.Value;
        if (dto.BirthPlaceId.HasValue) person.BirthPlaceId = dto.BirthPlaceId;
        if (dto.DeathDate.HasValue) person.DeathDate = dto.DeathDate;
        if (dto.DeathPrecision.HasValue) person.DeathPrecision = dto.DeathPrecision.Value;
        if (dto.DeathPlaceId.HasValue) person.DeathPlaceId = dto.DeathPlaceId;
        if (dto.PrivacyLevel.HasValue) person.PrivacyLevel = dto.PrivacyLevel.Value;
        if (dto.Occupation != null) person.Occupation = dto.Occupation;
        if (dto.Education != null) person.Education = dto.Education;
        if (dto.Religion != null) person.Religion = dto.Religion;
        if (dto.Nationality != null) person.Nationality = dto.Nationality;
        if (dto.Ethnicity != null) person.Ethnicity = dto.Ethnicity;
        if (dto.Notes != null) person.Notes = dto.Notes;
        if (dto.IsVerified.HasValue) person.IsVerified = dto.IsVerified.Value;
        if (dto.NeedsReview.HasValue) person.NeedsReview = dto.NeedsReview.Value;

        person.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Person updated: {PersonId}", id);

        return Ok(MapToResponseDto(person));
    }

    /// <summary>
    /// Delete a person
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePerson(Guid id, [FromQuery] Guid? treeId = null)
    {
        if (!CanEdit())
        {
            return Forbid();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = error });
        }

        var person = await _context.People
            .Where(p => p.Id == id && p.OrgId == orgId)
            .FirstOrDefaultAsync();

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        // Check for cross-tree relationships
        var allParentChildRecords = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .Where(pc => pc.ParentId == id || pc.ChildId == id)
            .ToListAsync();

        var crossOrgRelationships = allParentChildRecords
            .Where(pc => pc.Parent.OrgId != orgId || pc.Child.OrgId != orgId)
            .ToList();

        if (crossOrgRelationships.Any())
        {
            _logger.LogWarning("Cannot delete person {PersonId}: has {Count} cross-org relationships", id, crossOrgRelationships.Count);
            return BadRequest(new { message = "Cannot delete person with relationships to other organizations" });
        }

        // Remove parent-child records
        _context.ParentChildren.RemoveRange(allParentChildRecords);

        // Remove union memberships
        var unionMemberships = await _context.UnionMembers
            .Include(um => um.Union)
            .Where(um => um.PersonId == id && um.Union.OrgId == orgId)
            .ToListAsync();
        _context.UnionMembers.RemoveRange(unionMemberships);

        // Remove person tags
        var personTags = await _context.PersonTags
            .Include(pt => pt.Tag)
            .Where(pt => pt.PersonId == id && pt.Tag.OrgId == orgId)
            .ToListAsync();
        _context.PersonTags.RemoveRange(personTags);

        _context.People.Remove(person);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Person deleted: {PersonId} with {ParentChildCount} parent-child links, {UnionCount} union memberships, and {TagCount} tags",
            id, allParentChildRecords.Count, unionMemberships.Count, personTags.Count);

        return NoContent();
    }

    /// <summary>
    /// Add a name to a person (multi-script support)
    /// </summary>
    [HttpPost("{id}/names")]
    public async Task<ActionResult<PersonNameDto>> AddPersonName(Guid id, PersonNameDto dto, [FromQuery] Guid? treeId = null)
    {
        if (!CanContribute())
        {
            return Forbid();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = error });
        }

        var person = await _context.People
            .Where(p => p.Id == id && p.OrgId == orgId)
            .FirstOrDefaultAsync();

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        var personName = new PersonName
        {
            PersonId = id,
            Script = dto.Script,
            Given = dto.Given,
            Middle = dto.Middle,
            Family = dto.Family,
            Full = dto.Full,
            Transliteration = dto.Transliteration,
            Type = dto.Type,
            CreatedAt = DateTime.UtcNow
        };

        _context.PersonNames.Add(personName);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Name added to person {PersonId}: {NameId}", id, personName.Id);

        return CreatedAtAction(nameof(GetPerson), new { id }, new PersonNameDto(
            personName.Id,
            personName.Script,
            personName.Given,
            personName.Middle,
            personName.Family,
            personName.Full,
            personName.Transliteration,
            personName.Type
        ));
    }

    /// <summary>
    /// Update a person's name
    /// </summary>
    [HttpPut("{personId}/names/{nameId}")]
    public async Task<ActionResult<PersonNameDto>> UpdatePersonName(
        Guid personId,
        Guid nameId,
        PersonNameDto dto,
        [FromQuery] Guid? treeId = null)
    {
        if (!CanEdit())
        {
            return Forbid();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = error });
        }

        var personName = await _context.PersonNames
            .Include(n => n.Person)
            .Where(n => n.Id == nameId && n.PersonId == personId && n.Person.OrgId == orgId)
            .FirstOrDefaultAsync();

        if (personName == null)
        {
            return NotFound(new { message = "Person name not found" });
        }

        personName.Script = dto.Script;
        personName.Given = dto.Given;
        personName.Middle = dto.Middle;
        personName.Family = dto.Family;
        personName.Full = dto.Full;
        personName.Transliteration = dto.Transliteration;
        personName.Type = dto.Type;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Name updated: {NameId} for person {PersonId}", nameId, personId);

        return Ok(new PersonNameDto(
            personName.Id,
            personName.Script,
            personName.Given,
            personName.Middle,
            personName.Family,
            personName.Full,
            personName.Transliteration,
            personName.Type
        ));
    }

    /// <summary>
    /// Delete a person's name
    /// </summary>
    [HttpDelete("{personId}/names/{nameId}")]
    public async Task<IActionResult> DeletePersonName(Guid personId, Guid nameId, [FromQuery] Guid? treeId = null)
    {
        if (!CanEdit())
        {
            return Forbid();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = error });
        }

        var personName = await _context.PersonNames
            .Include(n => n.Person)
            .Where(n => n.Id == nameId && n.PersonId == personId && n.Person.OrgId == orgId)
            .FirstOrDefaultAsync();

        if (personName == null)
        {
            return NotFound(new { message = "Person name not found" });
        }

        _context.PersonNames.Remove(personName);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Name deleted: {NameId} from person {PersonId}", nameId, personId);

        return NoContent();
    }

    private static PersonResponseDto MapToResponseDto(Person person)
    {
        return new PersonResponseDto(
            person.Id,
            person.OrgId,
            person.PrimaryName,
            person.Sex,
            person.Gender,
            person.BirthDate,
            person.BirthPrecision,
            person.BirthPlaceId,
            person.BirthPlace?.Name,
            person.DeathDate,
            person.DeathPrecision,
            person.DeathPlaceId,
            person.DeathPlace?.Name,
            person.PrivacyLevel,
            person.Occupation,
            person.Education,
            person.Religion,
            person.Nationality,
            person.Ethnicity,
            person.Notes,
            person.IsVerified,
            person.NeedsReview,
            person.HasConflict,
            person.CreatedAt,
            person.UpdatedAt,
            person.Names.Select(n => new PersonNameDto(
                n.Id,
                n.Script,
                n.Given,
                n.Middle,
                n.Family,
                n.Full,
                n.Transliteration,
                n.Type
            )).ToList()
        );
    }
}