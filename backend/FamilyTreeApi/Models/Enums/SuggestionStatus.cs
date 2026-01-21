namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Status workflow for relationship suggestions
/// </summary>
public enum SuggestionStatus
{
    /// <summary>Awaiting admin review</summary>
    Pending = 0,

    /// <summary>Approved and applied to canonical tree</summary>
    Approved = 1,

    /// <summary>Rejected by admin</summary>
    Rejected = 2,

    /// <summary>Admin requested more information from submitter</summary>
    NeedsInfo = 3,

    /// <summary>Withdrawn by submitter</summary>
    Withdrawn = 4
}
