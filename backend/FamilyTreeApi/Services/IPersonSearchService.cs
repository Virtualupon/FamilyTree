// FamilyTreeApi/Services/Interfaces/IPersonSearchService.cs
#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using FamilyTreeApi.DTOs.Search;

namespace FamilyTreeApi.Services.Interfaces;

/// <summary>
/// Service for person search operations with authorization.
/// Uses Dapper + PostgreSQL functions for high-performance queries.
/// </summary>
public interface IPersonSearchService
{
    /// <summary>
    /// Search persons with full filtering and pagination.
    /// </summary>
    Task<ServiceResult<PersonSearchResult>> SearchPersonsAsync(
        PersonSearchRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Quick search with auto-detected language/script.
    /// </summary>
    Task<ServiceResult<PersonSearchResult>> QuickSearchAsync(
        string query,
        UserContext userContext,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Find relationship path between two persons.
    /// </summary>
    Task<ServiceResult<RelationshipPathResult>> FindRelationshipPathAsync(
        RelationshipPathRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get family tree data for visualization.
    /// </summary>
    Task<ServiceResult<FamilyTreeDataResult>> GetFamilyTreeDataAsync(
        FamilyTreeDataRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get complete person details with all related data.
    /// </summary>
    Task<ServiceResult<PersonDetailsResult>> GetPersonDetailsAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search within a specific family.
    /// </summary>
    Task<ServiceResult<PersonSearchResult>> SearchByFamilyAsync(
        Guid familyId,
        string? query,
        UserContext userContext,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search within a specific town.
    /// </summary>
    Task<ServiceResult<PersonSearchResult>> SearchByTownAsync(
        Guid townId,
        string? query,
        UserContext userContext,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);
}