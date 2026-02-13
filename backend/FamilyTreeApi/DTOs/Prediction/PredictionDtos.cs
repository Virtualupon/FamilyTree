using FamilyTreeApi.Models;

namespace FamilyTreeApi.DTOs.Prediction;

// ============================================================================
// PREDICTION SCAN / QUERY DTOs
// ============================================================================

public record PredictionScanRequest(
    Guid TreeId
);

public record PredictionScanResult(
    Guid ScanBatchId,
    int TotalPredictions,
    int HighConfidence,
    int MediumConfidence,
    int LowConfidence,
    List<PredictionDto> Predictions
);

public record PredictionFilterDto(
    string? Status = null,       // "New", "Confirmed", "Dismissed", "Applied"
    string? ConfidenceLevel = null, // "High", "Medium", "Low"
    string? RuleId = null,       // e.g. "spouse_child_gap"
    string? PredictedType = null, // "parent_child" or "union"
    int Page = 1,
    int PageSize = 50
);

public record PredictionDto(
    Guid Id,
    Guid TreeId,
    string RuleId,
    string RuleDescription,
    string PredictedType,
    Guid SourcePersonId,
    string? SourcePersonName,
    string? SourcePersonNameArabic,
    Guid TargetPersonId,
    string? TargetPersonName,
    string? TargetPersonNameArabic,
    decimal Confidence,
    string ConfidenceLevel,
    string Explanation,
    int Status,
    DateTime CreatedAt,
    Guid? ScanBatchId
);

// ============================================================================
// PREDICTION RULE CANDIDATE (internal, returned by each rule)
// ============================================================================

public record PredictionCandidate(
    string RuleId,
    string PredictedType,      // "parent_child" or "union"
    Guid SourcePersonId,
    Guid TargetPersonId,
    decimal Confidence,        // 0-100
    string Explanation
);

// ============================================================================
// ACCEPT / DISMISS DTOs
// ============================================================================

public record AcceptPredictionRequest(
    Guid PredictionId
);

public record DismissPredictionRequest(
    Guid PredictionId,
    string? Reason = null
);

public record BulkAcceptRequest(
    Guid TreeId,
    double MinConfidence = 85.0
);
