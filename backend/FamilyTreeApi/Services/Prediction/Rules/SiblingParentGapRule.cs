using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction.Rules;

/// <summary>
/// Pattern 3: Sibling Parent Gap (confidence 70-90%)
/// Child X has parents A+B. Child Y has parent A but NOT parent B.
/// If A and B share a union, predict B is also parent of Y.
/// </summary>
public class SiblingParentGapRule : IPredictionRule
{
    private readonly ApplicationDbContext _context;

    public SiblingParentGapRule(ApplicationDbContext context)
    {
        _context = context;
    }

    public string RuleId => "sibling_parent_gap";
    public string Description => "Detects siblings linked to one parent but missing the other (when parents are in a union)";

    public async Task<List<PredictionCandidate>> DetectAsync(Guid treeId, CancellationToken ct = default)
    {
        var candidates = new List<PredictionCandidate>();

        // Get all parent-child links in this tree
        var allLinks = await _context.ParentChildren
            .Where(pc => !pc.IsDeleted)
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .Where(pc => pc.Parent.OrgId == treeId && !pc.Parent.IsDeleted && !pc.Child.IsDeleted)
            .Select(pc => new { pc.ParentId, pc.ChildId, ParentName = pc.Parent.PrimaryName, ChildName = pc.Child.PrimaryName })
            .ToListAsync(ct);

        // Find children with exactly 2 parents
        var childrenWith2Parents = allLinks
            .GroupBy(l => l.ChildId)
            .Where(g => g.Select(x => x.ParentId).Distinct().Count() >= 2)
            .ToDictionary(g => g.Key, g => g.Select(x => x.ParentId).Distinct().ToList());

        // Track processed pairs to avoid duplicates
        var processed = new HashSet<string>();

        foreach (var (childWith2, parentPair) in childrenWith2Parents)
        {
            // Check each pair of parents that are in a union together
            for (int i = 0; i < parentPair.Count; i++)
            {
                for (int j = i + 1; j < parentPair.Count; j++)
                {
                    var parentA = parentPair[i];
                    var parentB = parentPair[j];

                    // Verify they share a union
                    var shareUnion = await _context.UnionMembers
                        .Where(um1 => um1.PersonId == parentA && !um1.IsDeleted)
                        .Join(_context.UnionMembers.Where(um2 => um2.PersonId == parentB && !um2.IsDeleted),
                            um1 => um1.UnionId, um2 => um2.UnionId,
                            (um1, um2) => true)
                        .AnyAsync(ct);

                    if (!shareUnion) continue;

                    // Count how many children have BOTH parents (for confidence boosting)
                    var sibsWithBoth = childrenWith2Parents
                        .Count(kvp => kvp.Value.Contains(parentA) && kvp.Value.Contains(parentB));

                    // Find children of parentA who are missing parentB
                    var childrenOfA = allLinks
                        .Where(l => l.ParentId == parentA)
                        .Select(l => l.ChildId)
                        .Distinct();

                    var childrenOfB = allLinks
                        .Where(l => l.ParentId == parentB)
                        .Select(l => l.ChildId)
                        .ToHashSet();

                    foreach (var childId in childrenOfA)
                    {
                        if (childrenOfB.Contains(childId)) continue; // Already linked to both

                        var key = $"{parentB}_{childId}";
                        if (processed.Contains(key)) continue;
                        processed.Add(key);

                        // Check max 2 bio parents
                        var bioCount = await _context.ParentChildren
                            .CountAsync(pc => pc.ChildId == childId
                                && pc.RelationshipType == Models.Enums.RelationshipType.Biological
                                && !pc.IsDeleted, ct);
                        if (bioCount >= 2) continue;

                        decimal confidence = sibsWithBoth switch
                        {
                            >= 3 => 90,
                            >= 1 => 80,
                            _ => 70
                        };

                        var parentBName = allLinks.FirstOrDefault(l => l.ParentId == parentB)?.ParentName ?? "?";
                        var childName = allLinks.FirstOrDefault(l => l.ChildId == childId)?.ChildName ?? "?";
                        var parentAName = allLinks.FirstOrDefault(l => l.ParentId == parentA)?.ParentName ?? "?";

                        candidates.Add(new PredictionCandidate(
                            RuleId: RuleId,
                            PredictedType: "parent_child",
                            SourcePersonId: parentB,
                            TargetPersonId: childId,
                            Confidence: confidence,
                            Explanation: $"{parentBName} is in a union with {parentAName}. {sibsWithBoth} sibling(s) have both parents, but {childName} only has {parentAName}"
                        ));
                    }

                    // Symmetric: children of parentB missing parentA
                    var childrenOfBList = allLinks
                        .Where(l => l.ParentId == parentB)
                        .Select(l => l.ChildId)
                        .Distinct();

                    var childrenOfASet = allLinks
                        .Where(l => l.ParentId == parentA)
                        .Select(l => l.ChildId)
                        .ToHashSet();

                    foreach (var childId in childrenOfBList)
                    {
                        if (childrenOfASet.Contains(childId)) continue;

                        var key = $"{parentA}_{childId}";
                        if (processed.Contains(key)) continue;
                        processed.Add(key);

                        var bioCount = await _context.ParentChildren
                            .CountAsync(pc => pc.ChildId == childId
                                && pc.RelationshipType == Models.Enums.RelationshipType.Biological
                                && !pc.IsDeleted, ct);
                        if (bioCount >= 2) continue;

                        decimal confidence = sibsWithBoth switch
                        {
                            >= 3 => 90,
                            >= 1 => 80,
                            _ => 70
                        };

                        var parentAName2 = allLinks.FirstOrDefault(l => l.ParentId == parentA)?.ParentName ?? "?";
                        var childName2 = allLinks.FirstOrDefault(l => l.ChildId == childId)?.ChildName ?? "?";
                        var parentBName2 = allLinks.FirstOrDefault(l => l.ParentId == parentB)?.ParentName ?? "?";

                        candidates.Add(new PredictionCandidate(
                            RuleId: RuleId,
                            PredictedType: "parent_child",
                            SourcePersonId: parentA,
                            TargetPersonId: childId,
                            Confidence: confidence,
                            Explanation: $"{parentAName2} is in a union with {parentBName2}. {sibsWithBoth} sibling(s) have both parents, but {childName2} only has {parentBName2}"
                        ));
                    }
                }
            }
        }

        return candidates;
    }
}
