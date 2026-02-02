namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Types of relationship suggestions that viewers can submit
/// </summary>
public enum SuggestionType
{
    /// <summary>Add a new person to the tree</summary>
    AddPerson = 0,

    /// <summary>Update existing person's information</summary>
    UpdatePerson = 1,

    /// <summary>Add a parent relationship to an existing person</summary>
    AddParent = 2,

    /// <summary>Add a child relationship to an existing person</summary>
    AddChild = 3,

    /// <summary>Add a spouse/union relationship</summary>
    AddSpouse = 4,

    /// <summary>Suggest removing a relationship</summary>
    RemoveRelationship = 5,

    /// <summary>Suggest that two people are actually the same person</summary>
    MergePerson = 6,

    /// <summary>Suggest that one person record is actually two different people</summary>
    SplitPerson = 7,

    // ============================================================================
    // Phase 1: Delete and Union Management
    // ============================================================================

    /// <summary>Suggest deleting a person (cascade removes all relationships)</summary>
    DeletePerson = 8,

    /// <summary>Suggest updating union/marriage details</summary>
    UpdateUnion = 9,

    /// <summary>Suggest deleting/ending a union</summary>
    DeleteUnion = 10,

    // ============================================================================
    // Phase 2: Media Management
    // ============================================================================

    /// <summary>Suggest adding media to a person</summary>
    AddMedia = 11,

    /// <summary>Suggest setting a person's avatar</summary>
    SetAvatar = 12,

    /// <summary>Suggest removing media from a person</summary>
    RemoveMedia = 13,

    /// <summary>Suggest linking existing media to a person</summary>
    LinkMediaToPerson = 14,

}
