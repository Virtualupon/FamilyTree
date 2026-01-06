// FamilyTreeApi/Repositories/Interfaces/IPersonSearchRepository.cs
#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using FamilyTreeApi.DTOs.Search;

namespace FamilyTreeApi.Repositories.Interfaces;

/// <summary>
/// Repository for optimized person search operations using Dapper and PostgreSQL functions.
/// Use this for complex searches; use IPersonRepository for standard CRUD.
/// </summary>
public interface IPersonSearchRepository
{
    /// <summary>
    /// Search persons with full pagination, multilingual support, and filters.
    /// Uses PostgreSQL search_persons_unified function.
    /// </summary>
    Task<PersonSearchResult> SearchPersonsAsync(
        PersonSearchRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Quick search by query text only (auto-detects language/script).
    /// </summary>
    Task<PersonSearchResult> QuickSearchAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search specifically in Arabic script names.
    /// </summary>
    Task<PersonSearchResult> SearchByArabicNameAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search specifically in Latin script names.
    /// </summary>
    Task<PersonSearchResult> SearchByLatinNameAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search specifically in Coptic/Nobiin script names.
    /// </summary>
    Task<PersonSearchResult> SearchByNobiinNameAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Find relationship path between two persons.
    /// Uses PostgreSQL find_relationship_path function with BFS algorithm.
    /// </summary>
    Task<RelationshipPathResult?> FindRelationshipPathAsync(
        RelationshipPathRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get family tree data for visualization.
    /// Supports pedigree, descendants, and hourglass views.
    /// </summary>
    Task<FamilyTreeDataResult> GetFamilyTreeDataAsync(
        FamilyTreeDataRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get complete person details with all related data in a single query.
    /// </summary>
    Task<PersonDetailsResult?> GetPersonDetailsAsync(
        Guid personId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search persons within a specific family.
    /// </summary>
    Task<PersonSearchResult> SearchByFamilyAsync(
        Guid familyId,
        string? query = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Search persons within a specific town.
    /// </summary>
    Task<PersonSearchResult> SearchByTownAsync(
        Guid townId,
        string? query = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);
}