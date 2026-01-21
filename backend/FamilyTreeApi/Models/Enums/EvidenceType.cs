namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Types of evidence that can be attached to suggestions
/// </summary>
public enum EvidenceType
{
    /// <summary>Photo/image file</summary>
    Photo = 0,

    /// <summary>Document file (PDF, DOC, etc.)</summary>
    Document = 1,

    /// <summary>Audio recording</summary>
    Audio = 2,

    /// <summary>Video recording</summary>
    Video = 3,

    /// <summary>URL/web link</summary>
    Url = 4,

    /// <summary>Other media type</summary>
    OtherMedia = 5
}
