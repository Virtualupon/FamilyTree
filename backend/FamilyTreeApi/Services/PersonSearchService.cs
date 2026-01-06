// FamilyTreeApi/Services/Implementations/PersonSearchService.cs
#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs.Search;
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
    private readonly ILogger<PersonSearchService> _logger;

    public PersonSearchService(
        IPersonSearchRepository searchRepository,
        ILogger<PersonSearchService> logger)
    {
        _searchRepository = searchRepository;
        _logger = logger;
    }

    public async Task<ServiceResult<PersonSearchResult>> SearchPersonsAsync(
        PersonSearchRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Apply tree filter based on user context if not explicitly provided
            var effectiveRequest = request with
            {
                TreeId = request.TreeId ?? GetUserTreeId(userContext),
                PageSize = Math.Clamp(request.PageSize, 1, 100)
            };

            // Validate tree access if TreeId is specified
            if (effectiveRequest.TreeId.HasValue &&
                !HasTreeAccess(userContext, effectiveRequest.TreeId.Value))
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
                !HasTreeAccess(userContext, effectiveRequest.TreeId.Value))
            {
                return ServiceResult<RelationshipPathResult>.Forbidden("Access denied to this family tree");
            }

            var result = await _searchRepository.FindRelationshipPathAsync(effectiveRequest, cancellationToken);

            if (result == null)
            {
                return ServiceResult<RelationshipPathResult>.Success(new RelationshipPathResult
                {
                    PathFound = false,
                    RelationshipSummary = "Unable to find relationship"
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
            if (!HasTreeAccess(userContext, result.OrgId))
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

    private static bool HasTreeAccess(UserContext userContext, Guid treeId)
    {
        // SuperAdmins and Admins have access to all trees
        if (userContext.IsSuperAdmin || userContext.IsAdmin)
        {
            return true;
        }

        // Regular users only have access to their assigned tree
        return userContext.OrgId == treeId;
    }
}