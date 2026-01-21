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
    SplitPerson = 7
}
