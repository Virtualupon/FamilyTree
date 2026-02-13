using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.Prediction;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Services.Prediction.Rules;

/// <summary>
/// Pattern 4: Arabic Patronymic Name Prediction (confidence 35-65%)
/// In Arabic naming convention, a person's full name is "Given Father Grandfather Family".
/// If person X's second name token matches person Y's first name, they might be parent-child.
/// Lower confidence — requires corroborating signals (same tree, family, age gap, sex).
/// </summary>
public class PatronymicNameRule : IPredictionRule
{
    private readonly ApplicationDbContext _context;

    public PatronymicNameRule(ApplicationDbContext context)
    {
        _context = context;
    }

    public string RuleId => "patronymic_name";
    public string Description => "Detects potential parent-child links based on Arabic patronymic naming patterns";

    public async Task<List<PredictionCandidate>> DetectAsync(Guid treeId, CancellationToken ct = default)
    {
        var candidates = new List<PredictionCandidate>();

        // Get all people in this tree with their Arabic names
        var people = await _context.People
            .Where(p => p.OrgId == treeId && !p.IsDeleted)
            .Select(p => new
            {
                p.Id,
                p.PrimaryName,
                p.NameArabic,
                p.Sex,
                p.BirthDate,
                p.FamilyId
            })
            .ToListAsync(ct);

        // Parse name tokens — extract the second token (father's name) from Arabic/Primary name
        var parsed = people.Select(p =>
        {
            var name = !string.IsNullOrWhiteSpace(p.NameArabic) ? p.NameArabic : p.PrimaryName;
            var tokens = (name ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return new
            {
                p.Id,
                p.Sex,
                p.BirthDate,
                p.FamilyId,
                FullName = name,
                GivenName = tokens.Length > 0 ? NormalizeArabic(tokens[0]) : "",
                FatherNameToken = tokens.Length > 1 ? NormalizeArabic(tokens[1]) : ""
            };
        })
        .Where(p => !string.IsNullOrEmpty(p.GivenName) && p.GivenName.Length > 1)
        .ToList();

        // Get existing parent-child relationships to avoid re-predicting
        var existingLinks = await _context.ParentChildren
            .Where(pc => !pc.IsDeleted)
            .Where(pc => pc.Parent.OrgId == treeId || pc.Child.OrgId == treeId)
            .Select(pc => new { pc.ParentId, pc.ChildId })
            .ToListAsync(ct);

        var existingLinkSet = existingLinks
            .Select(l => $"{l.ParentId}_{l.ChildId}")
            .ToHashSet();

        // Build a lookup: given name → list of people with that given name
        var givenNameLookup = parsed
            .Where(p => !string.IsNullOrEmpty(p.GivenName))
            .GroupBy(p => p.GivenName)
            .ToDictionary(g => g.Key, g => g.ToList());

        // For each person with a father name token, find potential parents
        foreach (var child in parsed)
        {
            if (string.IsNullOrEmpty(child.FatherNameToken)) continue;

            if (!givenNameLookup.TryGetValue(child.FatherNameToken, out var potentialParents))
                continue;

            foreach (var parent in potentialParents)
            {
                if (parent.Id == child.Id) continue; // Not self
                if (existingLinkSet.Contains($"{parent.Id}_{child.Id}")) continue; // Already linked

                // Compute confidence based on corroborating signals
                decimal confidence = 35;

                // Boost if parent is male (patronymic naming = father's name)
                if (parent.Sex == Sex.Male) confidence += 10;

                // Boost if same family group
                if (child.FamilyId.HasValue && parent.FamilyId.HasValue
                    && child.FamilyId == parent.FamilyId)
                {
                    confidence += 10;
                }

                // Boost if plausible age gap (15-50 years)
                if (child.BirthDate.HasValue && parent.BirthDate.HasValue)
                {
                    var ageGap = (child.BirthDate.Value - parent.BirthDate.Value).TotalDays / 365.25;
                    if (ageGap >= 15 && ageGap <= 50)
                    {
                        confidence += 10;
                    }
                    else if (ageGap < 0 || ageGap > 60)
                    {
                        continue; // Impossible age gap — skip entirely
                    }
                }

                // Cap at 65
                confidence = Math.Min(confidence, 65);

                // Only include if confidence is meaningful (>= 40)
                if (confidence < 40) continue;

                candidates.Add(new PredictionCandidate(
                    RuleId: RuleId,
                    PredictedType: "parent_child",
                    SourcePersonId: parent.Id,
                    TargetPersonId: child.Id,
                    Confidence: confidence,
                    Explanation: $"{child.FullName}'s second name matches {parent.FullName}'s given name (Arabic patronymic pattern)"
                ));
            }
        }

        // Limit to top 200 by confidence to avoid overwhelming results
        return candidates
            .OrderByDescending(c => c.Confidence)
            .Take(200)
            .ToList();
    }

    /// <summary>Basic Arabic text normalization for name comparison</summary>
    private static string NormalizeArabic(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";

        return text
            .Replace("\u0623", "\u0627") // أ → ا (alef with hamza above)
            .Replace("\u0625", "\u0627") // إ → ا (alef with hamza below)
            .Replace("\u0622", "\u0627") // آ → ا (alef with madda)
            .Replace("\u0629", "\u0647") // ة → ه (taa marbuta → haa)
            .Replace("\u0649", "\u064A") // ى → ي (alef maqsura → yaa)
            .Trim()
            .ToLowerInvariant();
    }
}
