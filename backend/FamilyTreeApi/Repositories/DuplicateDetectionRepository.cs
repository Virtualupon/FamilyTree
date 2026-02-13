#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Extensions.Logging;
using Npgsql;
using FamilyTreeApi.DTOs.DuplicateDetection;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository implementation using Dapper for duplicate detection operations.
/// Uses PostgreSQL functions for optimized duplicate candidate detection.
/// </summary>
public sealed class DuplicateDetectionRepository : IDuplicateDetectionRepository
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<DuplicateDetectionRepository> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public DuplicateDetectionRepository(
        NpgsqlDataSource dataSource,
        ILogger<DuplicateDetectionRepository> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task<DuplicateScanResult> DetectCandidatesAsync(
        Guid? orgId,
        Guid? targetOrgId,
        string mode,
        int minConfidence,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        // Input clamping
        minConfidence = Math.Clamp(minConfidence, 0, 100);
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        await using var connection = _dataSource.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT
                total_count,
                page,
                page_size,
                person_a_id,
                person_a_name,
                person_a_name_arabic,
                person_a_name_english,
                person_a_sex,
                person_a_birth_date,
                person_a_death_date,
                person_a_org_id,
                person_a_org_name,
                person_b_id,
                person_b_name,
                person_b_name_arabic,
                person_b_name_english,
                person_b_sex,
                person_b_birth_date,
                person_b_death_date,
                person_b_org_id,
                person_b_org_name,
                match_type,
                confidence,
                similarity_score,
                given_name_a,
                surname_a,
                given_name_b,
                surname_b,
                shared_parent_count,
                evidence
            FROM detect_duplicate_candidates(
                @OrgId,
                @TargetOrgId,
                @Mode,
                @MinConfidence,
                @Page,
                @PageSize
            )";

        var parameters = new
        {
            OrgId = orgId,
            TargetOrgId = targetOrgId,
            Mode = mode,
            MinConfidence = minConfidence,
            Page = page,
            PageSize = pageSize
        };

        try
        {
            var command = new CommandDefinition(sql, parameters, cancellationToken: cancellationToken);
            var rows = await connection.QueryAsync<dynamic>(command);
            var rowList = rows.ToList();

            if (rowList.Count == 0)
            {
                return new DuplicateScanResult
                {
                    Total = 0,
                    Page = page,
                    PageSize = pageSize,
                    Items = new List<DuplicateCandidateDto>()
                };
            }

            var firstRow = rowList[0];
            var total = (long)(firstRow.total_count ?? 0);

            var items = rowList.Select(row => new DuplicateCandidateDto
            {
                PersonAId = row.person_a_id,
                PersonAName = row.person_a_name,
                PersonANameArabic = row.person_a_name_arabic,
                PersonANameEnglish = row.person_a_name_english,
                PersonASex = (int)(row.person_a_sex ?? 2),
                PersonABirthDate = row.person_a_birth_date,
                PersonADeathDate = row.person_a_death_date,
                PersonAOrgId = row.person_a_org_id,
                PersonAOrgName = row.person_a_org_name,
                PersonBId = row.person_b_id,
                PersonBName = row.person_b_name,
                PersonBNameArabic = row.person_b_name_arabic,
                PersonBNameEnglish = row.person_b_name_english,
                PersonBSex = (int)(row.person_b_sex ?? 2),
                PersonBBirthDate = row.person_b_birth_date,
                PersonBDeathDate = row.person_b_death_date,
                PersonBOrgId = row.person_b_org_id,
                PersonBOrgName = row.person_b_org_name,
                MatchType = row.match_type ?? "unknown",
                Confidence = (int)(row.confidence ?? 0),
                SimilarityScore = (float)(row.similarity_score ?? 0.0),
                GivenNameA = row.given_name_a,
                SurnameA = row.surname_a,
                GivenNameB = row.given_name_b,
                SurnameB = row.surname_b,
                SharedParentCount = (int)(row.shared_parent_count ?? 0),
                Evidence = ParseEvidence(row.evidence)
            }).ToList();

            return new DuplicateScanResult
            {
                Total = total,
                Page = page,
                PageSize = pageSize,
                Items = items
            };
        }
        catch (PostgresException ex) when (ex.SqlState == "P0001") // RAISE EXCEPTION
        {
            _logger.LogWarning(ex, "Duplicate detection function raised an exception");
            throw new InvalidOperationException(ex.MessageText, ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error detecting duplicate candidates");
            throw;
        }
    }

    public async Task<List<DuplicateSummaryItem>> GetSummaryAsync(
        Guid? orgId,
        Guid? targetOrgId,
        string mode,
        int minConfidence,
        CancellationToken cancellationToken = default)
    {
        // Input clamping
        minConfidence = Math.Clamp(minConfidence, 0, 100);

        await using var connection = _dataSource.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT
                match_type,
                candidate_count,
                avg_confidence,
                min_confidence,
                max_confidence
            FROM duplicate_candidates_summary(
                @OrgId,
                @TargetOrgId,
                @Mode,
                @MinConfidence
            )";

        var parameters = new
        {
            OrgId = orgId,
            TargetOrgId = targetOrgId,
            Mode = mode,
            MinConfidence = minConfidence
        };

        try
        {
            var command = new CommandDefinition(sql, parameters, cancellationToken: cancellationToken);
            var rows = await connection.QueryAsync<dynamic>(command);

            return rows.Select(row => new DuplicateSummaryItem
            {
                MatchType = row.match_type ?? "unknown",
                CandidateCount = (long)(row.candidate_count ?? 0),
                AvgConfidence = (decimal)(row.avg_confidence ?? 0),
                MinConfidence = (int)(row.min_confidence ?? 0),
                MaxConfidence = (int)(row.max_confidence ?? 0)
            }).ToList();
        }
        catch (PostgresException ex) when (ex.SqlState == "P0001")
        {
            _logger.LogWarning(ex, "Duplicate summary function raised an exception");
            throw new InvalidOperationException(ex.MessageText, ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting duplicate summary");
            throw;
        }
    }

    private static object? ParseEvidence(dynamic? evidence)
    {
        if (evidence == null) return null;

        try
        {
            var jsonString = evidence.ToString();
            if (string.IsNullOrEmpty(jsonString) || jsonString == "{}")
                return null;

            return JsonSerializer.Deserialize<object>(jsonString, JsonOptions);
        }
        catch
        {
            return null;
        }
    }
}
