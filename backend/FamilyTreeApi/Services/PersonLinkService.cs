// File: Services/PersonLinkService.cs
using AutoMapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service for cross-tree person link operations.
/// Uses repositories for data access and AutoMapper for DTO mapping.
/// Services do NOT reference DbContext directly except where complex queries are needed.
/// </summary>
public class PersonLinkService : IPersonLinkService
{
    private readonly ApplicationDbContext _context;
    private readonly IPersonRepository _personRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IMapper _mapper;
    private readonly ILogger<PersonLinkService> _logger;

    public PersonLinkService(
        ApplicationDbContext context,
        IPersonRepository personRepository,
        IOrgRepository orgRepository,
        UserManager<ApplicationUser> userManager,
        IMapper mapper,
        ILogger<PersonLinkService> logger)
    {
        _context = context;
        _personRepository = personRepository;
        _orgRepository = orgRepository;
        _userManager = userManager;
        _mapper = mapper;
        _logger = logger;
    }

    // ============================================================================
    // PERSON LINK OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<List<PersonLinkResponse>>> GetPersonLinksAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var person = await _personRepository.FirstOrDefaultAsync(
                p => p.Id == personId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<List<PersonLinkResponse>>.NotFound("Person not found");
            }

            if (!await HasTreeAccessAsync(person.OrgId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<List<PersonLinkResponse>>.Forbidden();
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
                .ToListAsync(cancellationToken);

            return ServiceResult<List<PersonLinkResponse>>.Success(links);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting links for person {PersonId}", personId);
            return ServiceResult<List<PersonLinkResponse>>.InternalError("Error loading person links");
        }
    }

    public async Task<ServiceResult<List<PersonLinkResponse>>> GetPendingLinksAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());
            if (user == null)
            {
                return ServiceResult<List<PersonLinkResponse>>.Failure("User not found");
            }

            IQueryable<PersonLink> query = _context.Set<PersonLink>()
                .Include(l => l.SourcePerson).ThenInclude(p => p.Org)
                .Include(l => l.TargetPerson).ThenInclude(p => p.Org)
                .Include(l => l.CreatedByUser)
                .Where(l => l.Status == PersonLinkStatus.Pending);

            if (!userContext.IsSuperAdmin)
            {
                // Get tree IDs user can manage
                List<Guid> managedTreeIds;

                if (userContext.IsAdmin)
                {
                    var assignedTrees = await _context.Set<AdminTreeAssignment>()
                        .Where(a => a.UserId == userContext.UserId)
                        .Select(a => a.TreeId)
                        .ToListAsync(cancellationToken);

                    var memberTrees = await _context.OrgUsers
                        .Where(ou => ou.UserId == userContext.UserId && ou.Role >= OrgRole.SubAdmin)
                        .Select(ou => ou.OrgId)
                        .ToListAsync(cancellationToken);

                    managedTreeIds = assignedTrees.Union(memberTrees).ToList();
                }
                else
                {
                    managedTreeIds = await _context.OrgUsers
                        .Where(ou => ou.UserId == userContext.UserId && ou.Role >= OrgRole.SubAdmin)
                        .Select(ou => ou.OrgId)
                        .ToListAsync(cancellationToken);
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
                .ToListAsync(cancellationToken);

            return ServiceResult<List<PersonLinkResponse>>.Success(links);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending links for user {UserId}", userContext.UserId);
            return ServiceResult<List<PersonLinkResponse>>.InternalError("Error loading pending links");
        }
    }

    public async Task<ServiceResult<PersonLinkResponse>> CreateLinkAsync(
        CreatePersonLinkRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var sourcePerson = await _context.People
                .Include(p => p.Org)
                .FirstOrDefaultAsync(p => p.Id == request.SourcePersonId, cancellationToken);

            var targetPerson = await _context.People
                .Include(p => p.Org)
                .FirstOrDefaultAsync(p => p.Id == request.TargetPersonId, cancellationToken);

            if (sourcePerson == null || targetPerson == null)
            {
                return ServiceResult<PersonLinkResponse>.NotFound("One or both persons not found");
            }

            // Must have edit access to source tree
            if (!await HasTreeAccessAsync(sourcePerson.OrgId, userContext, OrgRole.Editor, cancellationToken))
            {
                return ServiceResult<PersonLinkResponse>.Forbidden();
            }

            // Check if target tree allows cross-linking
            if (!targetPerson.Org.AllowCrossTreeLinking)
            {
                return ServiceResult<PersonLinkResponse>.Failure("Target tree does not allow cross-tree linking");
            }

            // Check for existing link
            var existingLink = await _context.Set<PersonLink>()
                .AnyAsync(l =>
                    (l.SourcePersonId == request.SourcePersonId && l.TargetPersonId == request.TargetPersonId) ||
                    (l.SourcePersonId == request.TargetPersonId && l.TargetPersonId == request.SourcePersonId),
                    cancellationToken);

            if (existingLink)
            {
                return ServiceResult<PersonLinkResponse>.Failure("A link already exists between these persons");
            }

            // Determine if auto-approve (same tree or user is admin of both)
            var sameTree = sourcePerson.OrgId == targetPerson.OrgId;
            var hasTargetAccess = await HasTreeAccessAsync(targetPerson.OrgId, userContext, OrgRole.SubAdmin, cancellationToken);
            var autoApprove = sameTree || hasTargetAccess;

            var link = new PersonLink
            {
                Id = Guid.NewGuid(),
                SourcePersonId = request.SourcePersonId,
                TargetPersonId = request.TargetPersonId,
                LinkType = request.LinkType,
                Confidence = Math.Clamp(request.Confidence, 0, 100),
                Notes = request.Notes,
                CreatedByUserId = userContext.UserId,
                Status = autoApprove ? PersonLinkStatus.Approved : PersonLinkStatus.Pending,
                ApprovedByUserId = autoApprove ? userContext.UserId : null,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Set<PersonLink>().Add(link);
            await _context.SaveChangesAsync(cancellationToken);

            var user = await _context.Users.FindAsync(new object[] { userContext.UserId }, cancellationToken);
            var statusText = autoApprove ? "approved" : "pending";
            _logger.LogInformation("Person link created ({Status}): {SourceId} -> {TargetId} by user {UserId}",
                statusText, request.SourcePersonId, request.TargetPersonId, userContext.UserId);

            var response = new PersonLinkResponse(
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
            );

            return ServiceResult<PersonLinkResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating link from {SourceId} to {TargetId}",
                request.SourcePersonId, request.TargetPersonId);
            return ServiceResult<PersonLinkResponse>.InternalError("Error creating person link");
        }
    }

    public async Task<ServiceResult<PersonLinkResponse>> ReviewLinkAsync(
        Guid linkId,
        ApprovePersonLinkRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var link = await _context.Set<PersonLink>()
                .Include(l => l.SourcePerson).ThenInclude(p => p.Org)
                .Include(l => l.TargetPerson).ThenInclude(p => p.Org)
                .Include(l => l.CreatedByUser)
                .FirstOrDefaultAsync(l => l.Id == linkId, cancellationToken);

            if (link == null)
            {
                return ServiceResult<PersonLinkResponse>.NotFound("Link not found");
            }

            if (link.Status != PersonLinkStatus.Pending)
            {
                return ServiceResult<PersonLinkResponse>.Failure("Link has already been reviewed");
            }

            // Must have admin access to target tree to approve
            if (!await HasTreeAccessAsync(link.TargetPerson.OrgId, userContext, OrgRole.SubAdmin, cancellationToken))
            {
                return ServiceResult<PersonLinkResponse>.Forbidden();
            }

            link.Status = request.Approve ? PersonLinkStatus.Approved : PersonLinkStatus.Rejected;
            link.ApprovedByUserId = userContext.UserId;
            link.UpdatedAt = DateTime.UtcNow;

            if (request.Notes != null)
            {
                link.Notes = (link.Notes ?? "") + "\n\nReview: " + request.Notes;
            }

            await _context.SaveChangesAsync(cancellationToken);

            var user = await _context.Users.FindAsync(new object[] { userContext.UserId }, cancellationToken);
            var statusText = request.Approve ? "approved" : "rejected";
            _logger.LogInformation("Person link {Status}: {LinkId} by user {UserId}", statusText, linkId, userContext.UserId);

            var response = new PersonLinkResponse(
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

            return ServiceResult<PersonLinkResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reviewing link {LinkId}", linkId);
            return ServiceResult<PersonLinkResponse>.InternalError("Error reviewing person link");
        }
    }

    public async Task<ServiceResult> DeleteLinkAsync(
        Guid linkId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var link = await _context.Set<PersonLink>()
                .Include(l => l.SourcePerson)
                .Include(l => l.TargetPerson)
                .FirstOrDefaultAsync(l => l.Id == linkId, cancellationToken);

            if (link == null)
            {
                return ServiceResult.NotFound("Link not found");
            }

            // Must have admin access to either tree, or be the creator
            var hasSourceAccess = await HasTreeAccessAsync(link.SourcePerson.OrgId, userContext, OrgRole.SubAdmin, cancellationToken);
            var hasTargetAccess = await HasTreeAccessAsync(link.TargetPerson.OrgId, userContext, OrgRole.SubAdmin, cancellationToken);
            var isCreator = link.CreatedByUserId == userContext.UserId;

            if (!hasSourceAccess && !hasTargetAccess && !isCreator)
            {
                return ServiceResult.Forbidden();
            }

            _context.Set<PersonLink>().Remove(link);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Person link deleted: {LinkId} by user {UserId}", linkId, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting link {LinkId}", linkId);
            return ServiceResult.InternalError("Error deleting person link");
        }
    }

    public async Task<ServiceResult<Dictionary<string, List<PersonLinkSummaryDto>>>> GetTreeLinksSummaryAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<Dictionary<string, List<PersonLinkSummaryDto>>>.Forbidden();
            }

            // Get all person IDs in this tree
            var personIdsInTree = await _context.People
                .Where(p => p.OrgId == treeId)
                .Select(p => p.Id)
                .ToListAsync(cancellationToken);

            // Get all approved links where either source or target is in this tree
            var links = await _context.Set<PersonLink>()
                .Include(l => l.SourcePerson).ThenInclude(p => p.Org).ThenInclude(o => o!.Town)
                .Include(l => l.TargetPerson).ThenInclude(p => p.Org).ThenInclude(o => o!.Town)
                .Where(l => l.Status == PersonLinkStatus.Approved)
                .Where(l => personIdsInTree.Contains(l.SourcePersonId) || personIdsInTree.Contains(l.TargetPersonId))
                .ToListAsync(cancellationToken);

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

            return ServiceResult<Dictionary<string, List<PersonLinkSummaryDto>>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting tree links summary for tree {TreeId}", treeId);
            return ServiceResult<Dictionary<string, List<PersonLinkSummaryDto>>>.InternalError("Error loading tree links summary");
        }
    }

    public async Task<ServiceResult<List<PersonSearchResultDto>>> SearchForMatchesAsync(
        string name,
        DateTime? birthDate,
        Guid? excludeTreeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
            {
                return ServiceResult<List<PersonSearchResultDto>>.Failure("Name must be at least 2 characters");
            }

            var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());
            if (user == null)
            {
                return ServiceResult<List<PersonSearchResultDto>>.Failure("User not found");
            }

            // Get accessible tree IDs
            var accessibleTreeIds = new List<Guid>();

            if (userContext.IsSuperAdmin)
            {
                accessibleTreeIds = await _context.Orgs.Select(o => o.Id).ToListAsync(cancellationToken);
            }
            else
            {
                if (userContext.IsAdmin)
                {
                    var assignedTrees = await _context.Set<AdminTreeAssignment>()
                        .Where(a => a.UserId == userContext.UserId)
                        .Select(a => a.TreeId)
                        .ToListAsync(cancellationToken);
                    accessibleTreeIds.AddRange(assignedTrees);
                }

                var memberTrees = await _context.OrgUsers
                    .Where(ou => ou.UserId == userContext.UserId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync(cancellationToken);
                accessibleTreeIds.AddRange(memberTrees);

                // Add public trees that allow linking
                var publicTrees = await _context.Orgs
                    .Where(o => o.IsPublic && o.AllowCrossTreeLinking)
                    .Select(o => o.Id)
                    .ToListAsync(cancellationToken);
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
                .Select(p => new PersonSearchResultDto(
                    p.Id,
                    p.PrimaryName,
                    p.Sex,
                    p.BirthDate,
                    p.DeathDate,
                    p.OrgId,
                    p.Org.Name
                ))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<PersonSearchResultDto>>.Success(matches);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching for matches with name '{Name}'", name);
            return ServiceResult<List<PersonSearchResultDto>>.InternalError("Error searching for matches");
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Check if user has access to a tree with minimum required role.
    /// Preserves exact behavior from original controller.
    /// </summary>
    private async Task<bool> HasTreeAccessAsync(
        Guid treeId,
        UserContext userContext,
        OrgRole minRole,
        CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());

        if (user == null) return false;
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
}
