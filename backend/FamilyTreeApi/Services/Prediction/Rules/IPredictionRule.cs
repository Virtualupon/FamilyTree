using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction.Rules;

/// <summary>
/// Interface for a prediction rule that detects missing relationships in a tree.
/// Each rule implements a specific detection pattern (e.g., spouse+child gap, missing union).
/// </summary>
public interface IPredictionRule
{
    /// <summary>Unique identifier for this rule (e.g. "spouse_child_gap")</summary>
    string RuleId { get; }

    /// <summary>Human-readable description of what this rule detects</summary>
    string Description { get; }

    /// <summary>
    /// Run the detection logic against a specific tree and return candidate predictions.
    /// </summary>
    Task<List<PredictionCandidate>> DetectAsync(Guid treeId, CancellationToken ct = default);
}
