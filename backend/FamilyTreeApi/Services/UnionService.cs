// File: Services/UnionService.cs
using System.Text.Json;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Union service implementation.
/// </summary>
public class UnionService : IUnionService
{
    private readonly ApplicationDbContext _context;
    private readonly IUnionRepository _unionRepository;
    private readonly IPersonRepository _personRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IMapper _mapper;
    private readonly ILogger<UnionService> _logger;

    public UnionService(
        ApplicationDbContext context,
        IUnionRepository unionRepository,
        IPersonRepository personRepository,
        IOrgRepository orgRepository,
        IAuditLogService auditLogService,
        IMapper mapper,
        ILogger<UnionService> logger)
    {
        _context = context;
        _unionRepository = unionRepository;
        _personRepository = personRepository;
        _orgRepository = orgRepository;
        _auditLogService = auditLogService;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<ServiceResult<PagedResult<UnionListItemDto>>> GetUnionsAsync(
        UnionSearchDto search,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // When searching by personId, resolve org from the person to avoid multi-org JWT mismatch
            var effectiveTreeId = search.TreeId;
            if (!effectiveTreeId.HasValue && search.PersonId.HasValue)
            {
                var person = await _personRepository.GetByIdAsync(search.PersonId.Value);
                if (person != null)
                {
                    effectiveTreeId = person.OrgId;
                }
            }

            var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<PagedResult<UnionListItemDto>>.Failure(error!);
            }

            var (items, totalCount) = await _unionRepository.GetPagedAsync(orgId.Value, search, cancellationToken);
            var totalPages = (int)Math.Ceiling(totalCount / (double)search.PageSize);

            var result = new PagedResult<UnionListItemDto>(items, totalCount, search.Page, search.PageSize, totalPages);
            return ServiceResult<PagedResult<UnionListItemDto>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting unions");
            return ServiceResult<PagedResult<UnionListItemDto>>.InternalError("Error loading unions");
        }
    }

    public async Task<ServiceResult<UnionResponseDto>> GetUnionAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Find union first to get its actual org, avoiding multi-org JWT mismatch
            var effectiveTreeId = treeId;
            if (!effectiveTreeId.HasValue)
            {
                var basicUnion = await _unionRepository.GetByIdAsync(id);
                if (basicUnion == null)
                {
                    return ServiceResult<UnionResponseDto>.NotFound("Union not found");
                }
                effectiveTreeId = basicUnion.OrgId;
            }

            var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<UnionResponseDto>.Failure(error!);
            }

            var union = await _unionRepository.GetByIdWithDetailsAsync(id, orgId.Value, cancellationToken);
            if (union == null)
            {
                return ServiceResult<UnionResponseDto>.NotFound("Union not found");
            }

            var dto = MapToResponseDto(union);
            return ServiceResult<UnionResponseDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting union {UnionId}", id);
            return ServiceResult<UnionResponseDto>.InternalError("Error loading union");
        }
    }

    public async Task<ServiceResult<UnionResponseDto>> CreateUnionAsync(
        CreateUnionDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<UnionResponseDto>.Forbidden();
        }

        // If no treeId provided, infer from the first member person's org
        var effectiveTreeId = dto.TreeId;
        if (!effectiveTreeId.HasValue && dto.MemberIds != null && dto.MemberIds.Any())
        {
            var firstPerson = await _personRepository.GetByIdAsync(dto.MemberIds.First());
            if (firstPerson != null)
            {
                effectiveTreeId = firstPerson.OrgId;
            }
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<UnionResponseDto>.Failure(error!);
        }

        // Check for duplicate union: prevent adding the same pair of people as spouses again
        if (dto.MemberIds != null && dto.MemberIds.Count >= 2)
        {
            var memberIdSet = dto.MemberIds.Distinct().ToList();
            // Find existing unions where ALL these members are already together
            var existingUnions = await _context.Unions
                .Include(u => u.Members)
                .Where(u => u.Members.Any(m => memberIdSet.Contains(m.PersonId)))
                .ToListAsync(cancellationToken);

            foreach (var existingUnion in existingUnions)
            {
                var existingMemberIds = existingUnion.Members.Select(m => m.PersonId).ToHashSet();
                if (memberIdSet.All(id => existingMemberIds.Contains(id)))
                {
                    return ServiceResult<UnionResponseDto>.Failure(
                        "A union between these people already exists");
                }
            }
        }

        var union = new Union
        {
            Id = Guid.NewGuid(),
            OrgId = orgId.Value,
            Type = dto.Type,
            StartDate = dto.StartDate,
            StartPrecision = dto.StartPrecision,
            StartPlaceId = dto.StartPlaceId,
            EndDate = dto.EndDate,
            EndPrecision = dto.EndPrecision,
            EndPlaceId = dto.EndPlaceId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _unionRepository.Add(union);
        await _unionRepository.SaveChangesAsync(cancellationToken);

        // Add members if provided (cross-tree linking allowed)
        if (dto.MemberIds != null && dto.MemberIds.Any())
        {
            foreach (var memberId in dto.MemberIds)
            {
                // Allow cross-tree relationships: just verify the person exists (any tree)
                var personExists = await _personRepository.GetByIdAsync(memberId) != null;
                if (personExists)
                {
                    var member = new UnionMember
                    {
                        Id = Guid.NewGuid(),
                        UnionId = union.Id,
                        PersonId = memberId,
                        Role = "Partner",
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.UnionMembers.Add(member);  // Add directly to DbSet to avoid tracking issues
                }
            }
            await _context.SaveChangesAsync(cancellationToken);
        }

        var createdUnion = await _unionRepository.GetByIdWithDetailsAsync(union.Id, orgId.Value, cancellationToken);
        _logger.LogInformation("Union created: {UnionId} in Org: {OrgId}", union.Id, orgId);

        await _auditLogService.LogAsync(
            userContext.UserId, "Create", "Union", union.Id,
            $"Created union in org {orgId}",
            newValuesJson: JsonSerializer.Serialize(new { union.Id, union.Type, union.StartDate }),
            cancellationToken: cancellationToken);

        // Compute suggested child links: children of one member who aren't linked to the other
        List<SuggestedChildLinkDto>? suggestedChildLinks = null;
        try
        {
            if (createdUnion?.Members != null && createdUnion.Members.Count >= 2)
            {
                var links = await GetSuggestedChildLinksAsync(
                    createdUnion.Members.ToList(), cancellationToken);
                if (links.Count > 0)
                {
                    suggestedChildLinks = links;
                }
            }
        }
        catch (Exception suggestEx)
        {
            // Non-critical: log but don't fail the main operation
            _logger.LogWarning(suggestEx,
                "Error computing suggested child links for union {UnionId}", union.Id);
        }

        return ServiceResult<UnionResponseDto>.Success(
            MapToResponseDto(createdUnion!, suggestedChildLinks));
    }

    public async Task<ServiceResult<UnionResponseDto>> UpdateUnionAsync(
        Guid id,
        UpdateUnionDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult<UnionResponseDto>.Forbidden();
        }

        // Find union first to get its actual org, avoiding multi-org JWT mismatch
        var effectiveTreeId = treeId;
        if (!effectiveTreeId.HasValue)
        {
            var basicUnion = await _unionRepository.GetByIdAsync(id);
            if (basicUnion == null)
            {
                return ServiceResult<UnionResponseDto>.NotFound("Union not found");
            }
            effectiveTreeId = basicUnion.OrgId;
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<UnionResponseDto>.Failure(error!);
        }

        var union = await _unionRepository.GetByIdWithDetailsAsync(id, orgId.Value, cancellationToken);
        if (union == null)
        {
            return ServiceResult<UnionResponseDto>.NotFound("Union not found");
        }

        if (dto.Type.HasValue) union.Type = dto.Type.Value;
        if (dto.StartDate.HasValue) union.StartDate = dto.StartDate;
        if (dto.StartPrecision.HasValue) union.StartPrecision = dto.StartPrecision.Value;
        if (dto.StartPlaceId.HasValue) union.StartPlaceId = dto.StartPlaceId;
        if (dto.EndDate.HasValue) union.EndDate = dto.EndDate;
        if (dto.EndPrecision.HasValue) union.EndPrecision = dto.EndPrecision.Value;
        if (dto.EndPlaceId.HasValue) union.EndPlaceId = dto.EndPlaceId;
        union.UpdatedAt = DateTime.UtcNow;
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Union updated: {UnionId}", id);

        await _auditLogService.LogAsync(
            userContext.UserId, "Update", "Union", id,
            $"Updated union {id}",
            cancellationToken: cancellationToken);

        return ServiceResult<UnionResponseDto>.Success(MapToResponseDto(union));
    }

    public async Task<ServiceResult> DeleteUnionAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult.Forbidden();
        }

        // Find union first to get its actual org, avoiding multi-org JWT mismatch
        var union = await _unionRepository.GetByIdAsync(id);
        if (union == null)
        {
            return ServiceResult.NotFound("Union not found");
        }

        var effectiveTreeId = treeId ?? union.OrgId;
        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Forbidden();
        }

        _unionRepository.Remove(union);
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Union deleted: {UnionId}", id);

        await _auditLogService.LogAsync(
            userContext.UserId, "Delete", "Union", id,
            $"Deleted union {id}",
            cancellationToken: cancellationToken);

        return ServiceResult.Success();
    }

    public async Task<ServiceResult<UnionMemberDto>> AddMemberAsync(
        Guid unionId,
        AddUnionMemberDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<UnionMemberDto>.Forbidden();
        }

        // Find union first to get its actual org, avoiding multi-org JWT mismatch
        var effectiveTreeId = treeId;
        if (!effectiveTreeId.HasValue)
        {
            var basicUnion = await _unionRepository.GetByIdAsync(unionId);
            if (basicUnion == null)
            {
                return ServiceResult<UnionMemberDto>.NotFound("Union not found");
            }
            effectiveTreeId = basicUnion.OrgId;
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<UnionMemberDto>.Failure(error!);
        }

        var union = await _unionRepository.GetByIdWithDetailsAsync(unionId, orgId.Value, cancellationToken);
        if (union == null)
        {
            return ServiceResult<UnionMemberDto>.NotFound("Union not found");
        }

        // Allow cross-tree members: check person exists globally, not just in the union's org
        var person = await _personRepository.GetByIdAsync(dto.PersonId);
        if (person == null)
        {
            return ServiceResult<UnionMemberDto>.NotFound("Person not found");
        }

        var existingMember = await _unionRepository.GetMemberAsync(unionId, dto.PersonId, cancellationToken);
        if (existingMember != null)
        {
            return ServiceResult<UnionMemberDto>.Failure("Person is already a member of this union");
        }

        var member = new UnionMember
        {
            Id = Guid.NewGuid(),
            UnionId = unionId,
            PersonId = dto.PersonId,
            Role = "Partner",
            CreatedAt = DateTime.UtcNow
        };

        _context.UnionMembers.Add(member);  // Add directly to DbSet to avoid tracking issues
        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Member {PersonId} added to union {UnionId}", dto.PersonId, unionId);

        return ServiceResult<UnionMemberDto>.Success(new UnionMemberDto
        {
            Id = member.Id,
            PersonId = dto.PersonId,
            PersonName = person?.PrimaryName,
            PersonNameArabic = person?.NameArabic,
            PersonNameEnglish = person?.NameEnglish,
            PersonNameNobiin = person?.NameNobiin,
            Sex = person?.Sex
        });
    }

    public async Task<ServiceResult> RemoveMemberAsync(
        Guid unionId,
        Guid personId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult.Forbidden();
        }

        // Find union first to get its actual org, avoiding multi-org JWT mismatch
        var effectiveTreeId = treeId;
        if (!effectiveTreeId.HasValue)
        {
            var basicUnion = await _unionRepository.GetByIdAsync(unionId);
            if (basicUnion == null)
            {
                return ServiceResult.NotFound("Union not found");
            }
            effectiveTreeId = basicUnion.OrgId;
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Forbidden();
        }

        var member = await _unionRepository.GetMemberAsync(unionId, personId, cancellationToken);
        if (member == null)
        {
            return ServiceResult.NotFound("Member not found in union");
        }

        // Remove through context
        _context.UnionMembers.Remove(member);
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Member {PersonId} removed from union {UnionId}", personId, unionId);
        return ServiceResult.Success();
    }

    public async Task<ServiceResult<List<UnionChildDto>>> GetChildrenAsync(
        Guid unionId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Find union first to get its actual org
        var effectiveTreeId = treeId;
        if (!effectiveTreeId.HasValue)
        {
            var basicUnion = await _unionRepository.GetByIdAsync(unionId);
            if (basicUnion == null)
            {
                return ServiceResult<List<UnionChildDto>>.NotFound("Union not found");
            }
            effectiveTreeId = basicUnion.OrgId;
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<List<UnionChildDto>>.Failure(error!);
        }

        if (!await _unionRepository.ExistsInOrgAsync(unionId, orgId.Value, cancellationToken))
        {
            return ServiceResult<List<UnionChildDto>>.NotFound("Union not found");
        }

        var relationships = await _unionRepository.GetChildrenRelationshipsAsync(unionId, cancellationToken);
        var children = relationships
            .Select(pc => pc.Child)
            .Distinct()
            .Select(c => new UnionChildDto(
                c.Id,
                c.PrimaryName,
                c.Sex,
                c.BirthDate,
                c.BirthPlace?.Name
            ))
            .ToList();

        return ServiceResult<List<UnionChildDto>>.Success(children);
    }

    public async Task<ServiceResult<UnionChildDto>> AddChildAsync(
        Guid unionId,
        AddUnionChildDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<UnionChildDto>.Forbidden();
        }

        // Find union first to get its actual org
        var effectiveTreeId = treeId;
        if (!effectiveTreeId.HasValue)
        {
            var basicUnion = await _unionRepository.GetByIdAsync(unionId);
            if (basicUnion == null)
            {
                return ServiceResult<UnionChildDto>.NotFound("Union not found");
            }
            effectiveTreeId = basicUnion.OrgId;
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<UnionChildDto>.Failure(error!);
        }

        if (!await _unionRepository.ExistsInOrgAsync(unionId, orgId.Value, cancellationToken))
        {
            return ServiceResult<UnionChildDto>.NotFound("Union not found");
        }

        var child = await _personRepository.GetByIdWithDetailsAsync(dto.ChildId, orgId.Value, cancellationToken);
        if (child == null)
        {
            return ServiceResult<UnionChildDto>.NotFound("Child not found");
        }

        // Get union members and create parent-child relationships for each member → child
        var members = await _unionRepository.GetMembersAsync(unionId, cancellationToken);

        // Track created relationships for logging
        var createdRelationships = new List<Guid>();

        foreach (var member in members)
        {
            // Skip if parent-child relationship already exists
            var alreadyExists = await _context.ParentChildren
                .AnyAsync(pc => pc.ParentId == member.PersonId && pc.ChildId == dto.ChildId
                    && !pc.IsDeleted, cancellationToken);
            if (alreadyExists)
            {
                _logger.LogInformation(
                    "ParentChild already exists: Parent {ParentId} -> Child {ChildId}, skipping",
                    member.PersonId, dto.ChildId);
                continue;
            }

            // Cycle detection: ensure adding this parent-child won't create a cycle
            if (await WouldCreateCycleAsync(member.PersonId, dto.ChildId, cancellationToken))
            {
                _logger.LogWarning(
                    "Skipping ParentChild creation for Parent {ParentId} -> Child {ChildId}: would create cycle",
                    member.PersonId, dto.ChildId);
                continue;
            }

            // Check max 2 biological parents constraint
            var existingBioParentCount = await _context.ParentChildren
                .CountAsync(pc => pc.ChildId == dto.ChildId
                    && pc.RelationshipType == RelationshipType.Biological
                    && !pc.IsDeleted, cancellationToken);
            if (existingBioParentCount >= 2)
            {
                _logger.LogWarning(
                    "Skipping ParentChild creation for Parent {ParentId} -> Child {ChildId}: child already has 2 biological parents",
                    member.PersonId, dto.ChildId);
                continue;
            }

            var parentChild = new ParentChild
            {
                Id = Guid.NewGuid(),
                ParentId = member.PersonId,
                ChildId = dto.ChildId,
                RelationshipType = RelationshipType.Biological,
                CreatedAt = DateTime.UtcNow
            };

            _context.ParentChildren.Add(parentChild);
            createdRelationships.Add(parentChild.Id);
        }

        try
        {
            await _unionRepository.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("duplicate") == true
            || ex.InnerException?.Message.Contains("unique") == true
            || ex.InnerException?.Message.Contains("IX_ParentChildren") == true)
        {
            // Concurrent duplicate insert — DB unique index caught it; data is safe
            _logger.LogWarning(ex,
                "Concurrent duplicate detected adding child {ChildId} to union {UnionId}", dto.ChildId, unionId);
            return ServiceResult<UnionChildDto>.Failure(
                "A parent-child relationship was already created by another operation");
        }

        _logger.LogInformation(
            "Child {ChildId} added to union {UnionId}, created {Count} parent-child relationships",
            dto.ChildId, unionId, createdRelationships.Count);

        return ServiceResult<UnionChildDto>.Success(new UnionChildDto(
            child.Id,
            child.PrimaryName,
            child.Sex,
            child.BirthDate,
            child.BirthPlace?.Name
        ));
    }

    public async Task<ServiceResult> RemoveChildAsync(
        Guid unionId,
        Guid childId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult.Forbidden();
        }

        // Find union first to get its actual org
        var effectiveTreeId = treeId;
        if (!effectiveTreeId.HasValue)
        {
            var basicUnion = await _unionRepository.GetByIdAsync(unionId);
            if (basicUnion == null)
            {
                return ServiceResult.NotFound("Union not found");
            }
            effectiveTreeId = basicUnion.OrgId;
        }

        var (orgId, error) = await ResolveOrgIdAsync(effectiveTreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Forbidden();
        }

        // Get union members to know which parent-child relationships to remove
        var members = await _unionRepository.GetMembersAsync(unionId, cancellationToken);
        var memberPersonIds = members.Select(m => m.PersonId).ToList();

        // Find and soft-delete parent-child relationships between union members and this child
        var relationshipsToRemove = await _context.ParentChildren
            .Where(pc => memberPersonIds.Contains(pc.ParentId)
                && pc.ChildId == childId
                && !pc.IsDeleted)
            .ToListAsync(cancellationToken);

        foreach (var relationship in relationshipsToRemove)
        {
            relationship.IsDeleted = true;
            relationship.DeletedAt = DateTime.UtcNow;
            _logger.LogInformation(
                "Soft-deleting ParentChild: Parent {ParentId} -> Child {ChildId}",
                relationship.ParentId, childId);
        }

        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Child {ChildId} removed from union {UnionId}, soft-deleted {Count} parent-child relationships",
            childId, unionId, relationshipsToRemove.Count);
        return ServiceResult.Success();
    }

    /// <summary>
    /// Check if adding a parent-child relationship would create a cycle in the family tree.
    /// Uses BFS traversal from the child downward through descendants to see if the parent is reachable.
    /// </summary>
    private async Task<bool> WouldCreateCycleAsync(
        Guid parentId,
        Guid childId,
        CancellationToken cancellationToken)
    {
        var visited = new HashSet<Guid>();
        var queue = new Queue<Guid>();
        queue.Enqueue(childId);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();

            if (current == parentId)
            {
                return true; // Cycle detected
            }

            if (visited.Contains(current))
            {
                continue;
            }

            visited.Add(current);

            var children = await _context.ParentChildren
                .Where(pc => pc.ParentId == current && !pc.IsDeleted)
                .Select(pc => pc.ChildId)
                .ToListAsync(cancellationToken);

            foreach (var child in children)
            {
                if (!visited.Contains(child))
                {
                    queue.Enqueue(child);
                }
            }
        }

        return false;
    }

    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(
        Guid? requestedTreeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // Developer has same full access as SuperAdmin
        if (userContext.IsDeveloper || userContext.IsSuperAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _orgRepository.ExistsAsync(o => o.Id == requestedTreeId.Value, cancellationToken);
                if (!treeExists) return (null, "The specified tree does not exist.");
                return (requestedTreeId, null);
            }
            if (userContext.OrgId.HasValue) return (userContext.OrgId, null);
            return (null, "You must specify a treeId or be a member of a tree.");
        }

        if (userContext.IsAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                var isAssigned = await _orgRepository.IsAdminAssignedToTreeAsync(userContext.UserId, requestedTreeId.Value, cancellationToken);
                if (isAssigned) return (requestedTreeId, null);

                var isMember = await _orgRepository.IsUserMemberOfOrgAsync(userContext.UserId, requestedTreeId.Value, cancellationToken);
                if (isMember) return (requestedTreeId, null);

                return (null, "You are not assigned to this tree.");
            }
            if (userContext.OrgId.HasValue) return (userContext.OrgId, null);
            return (null, "Admin must specify a treeId.");
        }

        // Regular user: check membership first
        if (userContext.OrgId.HasValue)
        {
            if (requestedTreeId.HasValue && requestedTreeId.Value != userContext.OrgId.Value)
            {
                var isMember = await _orgRepository.IsUserMemberOfOrgAsync(userContext.UserId, requestedTreeId.Value, cancellationToken);
                if (!isMember)
                {
                    // Check if tree is in user's selected town (browse mode)
                    if (userContext.SelectedTownId.HasValue)
                    {
                        var tree = await _orgRepository.GetByIdAsync(requestedTreeId.Value, cancellationToken);
                        if (tree != null && tree.TownId == userContext.SelectedTownId.Value)
                        {
                            return (requestedTreeId, null);
                        }
                    }
                    return (null, "You are not a member of this tree.");
                }
                return (requestedTreeId, null);
            }
            return (userContext.OrgId, null);
        }

        // Regular user without membership: check if requested tree is in their selected town
        if (requestedTreeId.HasValue && userContext.SelectedTownId.HasValue)
        {
            var tree = await _orgRepository.GetByIdAsync(requestedTreeId.Value, cancellationToken);
            if (tree != null && tree.TownId == userContext.SelectedTownId.Value)
            {
                return (requestedTreeId, null);
            }
        }

        return (null, "You must be a member of a family tree or select a town to browse.");
    }

    private static UnionResponseDto MapToResponseDto(
        Union union,
        List<SuggestedChildLinkDto>? suggestedChildLinks = null)
    {
        return new UnionResponseDto(
            union.Id,
            union.OrgId,
            union.Type,
            union.StartDate,
            union.StartPrecision,
            union.StartPlaceId,
            union.StartPlace?.Name,
            union.EndDate,
            union.EndPrecision,
            union.EndPlaceId,
            union.EndPlace?.Name,
            union.Members.Select(m => new UnionMemberDto
            {
                Id = m.Id,
                PersonId = m.PersonId,
                PersonName = m.Person?.PrimaryName,
                PersonNameArabic = m.Person?.NameArabic,
                PersonNameEnglish = m.Person?.NameEnglish,
                PersonNameNobiin = m.Person?.NameNobiin,
                Sex = m.Person?.Sex
            }).ToList(),
            union.CreatedAt,
            union.UpdatedAt,
            suggestedChildLinks
        );
    }

    /// <summary>
    /// For each member of a union, find their children who are NOT linked to the other member(s).
    /// Returns suggestions for the user to optionally create those missing parent-child links.
    /// </summary>
    private async Task<List<SuggestedChildLinkDto>> GetSuggestedChildLinksAsync(
        List<UnionMember> members,
        CancellationToken cancellationToken)
    {
        var suggestions = new List<SuggestedChildLinkDto>();
        if (members.Count < 2) return suggestions;

        var memberPersonIds = members.Select(m => m.PersonId).ToList();

        // For each member, get their children
        foreach (var member in members)
        {
            var children = await _context.ParentChildren
                .Include(pc => pc.Child)
                .Where(pc => pc.ParentId == member.PersonId && !pc.IsDeleted && !pc.Child.IsDeleted)
                .ToListAsync(cancellationToken);

            // For each child, check if any OTHER union member is NOT already a parent
            foreach (var childRel in children)
            {
                var existingParentIds = await _context.ParentChildren
                    .Where(pc => pc.ChildId == childRel.ChildId && !pc.IsDeleted)
                    .Select(pc => pc.ParentId)
                    .ToListAsync(cancellationToken);

                foreach (var otherMember in members.Where(m => m.PersonId != member.PersonId))
                {
                    if (existingParentIds.Contains(otherMember.PersonId))
                        continue; // Already linked

                    // Check max 2 bio parents
                    var bioParentCount = await _context.ParentChildren
                        .CountAsync(pc => pc.ChildId == childRel.ChildId
                            && pc.RelationshipType == RelationshipType.Biological
                            && !pc.IsDeleted, cancellationToken);
                    if (bioParentCount >= 2)
                        continue;

                    // Load the other member's person data if not already loaded
                    var otherPerson = otherMember.Person ??
                        await _personRepository.GetByIdAsync(otherMember.PersonId);
                    var existingParentPerson = member.Person ??
                        await _personRepository.GetByIdAsync(member.PersonId);

                    suggestions.Add(new SuggestedChildLinkDto(
                        ChildId: childRel.ChildId,
                        ChildName: childRel.Child?.PrimaryName,
                        ChildNameArabic: childRel.Child?.NameArabic,
                        ChildNameEnglish: childRel.Child?.NameEnglish,
                        ChildNameNobiin: childRel.Child?.NameNobiin,
                        ChildSex: childRel.Child?.Sex,
                        ExistingParentId: member.PersonId,
                        ExistingParentName: existingParentPerson?.PrimaryName,
                        SuggestedParentId: otherMember.PersonId,
                        SuggestedParentName: otherPerson?.PrimaryName
                    ));
                }
            }
        }

        // Deduplicate by (ChildId, SuggestedParentId)
        return suggestions
            .GroupBy(s => new { s.ChildId, s.SuggestedParentId })
            .Select(g => g.First())
            .ToList();
    }
}
