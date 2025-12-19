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

// Additional DTOs for service layer
public record UnionSearchDto(
    Guid? TreeId = null,
    UnionType? Type = null,
    Guid? PersonId = null,
    DateTime? StartDateFrom = null,
    DateTime? StartDateTo = null,
    Guid? PlaceId = null,
    int Page = 1,
    int PageSize = 20
);

public record UnionListItemDto(
    Guid Id,
    UnionType Type,
    DateTime? StartDate,
    DateTime? EndDate,
    string? StartPlace,
    List<UnionMemberSummaryDto> Members
);

public record UnionMemberSummaryDto(
    Guid PersonId,
    string? PersonName,
    string Role
);

public record UnionResponseDto(
    Guid Id,
    Guid OrgId,
    UnionType Type,
    DateTime? StartDate,
    DatePrecision StartPrecision,
    Guid? StartPlaceId,
    string? StartPlace,
    DateTime? EndDate,
    DatePrecision EndPrecision,
    Guid? EndPlaceId,
    string? EndPlace,
    string? Notes,
    List<UnionMemberDto> Members,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateUnionDto(
    Guid? TreeId = null,
    UnionType Type = UnionType.Marriage,
    DateTime? StartDate = null,
    DatePrecision StartPrecision = DatePrecision.Unknown,
    Guid? StartPlaceId = null,
    DateTime? EndDate = null,
    DatePrecision EndPrecision = DatePrecision.Unknown,
    Guid? EndPlaceId = null,
    string? Notes = null,
    List<Guid>? MemberIds = null
);

public record UpdateUnionDto(
    UnionType? Type = null,
    DateTime? StartDate = null,
    DatePrecision? StartPrecision = null,
    Guid? StartPlaceId = null,
    DateTime? EndDate = null,
    DatePrecision? EndPrecision = null,
    Guid? EndPlaceId = null,
    string? Notes = null
);

public record AddUnionMemberDto(Guid PersonId);

public record UnionChildDto(
    Guid ChildId,
    string? ChildName,
    Sex? Sex,
    DateTime? BirthDate,
    string? BirthPlace
);

public record AddUnionChildDto(Guid ChildId);