using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

// ============================================================================
// Suggestion DTOs - Request and Response objects for the Governance Model
// ============================================================================

#region Request DTOs

/// <summary>
/// Request to create a new relationship suggestion
/// </summary>
public record CreateSuggestionRequest(
    Guid TreeId,
    SuggestionType Type,
    Guid? TargetPersonId,
    Guid? SecondaryPersonId,
    Guid? TargetUnionId,
    Guid? TargetMediaId,
    Dictionary<string, object>? ProposedValues,
    RelationshipType? RelationshipType,
    UnionType? UnionType,
    ConfidenceLevel Confidence,
    string? SubmitterNotes,
    List<CreateEvidenceRequest>? Evidence
);

/// <summary>
/// Request to add evidence to a suggestion
/// </summary>
public record CreateEvidenceRequest(
    EvidenceType Type,
    Guid? MediaId,
    string? Url,
    string? UrlTitle,
    string? Description,
    int SortOrder = 0
);

/// <summary>
/// Request to add a comment to a suggestion
/// </summary>
public record CreateCommentRequest(
    string Content
);

/// <summary>
/// Request to update suggestion status (admin action)
/// </summary>
public record UpdateSuggestionStatusRequest(
    SuggestionStatus Status,
    string? StatusReason,
    string? ReviewerNotes
);

/// <summary>
/// Request to withdraw a suggestion (submitter action)
/// </summary>
public record WithdrawSuggestionRequest(
    string? Reason
);

/// <summary>
/// Query parameters for listing suggestions
/// </summary>
public record SuggestionQueryParams(
    Guid? TownId = null,
    Guid? TreeId = null,
    SuggestionStatus? Status = null,
    SuggestionType? Type = null,
    long? SubmittedByUserId = null,
    DateTime? FromDate = null,
    DateTime? ToDate = null,
    int Page = 1,
    int PageSize = 20,
    string SortBy = "CreatedAt",
    bool SortDesc = true
);

#endregion

#region Response DTOs

/// <summary>
/// Summary view of a suggestion for list displays
/// </summary>
public record SuggestionSummaryDto(
    Guid Id,
    SuggestionType Type,
    SuggestionStatus Status,
    ConfidenceLevel Confidence,
    DateTime CreatedAt,
    DateTime SubmittedAt,
    string? SubmitterNotes,
    // Town info
    Guid TownId,
    string TownName,
    string? TownNameEn,
    string? TownNameAr,
    // Tree info
    Guid TreeId,
    string TreeName,
    // Target person info
    Guid? TargetPersonId,
    string? TargetPersonName,
    // Secondary person info (for merge suggestions)
    Guid? SecondaryPersonId,
    string? SecondaryPersonName,
    // Submitter info
    long SubmittedByUserId,
    string SubmitterName,
    // Counts
    int EvidenceCount,
    int CommentCount
);

/// <summary>
/// Detailed view of a suggestion including all related data
/// </summary>
public record SuggestionDetailDto(
    Guid Id,
    SuggestionType Type,
    SuggestionStatus Status,
    string? StatusReason,
    ConfidenceLevel Confidence,
    DateTime CreatedAt,
    DateTime SubmittedAt,
    DateTime UpdatedAt,
    // Scope
    Guid TownId,
    string TownName,
    string? TownNameEn,
    string? TownNameAr,
    Guid TreeId,
    string TreeName,
    // Targets
    Guid? TargetPersonId,
    PersonSummaryDto? TargetPerson,
    Guid? SecondaryPersonId,
    PersonSummaryDto? SecondaryPerson,
    Guid? TargetUnionId,
    UnionSummaryDto? TargetUnion,
    // Proposed values
    Dictionary<string, object> ProposedValues,
    RelationshipType? RelationshipType,
    UnionType? UnionType,
    // Submitter
    long SubmittedByUserId,
    UserSummaryDto Submitter,
    string? SubmitterNotes,
    // Reviewer (if reviewed)
    long? ReviewedByUserId,
    UserSummaryDto? Reviewer,
    DateTime? ReviewedAt,
    string? ReviewerNotes,
    // Applied change tracking
    string? AppliedEntityType,
    Guid? AppliedEntityId,
    // Collections
    List<EvidenceDto> Evidence,
    List<CommentDto> Comments
);

/// <summary>
/// Evidence attachment DTO
/// </summary>
public record EvidenceDto(
    Guid Id,
    EvidenceType Type,
    Guid? MediaId,
    string? MediaUrl,
    string? MediaThumbnailUrl,
    string? Url,
    string? UrlTitle,
    string? Description,
    int SortOrder,
    DateTime CreatedAt
);

/// <summary>
/// Comment DTO
/// </summary>
public record CommentDto(
    Guid Id,
    long AuthorUserId,
    string AuthorName,
    string? AuthorAvatarUrl,
    string Content,
    bool IsAdminComment,
    DateTime CreatedAt
);

/// <summary>
/// Person summary for suggestion display
/// </summary>
public record PersonSummaryDto(
    Guid Id,
    string? PrimaryName,
    string? NameArabic,
    string? NameEnglish,
    string? Gender,
    string? BirthDate,
    string? DeathDate,
    string? AvatarUrl
);

/// <summary>
/// Union summary for suggestion display
/// </summary>
public record UnionSummaryDto(
    Guid Id,
    UnionType Type,
    string? StartDate,
    string? EndDate,
    List<PersonSummaryDto> Members
);

/// <summary>
/// User summary for suggestion display
/// </summary>
public record UserSummaryDto(
    long Id,
    string Name,
    string? Email,
    string? AvatarUrl
);

/// <summary>
/// Paginated response for suggestion lists
/// </summary>
public record SuggestionListResponse(
    List<SuggestionSummaryDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

/// <summary>
/// Statistics response for suggestion dashboard
/// </summary>
public record SuggestionStatsDto(
    long TotalCount,
    long PendingCount,
    long ApprovedCount,
    long RejectedCount,
    long NeedsInfoCount,
    long WithdrawnCount,
    decimal? AvgReviewTimeHours,
    int OldestPendingDays
);

/// <summary>
/// Response for duplicate check
/// </summary>
public record DuplicateCheckResponse(
    bool HasDuplicate,
    Guid? ExistingSuggestionId,
    DateTime? SubmittedAt,
    string? SubmitterName
);

/// <summary>
/// Pending suggestions count by town for admin dashboard
/// </summary>
public record PendingByTownDto(
    Guid TownId,
    string TownName,
    string? TownNameEn,
    string? TownNameAr,
    long PendingCount,
    DateTime? OldestPendingAt
);

#endregion

#region Proposed Values DTOs

/// <summary>
/// Proposed values for AddPerson suggestion
/// </summary>
public record ProposedPersonValues(
    string? PrimaryName,
    string? NameArabic,
    string? NameEnglish,
    string? NameNobiin,
    string? Gender,
    string? BirthDate,
    string? BirthDateType,
    Guid? BirthPlaceId,
    string? DeathDate,
    string? DeathDateType,
    Guid? DeathPlaceId,
    string? Occupation,
    List<CreateNoteDto>? Notes = null
);

/// <summary>
/// Proposed values for UpdatePerson suggestion
/// </summary>
public record ProposedPersonUpdateValues(
    string? PrimaryName,
    string? NameArabic,
    string? NameEnglish,
    string? NameNobiin,
    string? Gender,
    string? BirthDate,
    string? BirthDateType,
    Guid? BirthPlaceId,
    string? DeathDate,
    string? DeathDateType,
    Guid? DeathPlaceId,
    string? Occupation,
    // What fields are being updated
    List<string> ChangedFields,
    List<CreateNoteDto>? Notes = null
);

/// <summary>
/// Proposed values for AddParent/AddChild suggestion
/// </summary>
public record ProposedRelationshipValues(
    RelationshipType RelationshipType,
    ConfidenceLevel Confidence,
    List<CreateNoteDto>? Notes = null
);

/// <summary>
/// Proposed values for AddSpouse suggestion
/// </summary>
public record ProposedUnionValues(
    UnionType UnionType,
    string? StartDate,
    string? StartDateType,
    Guid? StartPlaceId,
    string? EndDate,
    string? EndDateType,
    Guid? EndPlaceId,
    List<CreateNoteDto>? Notes = null
);

/// <summary>
/// Proposed values for MergePerson suggestion
/// </summary>
public record ProposedMergeValues(
    Guid SurvivingPersonId,
    Guid MergingPersonId,
    string? MergeReason,
    // Which fields to keep from which person
    Dictionary<string, string> FieldSourcePreferences
);

#endregion

#region Convenience Request DTOs

/// <summary>
/// Simplified request to suggest adding a new person
/// </summary>
public record SuggestAddPersonRequest(
    Guid TreeId,
    string PrimaryName,
    string? NameEnglish,
    string? NameArabic,
    string? Sex,
    string? BirthDate,
    string? BirthPlace,
    string? DeathDate,
    string? DeathPlace,
    string? Occupation,
    // Optional relationship
    Guid? RelatedPersonId,
    string? RelationshipType, // "parent", "child", "spouse"
    ConfidenceLevel Confidence = ConfidenceLevel.Probable,
    string? SubmitterNotes = null
);

/// <summary>
/// Simplified request to suggest adding a relationship
/// </summary>
public record SuggestAddRelationshipRequest(
    Guid TreeId,
    Guid Person1Id,
    Guid Person2Id,
    string RelationshipType, // "parent-child", "spouse"
    // For parent-child: who is the parent?
    bool Person1IsParent = true,
    // For spouse
    string? MarriageDate = null,
    string? MarriagePlace = null,
    ConfidenceLevel Confidence = ConfidenceLevel.Probable,
    string? SubmitterNotes = null
);

/// <summary>
/// Response after submitting a suggestion
/// </summary>
public record SuggestionSubmittedResponse(
    Guid SuggestionId,
    string Status,
    string Message,
    DateTime SubmittedAt
);

#endregion
