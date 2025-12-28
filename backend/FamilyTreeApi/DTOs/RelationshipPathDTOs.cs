using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

/// <summary>
/// Request to find relationship path between two people
/// </summary>
public record RelationshipPathRequest(
    Guid Person1Id,
    Guid Person2Id,
    Guid? TreeId = null,
    int MaxSearchDepth = 20
);

/// <summary>
/// Response containing the relationship path and description
/// </summary>
public class RelationshipPathResponse
{
    /// <summary>
    /// Whether a path was found between the two people
    /// </summary>
    public bool PathFound { get; set; }

    /// <summary>
    /// The i18n key for the relationship name (e.g., "relationship.father")
    /// </summary>
    public string RelationshipNameKey { get; set; } = string.Empty;

    /// <summary>
    /// Human-readable relationship description template
    /// </summary>
    public string RelationshipDescription { get; set; } = string.Empty;

    /// <summary>
    /// The complete path from Person1 to Person2
    /// </summary>
    public List<PathPersonNode> Path { get; set; } = new();

    /// <summary>
    /// Common ancestors between the two people (if blood-related)
    /// </summary>
    public List<CommonAncestorInfo> CommonAncestors { get; set; } = new();

    /// <summary>
    /// Number of people in the path
    /// </summary>
    public int PathLength { get; set; }

    /// <summary>
    /// Error message if path finding failed
    /// </summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// A person node in the relationship path with full details
/// </summary>
public class PathPersonNode
{
    public Guid Id { get; set; }
    public string PrimaryName { get; set; } = string.Empty;
    public Sex Sex { get; set; }
    public DateTime? BirthDate { get; set; }
    public string? BirthPlace { get; set; }
    public DateTime? DeathDate { get; set; }
    public string? DeathPlace { get; set; }
    public string? Occupation { get; set; }
    public bool IsLiving { get; set; }
    public string? ThumbnailUrl { get; set; }

    /// <summary>
    /// The type of edge connecting this person to the next in the path
    /// </summary>
    public RelationshipEdgeType EdgeToNext { get; set; }

    /// <summary>
    /// The i18n key for the relationship to the next person (e.g., "relationship.fatherOf")
    /// </summary>
    public string RelationshipToNextKey { get; set; } = string.Empty;
}

/// <summary>
/// Type of edge in the relationship graph
/// </summary>
public enum RelationshipEdgeType
{
    None = 0,
    Parent = 1,   // This person is the parent of the next
    Child = 2,    // This person is the child of the next
    Spouse = 3    // This person is the spouse of the next
}

/// <summary>
/// Information about a common ancestor
/// </summary>
public class CommonAncestorInfo
{
    public Guid PersonId { get; set; }
    public string PrimaryName { get; set; } = string.Empty;
    public int GenerationsFromPerson1 { get; set; }
    public int GenerationsFromPerson2 { get; set; }
}
