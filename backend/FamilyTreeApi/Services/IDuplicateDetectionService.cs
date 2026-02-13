#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using FamilyTreeApi.DTOs.DuplicateDetection;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for duplicate person detection and resolution
/// </summary>
public interface IDuplicateDetectionService
{
    /// <summary>
    /// Scan for duplicate candidates
    /// </summary>
    Task<ServiceResult<DuplicateScanResult>> ScanAsync(
        DuplicateScanRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get summary statistics of duplicate candidates
    /// </summary>
    Task<ServiceResult<DuplicateSummaryResult>> GetSummaryAsync(
        Guid? treeId,
        Guid? targetTreeId,
        string mode,
        int minConfidence,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resolve a duplicate pair (approve_link, reject, or merge)
    /// </summary>
    Task<ServiceResult> ResolveAsync(
        Guid personAId,
        Guid personBId,
        DuplicateResolveRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
