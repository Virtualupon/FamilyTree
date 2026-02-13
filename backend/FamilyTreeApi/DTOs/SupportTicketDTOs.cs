using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// ============================================================================
// Request DTOs (classes for model binding)
// ============================================================================

public class CreateSupportTicketRequest
{
    [Required]
    public TicketCategory Category { get; set; }

    [Required]
    [MaxLength(200)]
    public string Subject { get; set; } = string.Empty;

    [Required]
    public string Description { get; set; } = string.Empty;

    public string? StepsToReproduce { get; set; }

    [MaxLength(500)]
    public string? PageUrl { get; set; }

    [MaxLength(500)]
    public string? BrowserInfo { get; set; }
}

public class UpdateTicketStatusRequest
{
    [Required]
    public TicketStatus Status { get; set; }
    public string? ResolutionNotes { get; set; }
}

public class AssignTicketRequest
{
    [Required]
    public long AssignedToUserId { get; set; }
}

public class UpdateTicketPriorityRequest
{
    [Required]
    public TicketPriority Priority { get; set; }
}

public class AddTicketCommentRequest
{
    [Required]
    public string Content { get; set; } = string.Empty;
}

public class UpdateAdminNotesRequest
{
    public string? AdminNotes { get; set; }
}

public class SupportTicketQueryParams
{
    public TicketCategory? Category { get; set; }
    public TicketPriority? Priority { get; set; }
    public TicketStatus? Status { get; set; }
    public long? AssignedToUserId { get; set; }
    public string? SearchTerm { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string SortBy { get; set; } = "CreatedAt";
    public bool SortDesc { get; set; } = true;
}

// ============================================================================
// Response DTOs (records for immutability)
// ============================================================================

public record SupportTicketSummaryDto(
    Guid Id,
    int TicketNumber,
    TicketCategory Category,
    TicketPriority Priority,
    TicketStatus Status,
    string Subject,
    DateTime SubmittedAt,
    long SubmittedByUserId,
    string SubmitterName,
    string? SubmitterEmail,
    long? AssignedToUserId,
    string? AssignedToName,
    int AttachmentCount,
    int CommentCount,
    DateTime? ResolvedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record SupportTicketDetailDto(
    Guid Id,
    int TicketNumber,
    TicketCategory Category,
    TicketPriority Priority,
    TicketStatus Status,
    string Subject,
    string Description,
    string? StepsToReproduce,
    string? PageUrl,
    string? BrowserInfo,
    DateTime SubmittedAt,
    long SubmittedByUserId,
    string SubmitterName,
    string? SubmitterEmail,
    long? AssignedToUserId,
    string? AssignedToName,
    string? AdminNotes,          // null for non-admins
    DateTime? ResolvedAt,
    long? ResolvedByUserId,
    string? ResolvedByName,
    string? ResolutionNotes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<TicketAttachmentDto> Attachments,
    List<TicketCommentDto> Comments
);

public record TicketAttachmentDto(
    Guid Id,
    string FileName,
    string Url,
    string? MimeType,
    long FileSize,
    long UploadedByUserId,
    DateTime CreatedAt
);

public record TicketCommentDto(
    Guid Id,
    string Content,
    bool IsAdminResponse,
    long AuthorUserId,
    string AuthorName,
    DateTime CreatedAt
);

public record SupportTicketStatsDto(
    int TotalCount,
    int OpenCount,
    int WorkingOnItCount,
    int ResolvedCount,
    int ClosedCount,
    double? AvgResolutionTimeHours
);
