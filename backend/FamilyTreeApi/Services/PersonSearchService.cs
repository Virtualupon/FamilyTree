// FamilyTreeApi/Services/Implementations/PersonSearchService.cs
#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs.Search;
using FamilyTreeApi.Repositories;
using FamilyTreeApi.Repositories.Interfaces;
using FamilyTreeApi.Services.Interfaces;

namespace FamilyTreeApi.Services.Implementations;

/// <summary>
/// Service implementation for person search with authorization.
/// Uses Dapper + PostgreSQL functions for high-performance queries.
/// </summary>
public class PersonSearchService : IPersonSearchService
{
    private readonly IPersonSearchRepository _searchRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly ILogger<PersonSearchService> _logger;

    public PersonSearchService(
        IPersonSearchRepository searchRepository,
        IOrgRepository orgRepository,
        ILogger<PersonSearchService> logger)
    {
        _searchRepository = searchRepository;
        _orgRepository = orgRepository;
        _logger = logger;
    }

    public async Task<ServiceResult<PersonSearchResult>> SearchPersonsAsync(
        PersonSearchRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Apply tree and town filters based on user context if not explicitly provided
            var effectiveRequest = request with
            {
                TreeId = request.TreeId ?? GetUserTreeId(userContext),
                TownId = request.TownId ?? GetUserTownId(userContext),
                PageSize = Math.Clamp(request.PageSize, 1, 100)
            };

            // Validate tree access if TreeId is specified
            if (effectiveRequest.TreeId.HasValue &&
                !await HasTreeAccessAsync(userContext, effectiveRequest.TreeId.Value, cancellationToken))
            {
                return ServiceResult<PersonSearchResult>.Forbidden("Access denied to this family tree");
            }

            var result = await _searchRepository.SearchPersonsAsync(effectiveRequest, cancellationToken);
            return ServiceResult<PersonSearchResult>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in SearchPersonsAsync for user {UserId}", userContext.UserId);
            return ServiceResult<PersonSearchResult>.InternalError("Search failed. Please try again.");
        }
    }

    public async Task<ServiceResult<PersonSearchResult>> QuickSearchAsync(
        string query,
        UserContext userContext,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return ServiceResult<PersonSearchResult>.Failure("Search query is required");
        }

        var request = new PersonSearchRequest
        {
            Query = query.Trim(),
            SearchIn = "auto",
            TreeId = GetUserTreeId(userContext),
            TownId = GetUserTownId(userContext),
            Page = page,
            PageSize = pageSize
        };

        return await SearchPersonsAsync(request, userContext, cancellationToken);
    }

    public async Task<ServiceResult<RelationshipPathResult>> FindRelationshipPathAsync(
        RelationshipPathRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var effectiveRequest = request with
            {
                TreeId = request.TreeId ?? GetUserTreeId(userContext),
                MaxDepth = Math.Clamp(request.MaxDepth, 1, 20)
            };

            if (effectiveRequest.TreeId.HasValue &&
                !await HasTreeAccessAsync(userContext, effectiveRequest.TreeId.Value, cancellationToken))
            {
                return ServiceResult<RelationshipPathResult>.Forbidden("Access denied to this family tree");
            }

            var result = await _searchRepository.FindRelationshipPathAsync(effectiveRequest, cancellationToken);

            if (result == null)
            {
                return ServiceResult<RelationshipPathResult>.Success(new RelationshipPathResult
                {
                    PathFound = false,
                    RelationshipType = "none",
                    RelationshipLabel = "Unable to find relationship"
                });
            }

            return ServiceResult<RelationshipPathResult>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding relationship path between {Person1} and {Person2}",
                request.Person1Id, request.Person2Id);
            return ServiceResult<RelationshipPathResult>.InternalError("Failed to find relationship path");
        }
    }

    public async Task<ServiceResult<FamilyTreeDataResult>> GetFamilyTreeDataAsync(
        FamilyTreeDataRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var effectiveRequest = request with
            {
                Generations = Math.Clamp(request.Generations, 1, 10)
            };

            var result = await _searchRepository.GetFamilyTreeDataAsync(effectiveRequest, cancellationToken);
            return ServiceResult<FamilyTreeDataResult>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family tree data for {RootPersonId}", request.RootPersonId);
            return ServiceResult<FamilyTreeDataResult>.InternalError("Failed to load family tree data");
        }
    }

    public async Task<ServiceResult<PersonDetailsResult>> GetPersonDetailsAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await _searchRepository.GetPersonDetailsAsync(personId, cancellationToken);

            if (result == null)
            {
                return ServiceResult<PersonDetailsResult>.NotFound("Person not found");
            }

            // Check tree access
            if (!await HasTreeAccessAsync(userContext, result.OrgId, cancellationToken))
            {
                return ServiceResult<PersonDetailsResult>.Forbidden("Access denied to this person");
            }

            return ServiceResult<PersonDetailsResult>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting person details for {PersonId}", personId);
            return ServiceResult<PersonDetailsResult>.InternalError("Failed to load person details");
        }
    }

    public async Task<ServiceResult<PersonSearchResult>> SearchByFamilyAsync(
        Guid familyId,
        string? query,
        UserContext userContext,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await _searchRepository.SearchByFamilyAsync(
                familyId, query, page, pageSize, cancellationToken);
            return ServiceResult<PersonSearchResult>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching by family {FamilyId}", familyId);
            return ServiceResult<PersonSearchResult>.InternalError("Search failed");
        }
    }

    public async Task<ServiceResult<PersonSearchResult>> SearchByTownAsync(
        Guid townId,
        string? query,
        UserContext userContext,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await _searchRepository.SearchByTownAsync(
                townId, query, page, pageSize, cancellationToken);
            return ServiceResult<PersonSearchResult>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching by town {TownId}", townId);
            return ServiceResult<PersonSearchResult>.InternalError("Search failed");
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private static Guid? GetUserTreeId(UserContext userContext)
    {
        // Admins/SuperAdmins can search all trees
        if (userContext.IsSuperAdmin || userContext.IsAdmin)
        {
            return null;
        }

        // Regular users restricted to their assigned tree
        return userContext.OrgId;
    }

    /// <summary>
    /// Get the effective town ID for filtering searches.
    /// Users should only see people from trees in their selected town.
    /// </summary>
    private static Guid? GetUserTownId(UserContext userContext)
    {
        // SuperAdmins can see all data across all towns
        if (userContext.IsSuperAdmin)
        {
            return null;
        }

        // Admin and User roles should be scoped to their selected town
        // This is the key security filter - ensures data isolation by town
        return userContext.SelectedTownId;
    }

    private async Task<bool> HasTreeAccessAsync(UserContext userContext, Guid treeId, CancellationToken cancellationToken = default)
    {
        // SuperAdmins and Admins have access to all trees
        if (userContext.IsSuperAdmin || userContext.IsAdmin)
        {
            return true;
        }

        // Regular users have access to their assigned tree (membership)
        if (userContext.OrgId == treeId)
        {
            return true;
        }

        // Regular users can also access trees in their selected town (browse mode)
        if (userContext.SelectedTownId.HasValue)
        {
            var tree = await _orgRepository.GetByIdAsync(treeId, cancellationToken);
            if (tree != null && tree.TownId == userContext.SelectedTownId.Value)
            {
                _logger.LogInformation(
                    "User {UserId} granted read access to tree {TreeId} via town selection {TownId}",
                    userContext.UserId, treeId, userContext.SelectedTownId.Value);
                return true;
            }
        }

        return false;
    }
}