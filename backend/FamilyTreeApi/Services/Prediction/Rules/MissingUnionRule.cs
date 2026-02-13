using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction.Rules;

/// <summary>
/// Pattern 2: Missing Union Detection (confidence 70-95%)
/// If person A and person B are BOTH parents of the same child (via ParentChild),
/// but there's no Union between them — predict they should have a Union.
/// </summary>
public class MissingUnionRule : IPredictionRule
{
    private readonly ApplicationDbContext _context;

    public MissingUnionRule(ApplicationDbContext context)
    {
        _context = context;
    }

    public string RuleId => "missing_union";
    public string Description => "Detects co-parents who share children but have no union between them";

    public async Task<List<PredictionCandidate>> DetectAsync(Guid treeId, CancellationToken ct = default)
    {
        var candidates = new List<PredictionCandidate>();

        // Get all parent-child relationships for people in this tree
        var parentChildLinks = await _context.ParentChildren
            .Where(pc => !pc.IsDeleted)
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .Where(pc => pc.Parent.OrgId == treeId && !pc.Parent.IsDeleted && !pc.Child.IsDeleted)
            .Select(pc => new { pc.ParentId, pc.ChildId, ParentName = pc.Parent.PrimaryName, ParentSex = pc.Parent.Sex })
            .ToListAsync(ct);

        // Group by child to find co-parents
        var childGroups = parentChildLinks
            .GroupBy(pc => pc.ChildId)
            .Where(g => g.Select(x => x.ParentId).Distinct().Count() >= 2);

        // Track already checked pairs
        var checkedPairs = new HashSet<string>();

        foreach (var childGroup in childGroups)
        {
            var parentIds = childGroup.Select(x => x.ParentId).Distinct().ToList();

            // Check all pairs of parents for this child
            for (int i = 0; i < parentIds.Count; i++)
            {
                for (int j = i + 1; j < parentIds.Count; j++)
                {
                    var parentA = parentIds[i];
                    var parentB = parentIds[j];
                    var pairKey = $"{(parentA.CompareTo(parentB) < 0 ? parentA : parentB)}_{(parentA.CompareTo(parentB) < 0 ? parentB : parentA)}";

                    if (checkedPairs.Contains(pairKey)) continue;
                    checkedPairs.Add(pairKey);

                    // Check if they already have a union
                    var hasUnion = await _context.UnionMembers
                        .Where(um1 => um1.PersonId == parentA && !um1.IsDeleted)
                        .Join(_context.UnionMembers.Where(um2 => um2.PersonId == parentB && !um2.IsDeleted),
                            um1 => um1.UnionId,
                            um2 => um2.UnionId,
                            (um1, um2) => um1.UnionId)
                        .AnyAsync(ct);

                    if (hasUnion) continue;

                    // Count shared children
                    var sharedChildCount = parentChildLinks
                        .Where(pc => pc.ParentId == parentA)
                        .Select(pc => pc.ChildId)
                        .Intersect(parentChildLinks.Where(pc => pc.ParentId == parentB).Select(pc => pc.ChildId))
                        .Count();

                    // Confidence based on shared children count
                    decimal confidence = sharedChildCount switch
                    {
                        >= 3 => 95,
                        2 => 90,
                        1 => 80,
                        _ => 70
                    };

                    var parentAInfo = childGroup.First(x => x.ParentId == parentA);
                    var parentBInfo = childGroup.First(x => x.ParentId == parentB);

                    // Boost confidence if opposite sex
                    if (parentAInfo.ParentSex != parentBInfo.ParentSex
                        && parentAInfo.ParentSex != Models.Enums.Sex.Unknown
                        && parentBInfo.ParentSex != Models.Enums.Sex.Unknown)
                    {
                        confidence = Math.Min(confidence + 5, 99);
                    }

                    candidates.Add(new PredictionCandidate(
                        RuleId: RuleId,
                        PredictedType: "union",
                        SourcePersonId: parentA,
                        TargetPersonId: parentB,
                        Confidence: confidence,
                        Explanation: $"{parentAInfo.ParentName ?? "?"} and {parentBInfo.ParentName ?? "?"} are both parents of {sharedChildCount} child(ren) but have no union"
                    ));
                }
            }
        }

        return candidates;
    }
}
