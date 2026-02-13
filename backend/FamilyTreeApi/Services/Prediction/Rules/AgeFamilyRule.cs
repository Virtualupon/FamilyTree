using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction.Rules;

/// <summary>
/// Pattern 5: Age + Family Inference (confidence 25-55%)
/// If person A's birth date is 15-50 years before person B's, and they share a family group
/// or surname, predict they might be parent-child.
/// Lowest confidence — best used as a tiebreaker or combined with other signals.
/// </summary>
public class AgeFamilyRule : IPredictionRule
{
    private readonly ApplicationDbContext _context;

    public AgeFamilyRule(ApplicationDbContext context)
    {
        _context = context;
    }

    public string RuleId => "age_family";
    public string Description => "Detects potential parent-child links based on age gaps and shared family membership";

    public async Task<List<PredictionCandidate>> DetectAsync(Guid treeId, CancellationToken ct = default)
    {
        var candidates = new List<PredictionCandidate>();

        // Get people with birth dates in this tree
        var people = await _context.People
            .Where(p => p.OrgId == treeId && !p.IsDeleted && p.BirthDate != null)
            .Select(p => new
            {
                p.Id,
                p.PrimaryName,
                p.NameArabic,
                p.Sex,
                BirthDate = p.BirthDate!.Value,
                p.FamilyId
            })
            .ToListAsync(ct);

        if (people.Count < 2) return candidates;

        // Get existing parent-child links to avoid re-predicting
        var existingLinks = await _context.ParentChildren
            .Where(pc => !pc.IsDeleted)
            .Where(pc => pc.Parent.OrgId == treeId || pc.Child.OrgId == treeId)
            .Select(pc => $"{pc.ParentId}_{pc.ChildId}")
            .ToListAsync(ct);
        var existingLinkSet = existingLinks.ToHashSet();

        // Group people by family for efficient lookup
        var familyGroups = people
            .Where(p => p.FamilyId.HasValue)
            .GroupBy(p => p.FamilyId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        // For each family group, find potential parent-child pairs by age gap
        foreach (var (familyId, members) in familyGroups)
        {
            if (members.Count < 2) continue;

            for (int i = 0; i < members.Count; i++)
            {
                for (int j = 0; j < members.Count; j++)
                {
                    if (i == j) continue;

                    var older = members[i];
                    var younger = members[j];
                    var ageGapYears = (younger.BirthDate - older.BirthDate).TotalDays / 365.25;

                    // Only consider 15-50 year age gaps
                    if (ageGapYears < 15 || ageGapYears > 50) continue;

                    // Skip if already linked
                    if (existingLinkSet.Contains($"{older.Id}_{younger.Id}")) continue;
                    if (existingLinkSet.Contains($"{younger.Id}_{older.Id}")) continue;

                    // Compute confidence
                    decimal confidence;

                    if (ageGapYears >= 20 && ageGapYears <= 40)
                    {
                        confidence = 55; // Ideal age gap + same family
                    }
                    else
                    {
                        confidence = 45; // Same family but wider/narrower gap
                    }

                    var olderName = older.NameArabic ?? older.PrimaryName ?? "?";
                    var youngerName = younger.NameArabic ?? younger.PrimaryName ?? "?";
                    var gapYearsRounded = (int)Math.Round(ageGapYears);

                    candidates.Add(new PredictionCandidate(
                        RuleId: RuleId,
                        PredictedType: "parent_child",
                        SourcePersonId: older.Id,
                        TargetPersonId: younger.Id,
                        Confidence: confidence,
                        Explanation: $"{olderName} and {youngerName} are in the same family with a {gapYearsRounded}-year age gap"
                    ));
                }
            }
        }

        // Limit to top 200 by confidence to avoid overwhelming results
        return candidates
            .OrderByDescending(c => c.Confidence)
            .Take(200)
            .ToList();
    }
}
