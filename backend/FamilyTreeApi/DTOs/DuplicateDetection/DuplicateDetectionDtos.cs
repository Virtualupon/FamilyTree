#nullable enable
using System;
using System.Collections.Generic;

namespace FamilyTreeApi.DTOs.DuplicateDetection;

// ============================================================================
// REQUEST DTOs
// ============================================================================

/// <summary>
/// Request parameters for duplicate candidate scanning
/// </summary>
public record DuplicateScanRequest
{
    /// <summary>Tree ID to scan (required for Admin, optional for SuperAdmin)</summary>
    public Guid? TreeId { get; init; }

    /// <summary>Optional target tree to compare against (cross-tree matching)</summary>
    public Guid? TargetTreeId { get; init; }

    /// <summary>Detection mode: 'auto', 'name_exact', 'name_similar', 'mother_surn', 'shared_parent'</summary>
    public string Mode { get; init; } = "auto";

    /// <summary>Minimum confidence threshold (0-100)</summary>
    public int MinConfidence { get; init; } = 50;

    /// <summary>Page number (1-based)</summary>
    public int Page { get; init; } = 1;

    /// <summary>Page size (1-100)</summary>
    public int PageSize { get; init; } = 50;
}

/// <summary>
/// Request to resolve a duplicate pair
/// </summary>
public record DuplicateResolveRequest
{
    /// <summary>Action to take: 'approve_link', 'reject', 'merge'</summary>
    public required string Action { get; init; }

    /// <summary>For merge: which person to keep (required if action is 'merge')</summary>
    public Guid? KeepPersonId { get; init; }

    /// <summary>Optional notes about the resolution</summary>
    public string? Notes { get; init; }
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/// <summary>
/// A single duplicate candidate pair
/// </summary>
public record DuplicateCandidateDto
{
    // Person A
    public Guid PersonAId { get; init; }
    public string? PersonAName { get; init; }
    public string? PersonANameArabic { get; init; }
    public string? PersonANameEnglish { get; init; }
    public int PersonASex { get; init; }
    public DateTime? PersonABirthDate { get; init; }
    public DateTime? PersonADeathDate { get; init; }
    public Guid PersonAOrgId { get; init; }
    public string? PersonAOrgName { get; init; }

    // Person B
    public Guid PersonBId { get; init; }
    public string? PersonBName { get; init; }
    public string? PersonBNameArabic { get; init; }
    public string? PersonBNameEnglish { get; init; }
    public int PersonBSex { get; init; }
    public DateTime? PersonBBirthDate { get; init; }
    public DateTime? PersonBDeathDate { get; init; }
    public Guid PersonBOrgId { get; init; }
    public string? PersonBOrgName { get; init; }

    // Match info
    public string MatchType { get; init; } = string.Empty;
    public int Confidence { get; init; }
    public float SimilarityScore { get; init; }

    // Name parts
    public string? GivenNameA { get; init; }
    public string? SurnameA { get; init; }
    public string? GivenNameB { get; init; }
    public string? SurnameB { get; init; }

    // Additional evidence
    public int SharedParentCount { get; init; }
    public object? Evidence { get; init; }
}

/// <summary>
/// Paginated scan results
/// </summary>
public record DuplicateScanResult
{
    public long Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)Total / PageSize) : 0;
    public List<DuplicateCandidateDto> Items { get; init; } = new();
}

/// <summary>
/// Summary statistics for a match type
/// </summary>
public record DuplicateSummaryItem
{
    public string MatchType { get; init; } = string.Empty;
    public long CandidateCount { get; init; }
    public decimal AvgConfidence { get; init; }
    public int MinConfidence { get; init; }
    public int MaxConfidence { get; init; }
}

/// <summary>
/// Overall summary of duplicate candidates
/// </summary>
public record DuplicateSummaryResult
{
    public Guid? TreeId { get; init; }
    public string? TreeName { get; init; }
    public long TotalCandidates { get; init; }
    public List<DuplicateSummaryItem> ByMatchType { get; init; } = new();
}
