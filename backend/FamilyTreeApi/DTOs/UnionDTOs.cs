using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

public class CreateUnionRequest
{
    public UnionType Type { get; set; } = UnionType.Marriage;
    public DateTime? StartDate { get; set; }
    public DatePrecision StartPrecision { get; set; } = DatePrecision.Unknown;
    public Guid? StartPlaceId { get; set; }
    public DateTime? EndDate { get; set; }
    public DatePrecision EndPrecision { get; set; } = DatePrecision.Unknown;
    public Guid? EndPlaceId { get; set; }
    public string? Notes { get; set; }
    public List<Guid> MemberIds { get; set; } = new();
}

public class UpdateUnionRequest
{
    public UnionType? Type { get; set; }
    public DateTime? StartDate { get; set; }
    public DatePrecision? StartPrecision { get; set; }
    public Guid? StartPlaceId { get; set; }
    public DateTime? EndDate { get; set; }
    public DatePrecision? EndPrecision { get; set; }
    public Guid? EndPlaceId { get; set; }
    public string? Notes { get; set; }
}

public class AddUnionMemberRequest
{
    public Guid PersonId { get; set; }
}

public class UnionMemberDto
{
    public Guid Id { get; set; }
    public Guid PersonId { get; set; }
    public string? PersonName { get; set; }
    public Sex? Sex { get; set; }
}

public class UnionResponse
{
    public Guid Id { get; set; }
    public Guid OrgId { get; set; }
    public UnionType Type { get; set; }
    public DateTime? StartDate { get; set; }
    public DatePrecision StartPrecision { get; set; }
    public Guid? StartPlaceId { get; set; }
    public string? StartPlace { get; set; }
    public DateTime? EndDate { get; set; }
    public DatePrecision EndPrecision { get; set; }
    public Guid? EndPlaceId { get; set; }
    public string? EndPlace { get; set; }
    public string? Notes { get; set; }
    public List<UnionMemberDto> Members { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class UnionSearchRequest
{
    public Guid? TreeId { get; set; }  // For SuperAdmin/Admin to specify which tree
    public UnionType? Type { get; set; }
    public Guid? PersonId { get; set; }
    public DateTime? StartDateFrom { get; set; }
    public DateTime? StartDateTo { get; set; }
    public Guid? PlaceId { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}