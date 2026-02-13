#nullable enable
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FamilyTreeApi.DTOs.DuplicateDetection;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository interface for duplicate detection operations using PostgreSQL functions
/// </summary>
public interface IDuplicateDetectionRepository
{
    /// <summary>
    /// Detect duplicate candidates using PostgreSQL function
    /// </summary>
    Task<DuplicateScanResult> DetectCandidatesAsync(
        Guid? orgId,
        Guid? targetOrgId,
        string mode,
        int minConfidence,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get summary statistics by match type
    /// </summary>
    Task<List<DuplicateSummaryItem>> GetSummaryAsync(
        Guid? orgId,
        Guid? targetOrgId,
        string mode,
        int minConfidence,
        CancellationToken cancellationToken = default);
}
