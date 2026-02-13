using FamilyTreeApi.DTOs;
using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction;

public interface IRelationshipPredictionService
{
    /// <summary>Scan a tree for missing relationships using all prediction rules.</summary>
    Task<ServiceResult<PredictionScanResult>> ScanTreeAsync(
        Guid treeId, UserContext userContext, CancellationToken ct = default);

    /// <summary>Get predictions for a tree with filtering.</summary>
    Task<ServiceResult<PagedResult<PredictionDto>>> GetPredictionsAsync(
        Guid treeId, PredictionFilterDto filter, UserContext userContext, CancellationToken ct = default);

    /// <summary>Accept a prediction — creates the actual relationship.</summary>
    Task<ServiceResult> AcceptPredictionAsync(
        Guid predictionId, UserContext userContext, CancellationToken ct = default);

    /// <summary>Dismiss a prediction with an optional reason.</summary>
    Task<ServiceResult> DismissPredictionAsync(
        Guid predictionId, string? reason, UserContext userContext, CancellationToken ct = default);

    /// <summary>Bulk accept all predictions above a confidence threshold.</summary>
    Task<ServiceResult<int>> AcceptAllHighConfidenceAsync(
        Guid treeId, double minConfidence, UserContext userContext, CancellationToken ct = default);
}
