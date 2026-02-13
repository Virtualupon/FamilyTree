namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Category of support ticket
/// </summary>
public enum TicketCategory
{
    Bug = 0,
    Enhancement = 1
}

/// <summary>
/// Priority level for support tickets
/// </summary>
public enum TicketPriority
{
    Low = 0,
    Medium = 1,
    High = 2
}

/// <summary>
/// Status lifecycle for support tickets: Open → WorkingOnIt → Resolved → Closed
/// </summary>
public enum TicketStatus
{
    Open = 0,
    WorkingOnIt = 1,
    Resolved = 2,
    Closed = 3
}
