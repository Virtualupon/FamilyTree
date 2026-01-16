using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

public class TreePersonNode
{
    public Guid Id { get; set; }
    public string PrimaryName { get; set; } = string.Empty;
    public string? NameArabic { get; set; }
    public string? NameEnglish { get; set; }
    public string? NameNobiin { get; set; }
    public Sex Sex { get; set; }
    public DateTime? BirthDate { get; set; }
    public string? BirthPlace { get; set; }
    public DateTime? DeathDate { get; set; }
    public string? DeathPlace { get; set; }
    public bool IsLiving { get; set; }
    public string? ThumbnailUrl { get; set; }
    public Guid? AvatarMediaId { get; set; }
    public List<TreePersonNode> Parents { get; set; } = new();
    public List<TreePersonNode> Children { get; set; } = new();
    public List<TreeUnionNode> Unions { get; set; } = new();
    public bool HasMoreAncestors { get; set; }
    public bool HasMoreDescendants { get; set; }
}

public class TreeUnionNode
{
    public Guid Id { get; set; }
    public UnionType Type { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? StartPlace { get; set; }
    public List<TreePersonNode> Partners { get; set; } = new();
    public List<TreePersonNode> Children { get; set; } = new();
}

public class PedigreeRequest
{
    public Guid PersonId { get; set; }
    public int Generations { get; set; } = 4;
    public bool IncludeSpouses { get; set; } = true;
}

public class DescendantRequest
{
    public Guid PersonId { get; set; }
    public int Generations { get; set; } = 3;
    public bool IncludeSpouses { get; set; } = true;
}

public class AncestorPathRequest
{
    public Guid PersonId { get; set; }
    public Guid AncestorId { get; set; }
}

public class AncestorPathResponse
{
    public List<PathNode> Path { get; set; } = new();
    public int GenerationDistance { get; set; }
}

public class PathNode
{
    public Guid PersonId { get; set; }
    public string PrimaryName { get; set; } = string.Empty;
    public string Relationship { get; set; } = string.Empty;
}

public class HourglassRequest
{
    public Guid PersonId { get; set; }
    public int AncestorGenerations { get; set; } = 3;
    public int DescendantGenerations { get; set; } = 2;
    public bool IncludeSpouses { get; set; } = true;
}

public class HourglassResponse
{
    public TreePersonNode RootPerson { get; set; } = null!;
    public List<TreePersonNode> Ancestors { get; set; } = new();
    public List<TreePersonNode> Descendants { get; set; } = new();
}

public class RelationshipCalculationRequest
{
    public Guid Person1Id { get; set; }
    public Guid Person2Id { get; set; }
}

public class RelationshipCalculationResponse
{
    public string Relationship { get; set; } = string.Empty;
    public int CommonAncestorCount { get; set; }
    public List<CommonAncestor> CommonAncestors { get; set; } = new();
}

public class CommonAncestor
{
    public Guid PersonId { get; set; }
    public string PrimaryName { get; set; } = string.Empty;
    public int GenerationsFromPerson1 { get; set; }
    public int GenerationsFromPerson2 { get; set; }
}

public class TreeViewRequest
{
    public Guid PersonId { get; set; }
    public Guid? TreeId { get; set; }
    public int? Generations { get; set; }
}

public class FamilyGroupResponse
{
    public TreePersonNode Person { get; set; } = null!;
    public List<TreePersonNode> Parents { get; set; } = new();
    public List<SpouseInfo> Spouses { get; set; } = new();
    public List<TreePersonNode> Children { get; set; } = new();
}

public class SpouseInfo
{
    public TreePersonNode Person { get; set; } = null!;
    public Guid UnionId { get; set; }
    public UnionType UnionType { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
}

public class RelationshipResponse
{
    public Guid Person1Id { get; set; }
    public Guid Person2Id { get; set; }
    public string RelationshipType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int? GenerationsFromCommonAncestor1 { get; set; }
    public int? GenerationsFromCommonAncestor2 { get; set; }
    public List<Guid> CommonAncestors { get; set; } = new();
}
