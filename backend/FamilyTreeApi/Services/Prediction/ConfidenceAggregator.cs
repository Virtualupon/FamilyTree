using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction;

/// <summary>
/// Aggregates confidence scores when multiple rules predict the same relationship.
/// Uses Noisy-OR combination: P(combined) = 1 - Π(1 - P_i), capped at 99%.
/// </summary>
public static class ConfidenceAggregator
{
    /// <summary>
    /// Merge candidates that predict the same relationship pair, combining their confidence.
    /// Keeps the highest-confidence candidate's explanation and rule as primary,
    /// but boosts confidence using all matching rules.
    /// </summary>
    public static List<PredictionCandidate> AggregateCandidates(List<PredictionCandidate> allCandidates)
    {
        // Group by (SourcePersonId, TargetPersonId, PredictedType)
        var groups = allCandidates
            .GroupBy(c => new { c.SourcePersonId, c.TargetPersonId, c.PredictedType });

        var merged = new List<PredictionCandidate>();

        foreach (var group in groups)
        {
            var candidates = group.OrderByDescending(c => c.Confidence).ToList();

            if (candidates.Count == 1)
            {
                merged.Add(candidates[0]);
                continue;
            }

            // Noisy-OR combination
            var probabilities = candidates.Select(c => (double)c.Confidence / 100.0).ToList();
            var combinedProb = 1.0 - probabilities.Aggregate(1.0, (acc, p) => acc * (1.0 - p));
            var combinedConfidence = Math.Min((decimal)(combinedProb * 100.0), 99m);

            // Use highest-confidence candidate as primary, enhance explanation
            var primary = candidates[0];
            var ruleIds = string.Join(", ", candidates.Select(c => c.RuleId).Distinct());
            var enhancedExplanation = $"{primary.Explanation} (also matched by: {ruleIds})";

            merged.Add(new PredictionCandidate(
                RuleId: primary.RuleId,
                PredictedType: primary.PredictedType,
                SourcePersonId: primary.SourcePersonId,
                TargetPersonId: primary.TargetPersonId,
                Confidence: Math.Round(combinedConfidence, 2),
                Explanation: candidates.Count > 1 ? enhancedExplanation : primary.Explanation
            ));
        }

        return merged.OrderByDescending(c => c.Confidence).ToList();
    }

    /// <summary>
    /// Compute confidence level string from numeric confidence.
    /// </summary>
    public static string GetConfidenceLevel(decimal confidence)
    {
        return confidence switch
        {
            >= 85 => "High",
            >= 60 => "Medium",
            _ => "Low"
        };
    }
}
