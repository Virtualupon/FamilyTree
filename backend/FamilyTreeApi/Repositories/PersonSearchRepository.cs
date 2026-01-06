// FamilyTreeApi/Repositories/Implementations/PersonSearchRepository.cs
#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.Search;
using FamilyTreeApi.Repositories.Interfaces;

namespace FamilyTreeApi.Repositories.Implementations;

/// <summary>
/// Repository implementation using Dapper for optimized person search operations.
/// Uses PostgreSQL functions for complex queries with full-text search and JSONB aggregation.
/// </summary>
public sealed class PersonSearchRepository : IPersonSearchRepository
{
    private readonly string _connectionString;
    private readonly ILogger<PersonSearchRepository> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public PersonSearchRepository(
        ApplicationDbContext context,
        ILogger<PersonSearchRepository> logger)
    {
        _connectionString = context.Database.GetConnectionString()
            ?? throw new InvalidOperationException("Database connection string not found");
        _logger = logger;
    }

    // ========================================================================
    // SEARCH METHODS
    // ========================================================================

    public async Task<PersonSearchResult> SearchPersonsAsync(
        PersonSearchRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT 
                total_count,
                page,
                page_size,
                person_id,
                primary_name,
                sex,
                birth_date,
                birth_precision,
                death_date,
                death_precision,
                birth_place_name,
                death_place_name,
                is_living,
                family_id,
                family_name,
                org_id,
                names,
                parents_count,
                children_count,
                spouses_count,
                media_count
            FROM search_persons_unified(
                @Query,
                @SearchIn,
                @TreeId,
                @TownId,
                @FamilyId,
                @Sex,
                @IsLiving,
                @BirthYearFrom,
                @BirthYearTo,
                @Page,
                @PageSize
            )";

        try
        {
            var rows = await connection.QueryAsync<dynamic>(
                new CommandDefinition(
                    sql,
                    new
                    {
                        Query = string.IsNullOrWhiteSpace(request.Query) ? null : request.Query.Trim(),
                        SearchIn = request.SearchIn ?? "auto",
                        TreeId = request.TreeId,
                        TownId = request.TownId,
                        FamilyId = request.FamilyId,
                        Sex = request.Sex,
                        IsLiving = request.IsLiving,
                        BirthYearFrom = request.BirthYearFrom,
                        BirthYearTo = request.BirthYearTo,
                        Page = Math.Max(1, request.Page),
                        PageSize = Math.Clamp(request.PageSize, 1, 100)
                    },
                    cancellationToken: cancellationToken
                ));

            var rowList = rows.ToList();

            if (!rowList.Any())
            {
                return new PersonSearchResult
                {
                    Total = 0,
                    Page = request.Page,
                    PageSize = request.PageSize,
                    Items = new List<PersonSearchItemDto>()
                };
            }

            var firstRow = rowList.First();
            var items = rowList.Select(MapToPersonSearchItem).ToList();

            return new PersonSearchResult
            {
                Total = (int)firstRow.total_count,
                Page = (int)firstRow.page,
                PageSize = (int)firstRow.page_size,
                Items = items
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching persons with query: {Query}", request.Query);
            throw;
        }
    }

    public async Task<PersonSearchResult> QuickSearchAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return await SearchPersonsAsync(new PersonSearchRequest
        {
            Query = query,
            SearchIn = "auto",
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);
    }

    public async Task<PersonSearchResult> SearchByArabicNameAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return await SearchPersonsAsync(new PersonSearchRequest
        {
            Query = query,
            SearchIn = "arabic",
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);
    }

    public async Task<PersonSearchResult> SearchByLatinNameAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return await SearchPersonsAsync(new PersonSearchRequest
        {
            Query = query,
            SearchIn = "latin",
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);
    }

    public async Task<PersonSearchResult> SearchByNobiinNameAsync(
        string query,
        Guid? treeId = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return await SearchPersonsAsync(new PersonSearchRequest
        {
            Query = query,
            SearchIn = "coptic",  // Nobiin uses Coptic script
            TreeId = treeId,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);
    }

    public async Task<PersonSearchResult> SearchByFamilyAsync(
        Guid familyId,
        string? query = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return await SearchPersonsAsync(new PersonSearchRequest
        {
            Query = query,
            SearchIn = "auto",
            FamilyId = familyId,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);
    }

    public async Task<PersonSearchResult> SearchByTownAsync(
        Guid townId,
        string? query = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        return await SearchPersonsAsync(new PersonSearchRequest
        {
            Query = query,
            SearchIn = "auto",
            TownId = townId,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);
    }

    // ========================================================================
    // RELATIONSHIP PATH
    // ========================================================================

    public async Task<RelationshipPathResult?> FindRelationshipPathAsync(
        RelationshipPathRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT 
                path_found,
                path_length,
                path_nodes,
                path_relationships,
                relationship_summary
            FROM find_relationship_path(
                @Person1Id,
                @Person2Id,
                @TreeId,
                @MaxDepth
            )";

        try
        {
            var result = await connection.QueryFirstOrDefaultAsync<dynamic>(
                new CommandDefinition(
                    sql,
                    new
                    {
                        Person1Id = request.Person1Id,
                        Person2Id = request.Person2Id,
                        TreeId = request.TreeId,
                        MaxDepth = Math.Clamp(request.MaxDepth, 1, 20)
                    },
                    cancellationToken: cancellationToken
                ));

            if (result == null)
            {
                return new RelationshipPathResult
                {
                    PathFound = false,
                    RelationshipSummary = "No path found"
                };
            }

            bool pathFound = (bool)result.path_found;

            if (!pathFound)
            {
                return new RelationshipPathResult
                {
                    PathFound = false,
                    RelationshipSummary = "No relationship found within search depth"
                };
            }

            var pathNodes = DeserializeJsonb<List<PathNodeDto>>(result.path_nodes?.ToString())
                ?? new List<PathNodeDto>();
            var pathRelationships = DeserializeJsonb<List<PathRelationshipDto>>(result.path_relationships?.ToString())
                ?? new List<PathRelationshipDto>();

            return new RelationshipPathResult
            {
                PathFound = true,
                PathLength = (int?)result.path_length,
                PathNodes = pathNodes,
                PathRelationships = pathRelationships,
                RelationshipSummary = (string?)result.relationship_summary,
                HumanReadableRelationship = BuildHumanReadableRelationship(pathRelationships)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding relationship path between {Person1} and {Person2}",
                request.Person1Id, request.Person2Id);
            throw;
        }
    }

    // ========================================================================
    // FAMILY TREE DATA
    // ========================================================================

    public async Task<FamilyTreeDataResult> GetFamilyTreeDataAsync(
        FamilyTreeDataRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT 
                person_id,
                primary_name,
                sex,
                birth_date,
                death_date,
                birth_place,
                death_place,
                is_living,
                generation_level,
                relationship_type,
                parent_id,
                spouse_union_id,
                names
            FROM get_family_tree_data(
                @RootPersonId,
                @ViewMode,
                @Generations,
                @IncludeSpouses
            )";

        try
        {
            var rows = await connection.QueryAsync<dynamic>(
                new CommandDefinition(
                    sql,
                    new
                    {
                        RootPersonId = request.RootPersonId,
                        ViewMode = request.ViewMode ?? "pedigree",
                        Generations = Math.Clamp(request.Generations, 1, 10),
                        IncludeSpouses = request.IncludeSpouses
                    },
                    cancellationToken: cancellationToken
                ));

            var persons = rows.Select(MapToTreePerson).ToList();

            return new FamilyTreeDataResult
            {
                RootPersonId = request.RootPersonId,
                ViewMode = request.ViewMode ?? "pedigree",
                TotalPersons = persons.Count,
                Persons = persons
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family tree data for root person {RootPersonId}",
                request.RootPersonId);
            throw;
        }
    }

    // ========================================================================
    // PERSON DETAILS
    // ========================================================================

    public async Task<PersonDetailsResult?> GetPersonDetailsAsync(
        Guid personId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT 
                person_id,
                primary_name,
                sex,
                birth_date,
                birth_precision,
                death_date,
                death_precision,
                birth_place_id,
                birth_place_name,
                death_place_id,
                death_place_name,
                is_living,
                biography,
                family_id,
                family_name,
                org_id,
                created_at,
                updated_at,
                names,
                parents,
                children,
                spouses,
                siblings
            FROM get_person_details(@PersonId)";

        try
        {
            var result = await connection.QueryFirstOrDefaultAsync<dynamic>(
                new CommandDefinition(
                    sql,
                    new { PersonId = personId },
                    cancellationToken: cancellationToken
                ));

            if (result == null)
            {
                return null;
            }

            return MapToPersonDetails(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting person details for {PersonId}", personId);
            throw;
        }
    }

    // ========================================================================
    // MAPPING HELPERS
    // ========================================================================

    private PersonSearchItemDto MapToPersonSearchItem(dynamic row)
    {
        // Try to get direct name columns (new schema)
        // Fall back to extracting from names JSONB (legacy)
        string? nameArabic = null;
        string? nameEnglish = null;
        string? nameNobiin = null;

        // Check if new columns exist in the result
        var rowDict = (IDictionary<string, object>)row;
        if (rowDict.ContainsKey("name_arabic"))
            nameArabic = rowDict["name_arabic"] as string;
        if (rowDict.ContainsKey("name_english"))
            nameEnglish = rowDict["name_english"] as string;
        if (rowDict.ContainsKey("name_nobiin"))
            nameNobiin = rowDict["name_nobiin"] as string;

        // Parse legacy names JSONB for backward compatibility
        string? namesJson = row.names?.ToString();
        List<PersonNameSearchDto> legacyNames = DeserializeJsonb<List<PersonNameSearchDto>>(namesJson) ?? new List<PersonNameSearchDto>();

        // If direct columns are null, try to extract from legacy names
        if (string.IsNullOrEmpty(nameArabic))
            nameArabic = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() == "arabic")?.FullName;
        if (string.IsNullOrEmpty(nameEnglish))
            nameEnglish = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() is "latin" or "english")?.FullName;
        if (string.IsNullOrEmpty(nameNobiin))
            nameNobiin = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() is "coptic" or "nobiin")?.FullName;

        return new PersonSearchItemDto
        {
            Id = (Guid)row.person_id,
            PrimaryName = (string?)row.primary_name,
            NameArabic = nameArabic,
            NameEnglish = nameEnglish,
            NameNobiin = nameNobiin,
            Sex = (int)row.sex,
            BirthDate = (DateTime?)row.birth_date,
            BirthPrecision = (int?)row.birth_precision,
            DeathDate = (DateTime?)row.death_date,
            DeathPrecision = (int?)row.death_precision,
            BirthPlaceName = (string?)row.birth_place_name,
            DeathPlaceName = (string?)row.death_place_name,
            IsLiving = (bool)row.is_living,
            FamilyId = (Guid?)row.family_id,
            FamilyName = (string?)row.family_name,
            OrgId = (Guid)row.org_id,
#pragma warning disable CS0618 // Obsolete warning - keeping for backward compatibility
            Names = legacyNames,
#pragma warning restore CS0618
            ParentsCount = (int)row.parents_count,
            ChildrenCount = (int)row.children_count,
            SpousesCount = (int)row.spouses_count,
            MediaCount = (int)row.media_count
        };
    }

    private TreePersonDto MapToTreePerson(dynamic row)
    {
        // Try to get direct name columns (new schema)
        string? nameArabic = null;
        string? nameEnglish = null;
        string? nameNobiin = null;

        var rowDict = (IDictionary<string, object>)row;
        if (rowDict.ContainsKey("name_arabic"))
            nameArabic = rowDict["name_arabic"] as string;
        if (rowDict.ContainsKey("name_english"))
            nameEnglish = rowDict["name_english"] as string;
        if (rowDict.ContainsKey("name_nobiin"))
            nameNobiin = rowDict["name_nobiin"] as string;

        string? namesJson = row.names?.ToString();
        List<PersonNameSearchDto> legacyNames = DeserializeJsonb<List<PersonNameSearchDto>>(namesJson) ?? new List<PersonNameSearchDto>();

        // Fall back to extracting from legacy names
        if (string.IsNullOrEmpty(nameArabic))
            nameArabic = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() == "arabic")?.FullName;
        if (string.IsNullOrEmpty(nameEnglish))
            nameEnglish = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() is "latin" or "english")?.FullName;
        if (string.IsNullOrEmpty(nameNobiin))
            nameNobiin = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() is "coptic" or "nobiin")?.FullName;

        return new TreePersonDto
        {
            Id = (Guid)row.person_id,
            PrimaryName = (string?)row.primary_name,
            NameArabic = nameArabic,
            NameEnglish = nameEnglish,
            NameNobiin = nameNobiin,
            Sex = (int)row.sex,
            BirthDate = (DateTime?)row.birth_date,
            DeathDate = (DateTime?)row.death_date,
            BirthPlace = (string?)row.birth_place,
            DeathPlace = (string?)row.death_place,
            IsLiving = (bool)row.is_living,
            GenerationLevel = (int)row.generation_level,
            RelationshipType = (string?)row.relationship_type,
            ParentId = (Guid?)row.parent_id,
            SpouseUnionId = (Guid?)row.spouse_union_id,
#pragma warning disable CS0618
            Names = legacyNames
#pragma warning restore CS0618
        };
    }

    private PersonDetailsResult MapToPersonDetails(dynamic row)
    {
        // Try to get direct name columns (new schema)
        string? nameArabic = null;
        string? nameEnglish = null;
        string? nameNobiin = null;

        var rowDict = (IDictionary<string, object>)row;
        if (rowDict.ContainsKey("name_arabic"))
            nameArabic = rowDict["name_arabic"] as string;
        if (rowDict.ContainsKey("name_english"))
            nameEnglish = rowDict["name_english"] as string;
        if (rowDict.ContainsKey("name_nobiin"))
            nameNobiin = rowDict["name_nobiin"] as string;

        string? namesJson = row.names?.ToString();
        List<PersonNameSearchDto> legacyNames = DeserializeJsonb<List<PersonNameSearchDto>>(namesJson) ?? new List<PersonNameSearchDto>();

        // Fall back to extracting from legacy names
        if (string.IsNullOrEmpty(nameArabic))
            nameArabic = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() == "arabic")?.FullName;
        if (string.IsNullOrEmpty(nameEnglish))
            nameEnglish = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() is "latin" or "english")?.FullName;
        if (string.IsNullOrEmpty(nameNobiin))
            nameNobiin = legacyNames.FirstOrDefault(n => n.Script?.ToLowerInvariant() is "coptic" or "nobiin")?.FullName;

        return new PersonDetailsResult
        {
            Id = (Guid)row.person_id,
            PrimaryName = (string?)row.primary_name,
            NameArabic = nameArabic,
            NameEnglish = nameEnglish,
            NameNobiin = nameNobiin,
            Sex = (int)row.sex,
            BirthDate = (DateTime?)row.birth_date,
            BirthPrecision = (int?)row.birth_precision,
            DeathDate = (DateTime?)row.death_date,
            DeathPrecision = (int?)row.death_precision,
            BirthPlaceId = (Guid?)row.birth_place_id,
            BirthPlaceName = (string?)row.birth_place_name,
            DeathPlaceId = (Guid?)row.death_place_id,
            DeathPlaceName = (string?)row.death_place_name,
            IsLiving = (bool)row.is_living,
            Notes = (string?)row.notes,
            FamilyId = (Guid?)row.family_id,
            FamilyName = (string?)row.family_name,
            OrgId = (Guid)row.org_id,
            CreatedAt = (DateTime)row.created_at,
            UpdatedAt = (DateTime?)row.updated_at,
#pragma warning disable CS0618
            Names = legacyNames,
#pragma warning restore CS0618
            Parents = DeserializeJsonb<List<RelatedPersonDto>>(row.parents?.ToString()) ?? new List<RelatedPersonDto>(),
            Children = DeserializeJsonb<List<RelatedPersonDto>>(row.children?.ToString()) ?? new List<RelatedPersonDto>(),
            Spouses = DeserializeJsonb<List<SpouseDto>>(row.spouses?.ToString()) ?? new List<SpouseDto>(),
            Siblings = DeserializeJsonb<List<RelatedPersonDto>>(row.siblings?.ToString()) ?? new List<RelatedPersonDto>()
        };
    }

    // ========================================================================
    // JSON HELPERS
    // ========================================================================

    private static T? DeserializeJsonb<T>(string? jsonb)
    {
        if (string.IsNullOrWhiteSpace(jsonb)) return default;

        try
        {
            return JsonSerializer.Deserialize<T>(jsonb, JsonOptions);
        }
        catch (JsonException ex)
        {
            Console.WriteLine($"Error deserializing JSONB: {ex.Message}");
            Console.WriteLine($"JSONB content: {jsonb}");
            return default;
        }
    }

    // ========================================================================
    // RELATIONSHIP DESCRIPTION HELPERS
    // ========================================================================

    private static string BuildHumanReadableRelationship(List<PathRelationshipDto> relationships)
    {
        if (relationships == null || !relationships.Any())
            return "Same person";

        // Build relationship description from path
        // This is a simplified version - expand for full relationship names
        var types = relationships.Select(r => r.Type).ToList();

        // Common patterns
        if (types.SequenceEqual(new[] { "parent" }))
            return "Parent";
        if (types.SequenceEqual(new[] { "child" }))
            return "Child";
        if (types.SequenceEqual(new[] { "spouse" }))
            return "Spouse";
        if (types.SequenceEqual(new[] { "parent", "parent" }))
            return "Grandparent";
        if (types.SequenceEqual(new[] { "child", "child" }))
            return "Grandchild";
        if (types.SequenceEqual(new[] { "parent", "child" }))
            return "Sibling";
        if (types.SequenceEqual(new[] { "parent", "parent", "child" }))
            return "Uncle/Aunt";
        if (types.SequenceEqual(new[] { "parent", "child", "child" }))
            return "Niece/Nephew";
        if (types.SequenceEqual(new[] { "parent", "parent", "child", "child" }))
            return "Cousin";

        // Generic description
        var parentCount = types.Count(t => t == "parent");
        var childCount = types.Count(t => t == "child");
        var spouseCount = types.Count(t => t == "spouse");

        var parts = new List<string>();
        if (parentCount > 0) parts.Add($"{parentCount} generation(s) up");
        if (childCount > 0) parts.Add($"{childCount} generation(s) down");
        if (spouseCount > 0) parts.Add($"{spouseCount} spouse connection(s)");

        return string.Join(", ", parts);
    }
}