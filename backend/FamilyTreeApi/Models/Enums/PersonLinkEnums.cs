namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Type of link between persons across different trees
/// </summary>
public enum PersonLinkType
{
    /// <summary>Both records represent the same person</summary>
    SamePerson = 0,
    
    /// <summary>Source person is a descendant of target person</summary>
    Ancestor = 1,
    
    /// <summary>General family relation (cousins, etc.)</summary>
    Related = 2
}

/// <summary>
/// Approval status for cross-tree person links
/// </summary>
public enum PersonLinkStatus
{
    /// <summary>Awaiting approval from target tree admin</summary>
    Pending = 0,
    
    /// <summary>Link has been approved</summary>
    Approved = 1,
    
    /// <summary>Link has been rejected</summary>
    Rejected = 2
}

/// <summary>
/// Media category types
/// </summary>
public enum MediaCategory
{
    Photo = 0,
    Video = 1,
    Document = 2,
    Audio = 3,
    Other = 4
}
