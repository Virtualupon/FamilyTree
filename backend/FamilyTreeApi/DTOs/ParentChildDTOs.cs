using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// Request DTOs for ParentChild API endpoints
public class AddParentChildRequest
{
    public RelationshipType? RelationshipType { get; set; }
    public string? Notes { get; set; }
}

public class UpdateParentChildRequest
{
    public RelationshipType? RelationshipType { get; set; }
    public string? Notes { get; set; }
}

// Response DTOs for ParentChild API endpoints
public class ParentChildResponse
{
    public Guid Id { get; set; }
    public Guid ParentId { get; set; }
    public string? ParentName { get; set; }
    public Sex? ParentSex { get; set; }
    public Guid ChildId { get; set; }
    public string? ChildName { get; set; }
    public Sex? ChildSex { get; set; }
    public RelationshipType RelationshipType { get; set; }
    public string? Notes { get; set; }
}

public class SiblingResponse
{
    public Guid PersonId { get; set; }
    public string? PersonName { get; set; }
    public Sex? PersonSex { get; set; }
    public int SharedParentCount { get; set; }
    public bool IsFullSibling { get; set; }
    public bool IsHalfSibling { get; set; }
}

public class PersonRelationshipsResponse
{
    public Guid PersonId { get; set; }
    public string? PersonName { get; set; }
    public List<ParentChildResponse> AsParent { get; set; } = new();
    public List<ParentChildResponse> AsChild { get; set; } = new();
    public List<UnionResponse> Unions { get; set; } = new();
}

// Additional DTOs for service layer
public record ParentChildSearchDto(
    Guid? TreeId = null,
    Guid? ParentId = null,
    Guid? ChildId = null,
    RelationshipType? Type = null,
    int Page = 1,
    int PageSize = 20
);

public record ParentChildListItemDto(
    Guid Id,
    Guid ParentId,
    string? ParentName,
    Sex? ParentSex,
    Guid ChildId,
    string? ChildName,
    Sex? ChildSex,
    RelationshipType Type,
    DateTime CreatedAt
);

public record ParentChildDto(
    Guid PersonId,
    string? PersonName,
    Sex? Sex,
    DateTime? BirthDate,
    string? BirthPlace
);

public record ParentChildResponseDto(
    Guid Id,
    Guid ParentId,
    string? ParentName,
    Sex? ParentSex,
    Guid ChildId,
    string? ChildName,
    Sex? ChildSex,
    RelationshipType Type,
    DateTime CreatedAt
);

public record CreateParentChildDto(
    Guid? TreeId = null,
    Guid ParentId = default,
    Guid ChildId = default,
    RelationshipType Type = RelationshipType.Biological
);

public record UpdateParentChildDto(
    RelationshipType? Type = null
);

// Additional DTOs for PersonLinkService
public record PersonSearchResultDto(
    Guid Id,
    string? PrimaryName,
    Sex? Sex,
    DateTime? BirthDate,
    DateTime? DeathDate,
    Guid TreeId,
    string TreeName
);
