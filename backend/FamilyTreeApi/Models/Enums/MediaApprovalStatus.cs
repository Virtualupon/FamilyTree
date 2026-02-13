namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Approval status for uploaded media.
/// Approved = 0 intentionally so existing rows (default int 0) are automatically approved.
/// </summary>
public enum MediaApprovalStatus
{
    Approved = 0,
    Pending = 1,
    Rejected = 2
}
