using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Helpers;

/// <summary>
/// Result of relationship calculation containing i18n key, database type ID, and description
/// </summary>
public record RelationshipResult(
    string NameKey,
    int? TypeId,
    string Description
);

/// <summary>
/// Helper class for calculating and naming relationship types based on path analysis.
/// Returns i18n keys for frontend localization and database type IDs for direct lookup.
/// </summary>
public class RelationshipNamer
{
    private readonly IRelationshipTypeMappingService? _mappingService;
    private readonly ILogger<RelationshipNamer>? _logger;

    public RelationshipNamer(
        IRelationshipTypeMappingService? mappingService = null,
        ILogger<RelationshipNamer>? logger = null)
    {
        _mappingService = mappingService;
        _logger = logger;
    }

    /// <summary>
    /// Calculate the relationship type from a path between two people.
    /// Returns i18n key, database type ID, and description template.
    /// </summary>
    public RelationshipResult CalculateRelationship(
        List<(Guid Id, RelationshipEdgeType Edge)> path,
        List<PathPersonNode> pathNodes)
    {
        if (path.Count <= 1)
        {
            return CreateResult("relationship.samePerson", "Same person");
        }

        var person1 = pathNodes.First();
        var person2 = pathNodes.Last();

        // Analyze path structure
        var analysis = AnalyzePath(path);

        // Check for spouse relationship (direct)
        if (path.Count == 2 && path[1].Edge == RelationshipEdgeType.Spouse)
        {
            var name1 = person1.NameEnglish ?? person1.PrimaryName;
            var name2 = person2.NameEnglish ?? person2.PrimaryName;
            return CreateResult("relationship.spouse", $"{name1} is married to {name2}");
        }

        // Check for in-law relationships (path includes spouse edge)
        if (analysis.HasSpouseEdge && !analysis.OnlySpouseEdges)
        {
            return GetInLawRelationship(analysis, person1, person2, pathNodes);
        }

        // Direct line relationships (parent/child only)
        if (analysis.IsDirectLine)
        {
            return GetDirectLineRelationship(analysis, person1, person2);
        }

        // Sibling
        if (analysis.Gen1 == 1 && analysis.Gen2 == 1 && !analysis.HasSpouseEdge)
        {
            return GetSiblingRelationship(person1, person2);
        }

        // Collateral relationships (uncle/aunt, niece/nephew, cousins)
        return GetCollateralRelationship(analysis, person1, person2);
    }

    /// <summary>
    /// Static method for backward compatibility - creates instance with no mapping service
    /// </summary>
    public static (string NameKey, string Description) CalculateRelationshipStatic(
        List<(Guid Id, RelationshipEdgeType Edge)> path,
        List<PathPersonNode> pathNodes)
    {
        var namer = new RelationshipNamer();
        var result = namer.CalculateRelationship(path, pathNodes);
        return (result.NameKey, result.Description);
    }

    private RelationshipResult CreateResult(string key, string description)
    {
        int? typeId = null;

        if (_mappingService != null)
        {
            typeId = _mappingService.GetTypeIdByKey(key);
            if (typeId == null)
            {
                _logger?.LogDebug("No type ID found for key: {Key}", key);
            }
        }

        return new RelationshipResult(key, typeId, description);
    }

    private PathAnalysis AnalyzePath(List<(Guid Id, RelationshipEdgeType Edge)> path)
    {
        int gen1 = 0; // Generations up from person1 (to common ancestor)
        int gen2 = 0; // Generations down to person2 (from common ancestor)
        bool foundPivot = false;
        bool hasSpouseEdge = false;
        int spouseEdgeCount = 0;

        for (int i = 1; i < path.Count; i++)
        {
            var edge = path[i].Edge;

            if (edge == RelationshipEdgeType.Spouse)
            {
                hasSpouseEdge = true;
                spouseEdgeCount++;
                continue;
            }

            if (edge == RelationshipEdgeType.Parent)
            {
                if (!foundPivot)
                {
                    gen1++;
                }
                else
                {
                    // Going up after going down - unusual but handle it
                    gen2--;
                }
            }
            else if (edge == RelationshipEdgeType.Child)
            {
                if (!foundPivot && gen1 > 0)
                {
                    foundPivot = true;
                }
                gen2++;
            }
        }

        return new PathAnalysis
        {
            Gen1 = gen1,
            Gen2 = gen2,
            HasSpouseEdge = hasSpouseEdge,
            OnlySpouseEdges = spouseEdgeCount == path.Count - 1,
            IsDirectLine = (gen1 == 0 || gen2 == 0) && !hasSpouseEdge,
            PathLength = path.Count
        };
    }

    private RelationshipResult GetDirectLineRelationship(
        PathAnalysis analysis, PathPersonNode person1, PathPersonNode person2)
    {
        int generations = Math.Max(analysis.Gen1, analysis.Gen2);
        bool isAncestor = analysis.Gen1 == 0; // Person1 is ancestor, Person2 is descendant
        var name1 = person1.NameEnglish ?? person1.PrimaryName;
        var name2 = person2.NameEnglish ?? person2.PrimaryName;

        if (isAncestor)
        {
            // Person2 is descendant of Person1
            var (key, term) = generations switch
            {
                1 => GetGenderedTerm("child", person2.Sex),
                2 => GetGenderedTerm("grandchild", person2.Sex),
                3 => ("relationship.greatGrandchild", $"great-{GetGenderedTermName("grandchild", person2.Sex)}"),
                _ => ($"relationship.greatGrandchild{generations - 2}", $"{generations - 2}x great-{GetGenderedTermName("grandchild", person2.Sex)}")
            };
            return CreateResult(key, $"{name2} is {name1}'s {term}");
        }
        else
        {
            // Person2 is ancestor of Person1
            var (key, term) = generations switch
            {
                1 => GetGenderedTerm("parent", person2.Sex),
                2 => GetGenderedTerm("grandparent", person2.Sex),
                3 => ("relationship.greatGrandparent", $"great-{GetGenderedTermName("grandparent", person2.Sex)}"),
                _ => ($"relationship.greatGrandparent{generations - 2}", $"{generations - 2}x great-{GetGenderedTermName("grandparent", person2.Sex)}")
            };
            return CreateResult(key, $"{name2} is {name1}'s {term}");
        }
    }

    private RelationshipResult GetSiblingRelationship(PathPersonNode person1, PathPersonNode person2)
    {
        var (key, term) = GetGenderedTerm("sibling", person2.Sex);
        var name1 = person1.NameEnglish ?? person1.PrimaryName;
        var name2 = person2.NameEnglish ?? person2.PrimaryName;
        return CreateResult(key, $"{name2} is {name1}'s {term}");
    }

    private RelationshipResult GetCollateralRelationship(
        PathAnalysis analysis, PathPersonNode person1, PathPersonNode person2)
    {
        int gen1 = analysis.Gen1;
        int gen2 = analysis.Gen2;
        var name1 = person1.NameEnglish ?? person1.PrimaryName;
        var name2 = person2.NameEnglish ?? person2.PrimaryName;

        // Aunt/Uncle: person1 gen1=1, person2 gen2>1 (parent's sibling)
        if (gen1 == 1 && gen2 >= 2)
        {
            int greats = gen2 - 2;
            var (key, term) = GetGenderedTerm("pibling", person2.Sex); // pibling = aunt/uncle
            if (greats == 0)
            {
                return CreateResult(key, $"{name2} is {name1}'s {term}");
            }
            else
            {
                return CreateResult($"relationship.greatPibling{greats}", $"{name2} is {name1}'s {GetGreatPrefix(greats)}{term}");
            }
        }

        // Niece/Nephew: person1 gen1>=2, person2 gen2=1 (sibling's child)
        if (gen1 >= 2 && gen2 == 1)
        {
            int greats = gen1 - 2;
            var (key, term) = GetGenderedTerm("nibling", person2.Sex); // nibling = niece/nephew
            if (greats == 0)
            {
                return CreateResult(key, $"{name2} is {name1}'s {term}");
            }
            else
            {
                return CreateResult($"relationship.greatNibling{greats}", $"{name2} is {name1}'s {GetGreatPrefix(greats)}{term}");
            }
        }

        // Cousins
        int cousinDegree = Math.Min(gen1, gen2) - 1;
        int removed = Math.Abs(gen1 - gen2);

        string ordinal = GetOrdinal(cousinDegree);
        string removedText = removed > 0 ? $", {removed} time{(removed > 1 ? "s" : "")} removed" : "";
        string removedKey = removed > 0 ? $"{removed}xRemoved" : "";

        return CreateResult($"relationship.cousin{cousinDegree}{removedKey}",
            $"{name2} is {name1}'s {ordinal.ToLower()} cousin{removedText}");
    }

    private RelationshipResult GetInLawRelationship(
        PathAnalysis analysis, PathPersonNode person1, PathPersonNode person2, List<PathPersonNode> pathNodes)
    {
        // Find spouse edge position to determine relationship type
        // Common patterns:
        // - Parent-in-law: Spouse → Parent (person2 is spouse's parent)
        // - Sibling-in-law: Spouse → Sibling OR Sibling → Spouse
        // - Child-in-law: Child → Spouse (person2 is child's spouse)

        int gen1 = analysis.Gen1;
        int gen2 = analysis.Gen2;
        var name1 = person1.NameEnglish ?? person1.PrimaryName;
        var name2 = person2.NameEnglish ?? person2.PrimaryName;

        // Parent-in-law (spouse's parent)
        if (gen1 == 0 && gen2 == 1)
        {
            var (key, term) = GetGenderedTerm("parentInLaw", person2.Sex);
            return CreateResult(key, $"{name2} is {name1}'s {term}");
        }

        // Child-in-law (child's spouse)
        if (gen1 == 1 && gen2 == 0)
        {
            var (key, term) = GetGenderedTerm("childInLaw", person2.Sex);
            return CreateResult(key, $"{name2} is {name1}'s {term}");
        }

        // Sibling-in-law (spouse's sibling or sibling's spouse)
        if ((gen1 == 0 || gen1 == 1) && (gen2 == 0 || gen2 == 1) && analysis.PathLength <= 4)
        {
            var (key, term) = GetGenderedTerm("siblingInLaw", person2.Sex);
            return CreateResult(key, $"{name2} is {name1}'s {term}");
        }

        // Generic in-law for complex relationships
        return CreateResult("relationship.relatedByMarriage", $"{name2} is related to {name1} by marriage");
    }

    private static (string Key, string Term) GetGenderedTerm(string baseTerm, Sex sex)
    {
        return (baseTerm, sex) switch
        {
            ("parent", Sex.Male) => ("relationship.father", "father"),
            ("parent", Sex.Female) => ("relationship.mother", "mother"),
            ("parent", _) => ("relationship.parent", "parent"),

            ("child", Sex.Male) => ("relationship.son", "son"),
            ("child", Sex.Female) => ("relationship.daughter", "daughter"),
            ("child", _) => ("relationship.child", "child"),

            ("grandparent", Sex.Male) => ("relationship.grandfather", "grandfather"),
            ("grandparent", Sex.Female) => ("relationship.grandmother", "grandmother"),
            ("grandparent", _) => ("relationship.grandparent", "grandparent"),

            ("grandchild", Sex.Male) => ("relationship.grandson", "grandson"),
            ("grandchild", Sex.Female) => ("relationship.granddaughter", "granddaughter"),
            ("grandchild", _) => ("relationship.grandchild", "grandchild"),

            ("sibling", Sex.Male) => ("relationship.brother", "brother"),
            ("sibling", Sex.Female) => ("relationship.sister", "sister"),
            ("sibling", _) => ("relationship.sibling", "sibling"),

            ("pibling", Sex.Male) => ("relationship.uncle", "uncle"),
            ("pibling", Sex.Female) => ("relationship.aunt", "aunt"),
            ("pibling", _) => ("relationship.auntOrUncle", "aunt/uncle"),

            ("nibling", Sex.Male) => ("relationship.nephew", "nephew"),
            ("nibling", Sex.Female) => ("relationship.niece", "niece"),
            ("nibling", _) => ("relationship.nieceOrNephew", "niece/nephew"),

            ("parentInLaw", Sex.Male) => ("relationship.fatherInLaw", "father-in-law"),
            ("parentInLaw", Sex.Female) => ("relationship.motherInLaw", "mother-in-law"),
            ("parentInLaw", _) => ("relationship.parentInLaw", "parent-in-law"),

            ("childInLaw", Sex.Male) => ("relationship.sonInLaw", "son-in-law"),
            ("childInLaw", Sex.Female) => ("relationship.daughterInLaw", "daughter-in-law"),
            ("childInLaw", _) => ("relationship.childInLaw", "child-in-law"),

            ("siblingInLaw", Sex.Male) => ("relationship.brotherInLaw", "brother-in-law"),
            ("siblingInLaw", Sex.Female) => ("relationship.sisterInLaw", "sister-in-law"),
            ("siblingInLaw", _) => ("relationship.siblingInLaw", "sibling-in-law"),

            _ => ($"relationship.{baseTerm}", baseTerm)
        };
    }

    private static string GetGenderedTermName(string baseTerm, Sex sex)
    {
        return GetGenderedTerm(baseTerm, sex).Term;
    }

    private static string GetOrdinal(int n) => n switch
    {
        1 => "First",
        2 => "Second",
        3 => "Third",
        4 => "Fourth",
        5 => "Fifth",
        6 => "Sixth",
        7 => "Seventh",
        8 => "Eighth",
        _ => $"{n}th"
    };

    private static string GetGreatPrefix(int count) => count switch
    {
        0 => "",
        1 => "great-",
        2 => "great-great-",
        _ => $"{count}x great-"
    };

    private class PathAnalysis
    {
        public int Gen1 { get; set; }
        public int Gen2 { get; set; }
        public bool HasSpouseEdge { get; set; }
        public bool OnlySpouseEdges { get; set; }
        public bool IsDirectLine { get; set; }
        public int PathLength { get; set; }
    }
}
