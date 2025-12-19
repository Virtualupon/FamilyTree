// File: Services/PersonService.cs
using AutoMapper;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Person service implementation containing all business logic.
/// Uses repositories for data access and AutoMapper for DTO mapping.
/// Services do NOT reference DbContext directly.
/// </summary>
public class PersonService : IPersonService
{
    private readonly IPersonRepository _personRepository;
    private readonly IPersonNameRepository _personNameRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly IMapper _mapper;
    private readonly ILogger<PersonService> _logger;

    public PersonService(
        IPersonRepository personRepository,
        IPersonNameRepository personNameRepository,
        IOrgRepository orgRepository,
        IMapper mapper,
        ILogger<PersonService> logger)
    {
        _personRepository = personRepository;
        _personNameRepository = personNameRepository;
        _orgRepository = orgRepository;
        _mapper = mapper;
        _logger = logger;
    }

    // ============================================================================
    // PERSON OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<PagedResult<PersonListItemDto>>> GetPersonsAsync(
        PersonSearchDto search,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("GetPersons called: TreeId={TreeId}, Page={Page}, PageSize={PageSize}",
                search.TreeId, search.Page, search.PageSize);

            var (orgId, error) = await ResolveOrgIdAsync(search.TreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                _logger.LogWarning("ResolveOrgIdAsync returned null: {Error}", error);
                return ServiceResult<PagedResult<PersonListItemDto>>.Failure(error!);
            }

            _logger.LogInformation("Resolved OrgId: {OrgId}", orgId);

            var (items, totalCount) = await _personRepository.GetPagedAsync(orgId.Value, search, cancellationToken);

            var totalPages = (int)Math.Ceiling(totalCount / (double)search.PageSize);

            var result = new PagedResult<PersonListItemDto>(
                items,
                totalCount,
                search.Page,
                search.PageSize,
                totalPages
            );

            return ServiceResult<PagedResult<PersonListItemDto>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting persons for tree {TreeId}. Exception type: {ExceptionType}, Message: {Message}, StackTrace: {StackTrace}",
                search.TreeId, ex.GetType().Name, ex.Message, ex.StackTrace);
            return ServiceResult<PagedResult<PersonListItemDto>>.InternalError("Error loading people");
        }
    }

    public async Task<ServiceResult<PersonResponseDto>> GetPersonAsync(
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
                return ServiceResult<PersonResponseDto>.Failure(error!);
            }

            var person = await _personRepository.GetByIdWithDetailsAsync(id, orgId.Value, cancellationToken);

            if (person == null)
            {
                return ServiceResult<PersonResponseDto>.NotFound("Person not found");
            }

            var dto = _mapper.Map<PersonResponseDto>(person);
            return ServiceResult<PersonResponseDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting person {PersonId} for tree {TreeId}: {Message}", id, treeId, ex.Message);
            return ServiceResult<PersonResponseDto>.InternalError("Error loading person");
        }
    }

    public async Task<ServiceResult<PersonResponseDto>> CreatePersonAsync(
        CreatePersonDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<PersonResponseDto>.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(dto.TreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<PersonResponseDto>.Failure(error!);
        }

        var person = _mapper.Map<Person>(dto);
        person.OrgId = orgId.Value;
        person.CreatedAt = DateTime.UtcNow;
        person.UpdatedAt = DateTime.UtcNow;

        _personRepository.Add(person);
        await _personRepository.SaveChangesAsync(cancellationToken);

        // Handle names separately (not mapped due to complexity)
        if (dto.Names != null && dto.Names.Any())
        {
            foreach (var nameDto in dto.Names)
            {
                var personName = new PersonName
                {
                    PersonId = person.Id,
                    Script = nameDto.Script ?? "Latin",
                    Given = nameDto.Given,
                    Middle = nameDto.Middle,
                    Family = nameDto.Family,
                    Full = nameDto.Full,
                    Transliteration = nameDto.Transliteration,
                    Type = nameDto.Type,
                    CreatedAt = DateTime.UtcNow
                };
                _personNameRepository.Add(personName);
            }

            // Set primary name if not already set
            if (string.IsNullOrWhiteSpace(person.PrimaryName))
            {
                var primaryName = dto.Names.FirstOrDefault(n => n.Type == NameType.Primary);
                if (primaryName != null && !string.IsNullOrWhiteSpace(primaryName.Full))
                {
                    person.PrimaryName = primaryName.Full;
                }
            }

            await _personNameRepository.SaveChangesAsync(cancellationToken);
        }

        // Reload with includes for response
        var createdPerson = await _personRepository.GetByIdWithDetailsAsync(person.Id, orgId.Value, cancellationToken);

        _logger.LogInformation("Person created: {PersonId} in Org: {OrgId}", person.Id, orgId);

        var responseDto = _mapper.Map<PersonResponseDto>(createdPerson!);
        return ServiceResult<PersonResponseDto>.Success(responseDto);
    }

    public async Task<ServiceResult<PersonResponseDto>> UpdatePersonAsync(
        Guid id,
        UpdatePersonDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult<PersonResponseDto>.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<PersonResponseDto>.Failure(error!);
        }

        var person = await _personRepository.GetByIdWithDetailsAsync(id, orgId.Value, cancellationToken);

        if (person == null)
        {
            return ServiceResult<PersonResponseDto>.NotFound("Person not found");
        }

        // Apply partial updates (preserving existing behavior)
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

        await _personRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Person updated: {PersonId}", id);

        var responseDto = _mapper.Map<PersonResponseDto>(person);
        return ServiceResult<PersonResponseDto>.Success(responseDto);
    }

    public async Task<ServiceResult> DeletePersonAsync(
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

        var person = await _personRepository.FirstOrDefaultAsync(
            p => p.Id == id && p.OrgId == orgId, cancellationToken);

        if (person == null)
        {
            return ServiceResult.NotFound("Person not found");
        }

        // Check for cross-tree relationships
        if (await _personRepository.HasCrossOrgRelationshipsAsync(id, orgId.Value, cancellationToken))
        {
            _logger.LogWarning("Cannot delete person {PersonId}: has cross-org relationships", id);
            return ServiceResult.Failure("Cannot delete person with relationships to other organizations");
        }

        // Get related records for cascade delete
        var parentChildRecords = await _personRepository.GetParentChildRelationshipsAsync(id, cancellationToken);
        var unionMemberships = await _personRepository.GetUnionMembershipsAsync(id, orgId.Value, cancellationToken);
        var personTags = await _personRepository.GetPersonTagsAsync(id, orgId.Value, cancellationToken);

        // Remove related entities through repository
        await _personRepository.RemoveRelatedEntitiesAsync(parentChildRecords, unionMemberships, personTags, cancellationToken);

        _personRepository.Remove(person);
        await _personRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Person deleted: {PersonId} with {ParentChildCount} parent-child links, {UnionCount} union memberships, and {TagCount} tags",
            id, parentChildRecords.Count, unionMemberships.Count, personTags.Count);

        return ServiceResult.Success();
    }

    // ============================================================================
    // PERSON NAME OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<PersonNameDto>> AddPersonNameAsync(
        Guid personId,
        PersonNameDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<PersonNameDto>.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<PersonNameDto>.Failure(error!);
        }

        if (!await _personRepository.ExistsInOrgAsync(personId, orgId.Value, cancellationToken))
        {
            return ServiceResult<PersonNameDto>.NotFound("Person not found");
        }

        var personName = new PersonName
        {
            PersonId = personId,
            Script = dto.Script ?? "Latin",
            Given = dto.Given,
            Middle = dto.Middle,
            Family = dto.Family,
            Full = dto.Full,
            Transliteration = dto.Transliteration,
            Type = dto.Type,
            CreatedAt = DateTime.UtcNow
        };

        _personNameRepository.Add(personName);
        await _personNameRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Name added to person {PersonId}: {NameId}", personId, personName.Id);

        var responseDto = _mapper.Map<PersonNameDto>(personName);
        return ServiceResult<PersonNameDto>.Success(responseDto);
    }

    public async Task<ServiceResult<PersonNameDto>> UpdatePersonNameAsync(
        Guid personId,
        Guid nameId,
        PersonNameDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult<PersonNameDto>.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<PersonNameDto>.Failure(error!);
        }

        var personName = await _personNameRepository.GetByIdWithPersonAsync(nameId, personId, orgId.Value, cancellationToken);

        if (personName == null)
        {
            return ServiceResult<PersonNameDto>.NotFound("Person name not found");
        }

        // Update all fields (preserving original behavior)
        personName.Script = dto.Script ?? "Latin";
        personName.Given = dto.Given;
        personName.Middle = dto.Middle;
        personName.Family = dto.Family;
        personName.Full = dto.Full;
        personName.Transliteration = dto.Transliteration;
        personName.Type = dto.Type;

        await _personNameRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Name updated: {NameId} for person {PersonId}", nameId, personId);

        var responseDto = _mapper.Map<PersonNameDto>(personName);
        return ServiceResult<PersonNameDto>.Success(responseDto);
    }

    public async Task<ServiceResult> DeletePersonNameAsync(
        Guid personId,
        Guid nameId,
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

        var personName = await _personNameRepository.GetByIdWithPersonAsync(nameId, personId, orgId.Value, cancellationToken);

        if (personName == null)
        {
            return ServiceResult.NotFound("Person name not found");
        }

        _personNameRepository.Remove(personName);
        await _personNameRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Name deleted: {NameId} from person {PersonId}", nameId, personId);

        return ServiceResult.Success();
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Resolves the effective OrgId based on user role.
    /// Preserves exact behavior from original controller.
    /// </summary>
    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(
        Guid? requestedTreeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // SuperAdmin can access any tree
        if (userContext.IsSuperAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _orgRepository.ExistsAsync(o => o.Id == requestedTreeId.Value, cancellationToken);
                if (!treeExists)
                {
                    return (null, "The specified tree does not exist.");
                }
                return (requestedTreeId, null);
            }

            // SuperAdmin without specified tree - try token orgId
            if (userContext.OrgId.HasValue)
            {
                return (userContext.OrgId, null);
            }

            return (null, "SuperAdmin must specify a treeId or be a member of a tree.");
        }

        // Admin can access assigned trees
        if (userContext.IsAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                // Check if admin is assigned to this tree
                var isAssigned = await _orgRepository.IsAdminAssignedToTreeAsync(
                    userContext.UserId, requestedTreeId.Value, cancellationToken);

                if (isAssigned)
                {
                    return (requestedTreeId, null);
                }

                // Also check if admin is a member of the tree
                var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                    userContext.UserId, requestedTreeId.Value, cancellationToken);

                if (isMember)
                {
                    return (requestedTreeId, null);
                }

                return (null, "You are not assigned to this tree.");
            }

            // Admin without specified tree - try token orgId
            if (userContext.OrgId.HasValue)
            {
                return (userContext.OrgId, null);
            }

            // Check if admin has any assignments
            var hasAssignments = await _orgRepository.HasAdminAssignmentsAsync(userContext.UserId, cancellationToken);

            if (hasAssignments)
            {
                return (null, "Admin must specify a treeId to work on an assigned tree.");
            }

            return (null, "You must be assigned to a tree or be a member of one.");
        }

        // Regular user - must be a member
        if (userContext.OrgId == null)
        {
            return (null, "You must be a member of a family tree. Please create or join one first.");
        }

        // If a specific tree was requested, verify membership
        if (requestedTreeId.HasValue && requestedTreeId.Value != userContext.OrgId.Value)
        {
            var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                userContext.UserId, requestedTreeId.Value, cancellationToken);

            if (!isMember)
            {
                return (null, "You are not a member of this tree.");
            }

            return (requestedTreeId, null);
        }

        return (userContext.OrgId, null);
    }

}
