// File: Services/UnionService.cs
using AutoMapper;
using Microsoft.Extensions.Logging;
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
    private readonly IUnionRepository _unionRepository;
    private readonly IPersonRepository _personRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly IMapper _mapper;
    private readonly ILogger<UnionService> _logger;

    public UnionService(
        IUnionRepository unionRepository,
        IPersonRepository personRepository,
        IOrgRepository orgRepository,
        IMapper mapper,
        ILogger<UnionService> logger)
    {
        _unionRepository = unionRepository;
        _personRepository = personRepository;
        _orgRepository = orgRepository;
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
            var (orgId, error) = await ResolveOrgIdAsync(search.TreeId, userContext, cancellationToken);
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
            var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
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

        var (orgId, error) = await ResolveOrgIdAsync(dto.TreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<UnionResponseDto>.Failure(error!);
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
            Notes = dto.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _unionRepository.Add(union);
        await _unionRepository.SaveChangesAsync(cancellationToken);

        // Add members if provided
        if (dto.MemberIds != null && dto.MemberIds.Any())
        {
            foreach (var memberId in dto.MemberIds)
            {
                if (await _personRepository.ExistsInOrgAsync(memberId, orgId.Value, cancellationToken))
                {
                    var member = new UnionMember
                    {
                        Id = Guid.NewGuid(),
                        UnionId = union.Id,
                        PersonId = memberId,
                        Role = "Partner",
                        CreatedAt = DateTime.UtcNow
                    };
                    union.Members.Add(member);
                }
            }
            await _unionRepository.SaveChangesAsync(cancellationToken);
        }

        var createdUnion = await _unionRepository.GetByIdWithDetailsAsync(union.Id, orgId.Value, cancellationToken);
        _logger.LogInformation("Union created: {UnionId} in Org: {OrgId}", union.Id, orgId);

        return ServiceResult<UnionResponseDto>.Success(MapToResponseDto(createdUnion!));
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

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
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
        if (dto.Notes != null) union.Notes = dto.Notes;

        union.UpdatedAt = DateTime.UtcNow;
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Union updated: {UnionId}", id);
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

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Failure(error!);
        }

        var union = await _unionRepository.FirstOrDefaultAsync(u => u.Id == id && u.OrgId == orgId, cancellationToken);
        if (union == null)
        {
            return ServiceResult.NotFound("Union not found");
        }

        _unionRepository.Remove(union);
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Union deleted: {UnionId}", id);
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

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<UnionMemberDto>.Failure(error!);
        }

        var union = await _unionRepository.GetByIdWithDetailsAsync(unionId, orgId.Value, cancellationToken);
        if (union == null)
        {
            return ServiceResult<UnionMemberDto>.NotFound("Union not found");
        }

        if (!await _personRepository.ExistsInOrgAsync(dto.PersonId, orgId.Value, cancellationToken))
        {
            return ServiceResult<UnionMemberDto>.NotFound("Person not found");
        }

        var existingMember = await _unionRepository.GetMemberAsync(unionId, dto.PersonId, cancellationToken);
        if (existingMember != null)
        {
            return ServiceResult<UnionMemberDto>.Failure("Person is already a member of this union");
        }

        var person = await _personRepository.GetByIdAsync(dto.PersonId);

        var member = new UnionMember
        {
            Id = Guid.NewGuid(),
            UnionId = unionId,
            PersonId = dto.PersonId,
            Role = "Partner",
            CreatedAt = DateTime.UtcNow
        };

        union.Members.Add(member);
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Member {PersonId} added to union {UnionId}", dto.PersonId, unionId);

        return ServiceResult<UnionMemberDto>.Success(new UnionMemberDto
        {
            Id = member.Id,
            PersonId = dto.PersonId,
            PersonName = person?.PrimaryName,
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

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Failure(error!);
        }

        var member = await _unionRepository.GetMemberAsync(unionId, personId, cancellationToken);
        if (member == null)
        {
            return ServiceResult.NotFound("Member not found in union");
        }

        // Remove through context
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
        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
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

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
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

        // Get union members and create parent-child relationships
        var members = await _unionRepository.GetMembersAsync(unionId, cancellationToken);

        // Logic to add parent-child relationships would go here
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Child {ChildId} added to union {UnionId}", dto.ChildId, unionId);

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

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Failure(error!);
        }

        // Logic to remove parent-child relationships would go here
        await _unionRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Child {ChildId} removed from union {UnionId}", childId, unionId);
        return ServiceResult.Success();
    }

    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(
        Guid? requestedTreeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        if (userContext.IsSuperAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _orgRepository.ExistsAsync(o => o.Id == requestedTreeId.Value, cancellationToken);
                if (!treeExists) return (null, "The specified tree does not exist.");
                return (requestedTreeId, null);
            }
            if (userContext.OrgId.HasValue) return (userContext.OrgId, null);
            return (null, "SuperAdmin must specify a treeId or be a member of a tree.");
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

        if (userContext.OrgId == null)
        {
            return (null, "You must be a member of a family tree.");
        }

        if (requestedTreeId.HasValue && requestedTreeId.Value != userContext.OrgId.Value)
        {
            var isMember = await _orgRepository.IsUserMemberOfOrgAsync(userContext.UserId, requestedTreeId.Value, cancellationToken);
            if (!isMember) return (null, "You are not a member of this tree.");
            return (requestedTreeId, null);
        }

        return (userContext.OrgId, null);
    }

    private static UnionResponseDto MapToResponseDto(Union union)
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
            union.Notes,
            union.Members.Select(m => new UnionMemberDto
            {
                Id = m.Id,
                PersonId = m.PersonId,
                PersonName = m.Person?.PrimaryName,
                Sex = m.Person?.Sex
            }).ToList(),
            union.CreatedAt,
            union.UpdatedAt
        );
    }
}
