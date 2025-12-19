using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

public class CreateParentChildRequest
{
    public Guid ParentId { get; set; }
    public Guid ChildId { get; set; }
    public RelationshipType RelationshipType { get; set; } = RelationshipType.Biological;
}

public class UpdateParentChildRequest
{
    public RelationshipType RelationshipType { get; set; }
}

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
    public DateTime CreatedAt { get; set; }
}

public class PersonRelationshipsResponse
{
    public Guid PersonId { get; set; }
    public string? PersonName { get; set; }
    public List<ParentChildResponse> AsParent { get; set; } = new();
    public List<ParentChildResponse> AsChild { get; set; } = new();
    public List<UnionResponse> Unions { get; set; } = new();
}
