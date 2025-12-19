using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
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
public class PersonLinkController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<PersonLinkController> _logger;

    public PersonLinkController(
        ApplicationDbContext context, 
        UserManager<ApplicationUser> userManager,
        ILogger<PersonLinkController> logger)
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

    private async Task<bool> HasTreeAccess(Guid treeId, OrgRole minRole = OrgRole.Viewer)
    {
        var userId = GetUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        
        if (user == null) return false;
        if (await _userManager.IsInRoleAsync(user, "SuperAdmin")) return true;
        
        if (await _userManager.IsInRoleAsync(user, "Admin"))
        {
            var hasAssignment = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == userId && a.TreeId == treeId);
            if (hasAssignment) return true;
        }
        
        var orgUser = await _context.OrgUsers
            .FirstOrDefaultAsync(ou => ou.UserId == userId && ou.OrgId == treeId);
        
        return orgUser != null && orgUser.Role >= minRole;
    }

    /// <summary>
    /// Get all links for a person (as source or target)
    /// </summary>
    [HttpGet("person/{personId}")]
    public async Task<ActionResult<List<PersonLinkResponse>>> GetPersonLinks(Guid personId)
    {
        var person = await _context.People.FindAsync(personId);
        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        if (!await HasTreeAccess(person.OrgId))
        {
            return Forbid();
        }

        var links = await _context.Set<PersonLink>()
            .Include(l => l.SourcePerson).ThenInclude(p => p.Org)
            .Include(l => l.TargetPerson).ThenInclude(p => p.Org)
            .Include(l => l.CreatedByUser)
            .Include(l => l.ApprovedByUser)
            .Where(l => l.SourcePersonId == personId || l.TargetPersonId == personId)
            .Select(l => new PersonLinkResponse(
                l.Id,
                l.SourcePersonId,
                l.SourcePerson.PrimaryName,
                l.SourcePerson.OrgId,
                l.SourcePerson.Org.Name,
                l.TargetPersonId,
                l.TargetPerson.PrimaryName,
                l.TargetPerson.OrgId,
                l.TargetPerson.Org.Name,
                l.LinkType,
                l.Confidence,
                l.Notes,
                l.Status,
                l.CreatedByUser != null 
                    ? $"{l.CreatedByUser.FirstName} {l.CreatedByUser.LastName}".Trim() 
                    : null,
                l.ApprovedByUser != null 
                    ? $"{l.ApprovedByUser.FirstName} {l.ApprovedByUser.LastName}".Trim() 
                    : null,
                l.CreatedAt
            ))
            .ToListAsync();

        return links;
    }

    /// <summary>
    /// Get pending link requests for trees the user can manage
    /// </summary>
    [HttpGet("pending")]
    public async Task<ActionResult<List<PersonLinkResponse>>> GetPendingLinks()
    {
        var userId = GetUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null) return Unauthorized();

        IQueryable<PersonLink> query = _context.Set<PersonLink>()
            .Include(l => l.SourcePerson).ThenInclude(p => p.Org)
            .Include(l => l.TargetPerson).ThenInclude(p => p.Org)
            .Include(l => l.CreatedByUser)
            .Where(l => l.Status == PersonLinkStatus.Pending);

        if (!await _userManager.IsInRoleAsync(user, "SuperAdmin"))
        {
            // Get tree IDs user can manage
            List<Guid> managedTreeIds;
            
            if (await _userManager.IsInRoleAsync(user, "Admin"))
            {
                var assignedTrees = await _context.Set<AdminTreeAssignment>()
                    .Where(a => a.UserId == userId)
                    .Select(a => a.TreeId)
                    .ToListAsync();

                var memberTrees = await _context.OrgUsers
                    .Where(ou => ou.UserId == userId && ou.Role >= OrgRole.SubAdmin)
                    .Select(ou => ou.OrgId)
                    .ToListAsync();

                managedTreeIds = assignedTrees.Union(memberTrees).ToList();
            }
            else
            {
                managedTreeIds = await _context.OrgUsers
                    .Where(ou => ou.UserId == userId && ou.Role >= OrgRole.SubAdmin)
                    .Select(ou => ou.OrgId)
                    .ToListAsync();
            }

            // Filter to links where target is in a managed tree
            query = query.Where(l => managedTreeIds.Contains(l.TargetPerson.OrgId));
        }

        var links = await query
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => new PersonLinkResponse(
                l.Id,
                l.SourcePersonId,
                l.SourcePerson.PrimaryName,
                l.SourcePerson.OrgId,
                l.SourcePerson.Org.Name,
                l.TargetPersonId,
                l.TargetPerson.PrimaryName,
                l.TargetPerson.OrgId,
                l.TargetPerson.Org.Name,
                l.LinkType,
                l.Confidence,
                l.Notes,
                l.Status,
                l.CreatedByUser != null 
                    ? $"{l.CreatedByUser.FirstName} {l.CreatedByUser.LastName}".Trim() 
                    : null,
                null,
                l.CreatedAt
            ))
            .ToListAsync();

        return links;
    }

    /// <summary>
    /// Create a link request between two persons
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PersonLinkResponse>> CreateLink(CreatePersonLinkRequest request)
    {
        var userId = GetUserId();

        var sourcePerson = await _context.People
            .Include(p => p.Org)
            .FirstOrDefaultAsync(p => p.Id == request.SourcePersonId);
        
        var targetPerson = await _context.People
            .Include(p => p.Org)
            .FirstOrDefaultAsync(p => p.Id == request.TargetPersonId);

        if (sourcePerson == null || targetPerson == null)
        {
            return NotFound(new { message = "One or both persons not found" });
        }

        // Must have edit access to source tree
        if (!await HasTreeAccess(sourcePerson.OrgId, OrgRole.Editor))
        {
            return Forbid();
        }

        // Check if target tree allows cross-linking
        if (!targetPerson.Org.AllowCrossTreeLinking)
        {
            return BadRequest(new { message = "Target tree does not allow cross-tree linking" });
        }

        // Check for existing link
        var existingLink = await _context.Set<PersonLink>()
            .AnyAsync(l => 
                (l.SourcePersonId == request.SourcePersonId && l.TargetPersonId == request.TargetPersonId) ||
                (l.SourcePersonId == request.TargetPersonId && l.TargetPersonId == request.SourcePersonId));

        if (existingLink)
        {
            return BadRequest(new { message = "A link already exists between these persons" });
        }

        // Determine if auto-approve (same tree or user is admin of both)
        var sameTree = sourcePerson.OrgId == targetPerson.OrgId;
        var hasTargetAccess = await HasTreeAccess(targetPerson.OrgId, OrgRole.SubAdmin);
        var autoApprove = sameTree || hasTargetAccess;

        var link = new PersonLink
        {
            Id = Guid.NewGuid(),
            SourcePersonId = request.SourcePersonId,
            TargetPersonId = request.TargetPersonId,
            LinkType = request.LinkType,
            Confidence = Math.Clamp(request.Confidence, 0, 100),
            Notes = request.Notes,
            CreatedByUserId = userId,
            Status = autoApprove ? PersonLinkStatus.Approved : PersonLinkStatus.Pending,
            ApprovedByUserId = autoApprove ? userId : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Set<PersonLink>().Add(link);
        await _context.SaveChangesAsync();

        var user = await _context.Users.FindAsync(userId);
        var statusText = autoApprove ? "approved" : "pending";
        _logger.LogInformation("Person link created ({Status}): {SourceId} -> {TargetId} by user {UserId}",
            statusText, request.SourcePersonId, request.TargetPersonId, userId);

        return CreatedAtAction(nameof(GetPersonLinks), new { personId = link.SourcePersonId },
            new PersonLinkResponse(
                link.Id,
                link.SourcePersonId,
                sourcePerson.PrimaryName,
                sourcePerson.OrgId,
                sourcePerson.Org.Name,
                link.TargetPersonId,
                targetPerson.PrimaryName,
                targetPerson.OrgId,
                targetPerson.Org.Name,
                link.LinkType,
                link.Confidence,
                link.Notes,
                link.Status,
                user != null ? $"{user.FirstName} {user.LastName}".Trim() : null,
                autoApprove && user != null ? $"{user.FirstName} {user.LastName}".Trim() : null,
                link.CreatedAt
            ));
    }

    /// <summary>
    /// Approve or reject a link request
    /// </summary>
    [HttpPost("{linkId}/review")]
    public async Task<ActionResult<PersonLinkResponse>> ReviewLink(Guid linkId, ApprovePersonLinkRequest request)
    {
        var userId = GetUserId();

        var link = await _context.Set<PersonLink>()
            .Include(l => l.SourcePerson).ThenInclude(p => p.Org)
            .Include(l => l.TargetPerson).ThenInclude(p => p.Org)
            .Include(l => l.CreatedByUser)
            .FirstOrDefaultAsync(l => l.Id == linkId);

        if (link == null)
        {
            return NotFound(new { message = "Link not found" });
        }

        if (link.Status != PersonLinkStatus.Pending)
        {
            return BadRequest(new { message = "Link has already been reviewed" });
        }

        // Must have admin access to target tree to approve
        if (!await HasTreeAccess(link.TargetPerson.OrgId, OrgRole.SubAdmin))
        {
            return Forbid();
        }

        link.Status = request.Approve ? PersonLinkStatus.Approved : PersonLinkStatus.Rejected;
        link.ApprovedByUserId = userId;
        link.UpdatedAt = DateTime.UtcNow;
        
        if (request.Notes != null)
        {
            link.Notes = (link.Notes ?? "") + "\n\nReview: " + request.Notes;
        }

        await _context.SaveChangesAsync();

        var user = await _context.Users.FindAsync(userId);
        var statusText = request.Approve ? "approved" : "rejected";
        _logger.LogInformation("Person link {Status}: {LinkId} by user {UserId}", statusText, linkId, userId);

        return new PersonLinkResponse(
            link.Id,
            link.SourcePersonId,
            link.SourcePerson.PrimaryName,
            link.SourcePerson.OrgId,
            link.SourcePerson.Org.Name,
            link.TargetPersonId,
            link.TargetPerson.PrimaryName,
            link.TargetPerson.OrgId,
            link.TargetPerson.Org.Name,
            link.LinkType,
            link.Confidence,
            link.Notes,
            link.Status,
            link.CreatedByUser != null 
                ? $"{link.CreatedByUser.FirstName} {link.CreatedByUser.LastName}".Trim() 
                : null,
            user != null ? $"{user.FirstName} {user.LastName}".Trim() : null,
            link.CreatedAt
        );
    }

    /// <summary>
    /// Delete a link
    /// </summary>
    [HttpDelete("{linkId}")]
    public async Task<IActionResult> DeleteLink(Guid linkId)
    {
        var userId = GetUserId();

        var link = await _context.Set<PersonLink>()
            .Include(l => l.SourcePerson)
            .Include(l => l.TargetPerson)
            .FirstOrDefaultAsync(l => l.Id == linkId);

        if (link == null)
        {
            return NotFound(new { message = "Link not found" });
        }

        // Must have admin access to either tree, or be the creator
        var hasSourceAccess = await HasTreeAccess(link.SourcePerson.OrgId, OrgRole.SubAdmin);
        var hasTargetAccess = await HasTreeAccess(link.TargetPerson.OrgId, OrgRole.SubAdmin);
        var isCreator = link.CreatedByUserId == userId;

        if (!hasSourceAccess && !hasTargetAccess && !isCreator)
        {
            return Forbid();
        }

        _context.Set<PersonLink>().Remove(link);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Person link deleted: {LinkId} by user {UserId}", linkId, userId);

        return NoContent();
    }

    /// <summary>
    /// Get all approved links for persons in a tree (for D3 visualization)
    /// Returns a map of personId -> list of their approved links
    /// </summary>
    [HttpGet("tree/{treeId}/summary")]
    public async Task<ActionResult<Dictionary<string, List<PersonLinkSummaryDto>>>> GetTreeLinksSummary(Guid treeId)
    {
        if (!await HasTreeAccess(treeId))
        {
            return Forbid();
        }

        // Get all person IDs in this tree
        var personIdsInTree = await _context.People
            .Where(p => p.OrgId == treeId)
            .Select(p => p.Id)
            .ToListAsync();

        // Get all approved links where either source or target is in this tree
        var links = await _context.Set<PersonLink>()
            .Include(l => l.SourcePerson).ThenInclude(p => p.Org).ThenInclude(o => o!.Town)
            .Include(l => l.TargetPerson).ThenInclude(p => p.Org).ThenInclude(o => o!.Town)
            .Where(l => l.Status == PersonLinkStatus.Approved)
            .Where(l => personIdsInTree.Contains(l.SourcePersonId) || personIdsInTree.Contains(l.TargetPersonId))
            .ToListAsync();

        // Build the result dictionary: for each person in our tree, list their cross-tree links
        var result = new Dictionary<string, List<PersonLinkSummaryDto>>();

        foreach (var link in links)
        {
            // Determine which person is "ours" and which is "linked"
            var isSourceOurs = personIdsInTree.Contains(link.SourcePersonId);
            var ourPersonId = isSourceOurs ? link.SourcePersonId : link.TargetPersonId;
            var linkedPerson = isSourceOurs ? link.TargetPerson : link.SourcePerson;

            // Skip if linked person is also in our tree (not a cross-tree link)
            if (personIdsInTree.Contains(linkedPerson.Id)) continue;

            var key = ourPersonId.ToString();
            if (!result.ContainsKey(key))
            {
                result[key] = new List<PersonLinkSummaryDto>();
            }

            result[key].Add(new PersonLinkSummaryDto(
                link.Id,
                link.LinkType,
                linkedPerson.Id,
                linkedPerson.PrimaryName ?? "Unknown",
                linkedPerson.OrgId,
                linkedPerson.Org.Name,
                linkedPerson.Org.TownId,
                linkedPerson.Org.Town?.Name
            ));
        }

        return result;
    }

    /// <summary>
    /// Search for potential link matches in other trees
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<object>>> SearchForMatches(
        [FromQuery] string name,
        [FromQuery] DateTime? birthDate = null,
        [FromQuery] Guid? excludeTreeId = null)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
        {
            return BadRequest(new { message = "Name must be at least 2 characters" });
        }

        var userId = GetUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null) return Unauthorized();

        // Get accessible tree IDs
        var accessibleTreeIds = new List<Guid>();
        
        if (await _userManager.IsInRoleAsync(user, "SuperAdmin"))
        {
            accessibleTreeIds = await _context.Orgs.Select(o => o.Id).ToListAsync();
        }
        else
        {
            if (await _userManager.IsInRoleAsync(user, "Admin"))
            {
                var assignedTrees = await _context.Set<AdminTreeAssignment>()
                    .Where(a => a.UserId == userId)
                    .Select(a => a.TreeId)
                    .ToListAsync();
                accessibleTreeIds.AddRange(assignedTrees);
            }

            var memberTrees = await _context.OrgUsers
                .Where(ou => ou.UserId == userId)
                .Select(ou => ou.OrgId)
                .ToListAsync();
            accessibleTreeIds.AddRange(memberTrees);
            
            // Add public trees that allow linking
            var publicTrees = await _context.Orgs
                .Where(o => o.IsPublic && o.AllowCrossTreeLinking)
                .Select(o => o.Id)
                .ToListAsync();
            accessibleTreeIds.AddRange(publicTrees);
            
            accessibleTreeIds = accessibleTreeIds.Distinct().ToList();
        }

        if (excludeTreeId.HasValue)
        {
            accessibleTreeIds.Remove(excludeTreeId.Value);
        }

        var query = _context.People
            .Include(p => p.Org)
            .Where(p => accessibleTreeIds.Contains(p.OrgId))
            .Where(p => p.PrimaryName != null && EF.Functions.ILike(p.PrimaryName, $"%{name}%"));

        if (birthDate.HasValue)
        {
            var yearStart = new DateTime(birthDate.Value.Year, 1, 1);
            var yearEnd = new DateTime(birthDate.Value.Year, 12, 31);
            query = query.Where(p => p.BirthDate >= yearStart && p.BirthDate <= yearEnd);
        }

        var matches = await query
            .Take(20)
            .Select(p => new
            {
                p.Id,
                p.PrimaryName,
                p.Sex,
                p.BirthDate,
                p.DeathDate,
                TreeId = p.OrgId,
                TreeName = p.Org.Name
            })
            .ToListAsync();

        return Ok(matches);
    }
}
