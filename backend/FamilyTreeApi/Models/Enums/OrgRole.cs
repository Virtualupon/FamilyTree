namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Tree-specific roles that determine permissions within a family tree
/// </summary>
public enum OrgRole
{
    /// <summary>Can view tree data only</summary>
    Viewer = 0,
    
    /// <summary>Can add new people and basic edits</summary>
    Contributor = 1,
    
    /// <summary>Can edit existing data, add relationships</summary>
    Editor = 2,
    
    /// <summary>Can manage people, relationships, approve changes within the tree</summary>
    SubAdmin = 3,
    
    /// <summary>Full admin access to the tree, can manage SubAdmins</summary>
    Admin = 4,
    
    /// <summary>Tree owner - full control including deletion</summary>
    Owner = 5
}
