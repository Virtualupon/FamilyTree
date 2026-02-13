using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.Prediction;

namespace FamilyTreeApi.Services.Prediction.Rules;

/// <summary>
/// Pattern 1: Spouse + Child Gap (confidence 85-95%)
/// If person A has a Union with person B, and person A has children, but person B does NOT
/// have ParentChild records with those same children — predict B should also be a parent.
/// Highest-confidence structural prediction.
/// </summary>
public class SpouseChildGapRule : IPredictionRule
{
    private readonly ApplicationDbContext _context;

    public SpouseChildGapRule(ApplicationDbContext context)
    {
        _context = context;
    }

    public string RuleId => "spouse_child_gap";
    public string Description => "Detects children linked to one spouse but not the other in a union";

    public async Task<List<PredictionCandidate>> DetectAsync(Guid treeId, CancellationToken ct = default)
    {
        var candidates = new List<PredictionCandidate>();

        // Get all unions in this tree with their members
        var unions = await _context.Unions
            .Where(u => u.OrgId == treeId && !u.IsDeleted)
            .Include(u => u.Members.Where(m => !m.IsDeleted))
                .ThenInclude(m => m.Person)
            .ToListAsync(ct);

        foreach (var union in unions)
        {
            if (union.Members.Count < 2) continue;

            var memberList = union.Members.ToList();

            // For each pair of members
            for (int i = 0; i < memberList.Count; i++)
            {
                var memberA = memberList[i];

                // Get children of memberA
                var childrenOfA = await _context.ParentChildren
                    .Where(pc => pc.ParentId == memberA.PersonId && !pc.IsDeleted)
                    .Include(pc => pc.Child)
                    .Where(pc => !pc.Child.IsDeleted)
                    .ToListAsync(ct);

                for (int j = 0; j < memberList.Count; j++)
                {
                    if (i == j) continue;
                    var memberB = memberList[j];

                    foreach (var childRel in childrenOfA)
                    {
                        // Check if memberB is already a parent of this child
                        var alreadyLinked = await _context.ParentChildren
                            .AnyAsync(pc => pc.ParentId == memberB.PersonId
                                && pc.ChildId == childRel.ChildId
                                && !pc.IsDeleted, ct);

                        if (alreadyLinked) continue;

                        // Check max 2 biological parents constraint
                        var bioParentCount = await _context.ParentChildren
                            .CountAsync(pc => pc.ChildId == childRel.ChildId
                                && pc.RelationshipType == Models.Enums.RelationshipType.Biological
                                && !pc.IsDeleted, ct);
                        if (bioParentCount >= 2) continue;

                        // Compute confidence based on date overlap
                        decimal confidence = 85;
                        if (childRel.Child?.BirthDate != null && union.StartDate != null)
                        {
                            if (childRel.Child.BirthDate >= union.StartDate
                                && (union.EndDate == null || childRel.Child.BirthDate <= union.EndDate))
                            {
                                confidence = 95; // Child born during union = very high
                            }
                            else
                            {
                                confidence = 60; // Child born outside union dates (possible stepchild)
                            }
                        }

                        var parentAName = memberA.Person?.PrimaryName ?? "?";
                        var parentBName = memberB.Person?.PrimaryName ?? "?";
                        var childName = childRel.Child?.PrimaryName ?? "?";

                        candidates.Add(new PredictionCandidate(
                            RuleId: RuleId,
                            PredictedType: "parent_child",
                            SourcePersonId: memberB.PersonId,  // suggested parent
                            TargetPersonId: childRel.ChildId,  // child
                            Confidence: confidence,
                            Explanation: $"{parentBName} is in a union with {parentAName} who is parent of {childName}, but {parentBName} is not linked as parent"
                        ));
                    }
                }
            }
        }

        return candidates;
    }
}
