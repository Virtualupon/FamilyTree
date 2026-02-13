using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Centralized notes table supporting one-to-many notes per entity.
/// Replaces inline Notes/NotesAr/NotesNob on Person, Union, ParentChild, PersonMedia, PersonLink.
/// </summary>
public class EntityNote
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The type of entity this note belongs to:
    /// Person, Union, ParentChild, PersonMedia, PersonLink
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string EntityType { get; set; } = string.Empty;

    /// <summary>
    /// The ID of the entity this note belongs to.
    /// </summary>
    [Required]
    public Guid EntityId { get; set; }

    /// <summary>Notes in English</summary>
    public string? NotesEn { get; set; }

    /// <summary>Notes in Arabic</summary>
    public string? NotesAr { get; set; }

    /// <summary>Notes in Nobiin</summary>
    public string? NotesNob { get; set; }

    /// <summary>User who created this note</summary>
    public long? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Soft delete
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    public long? DeletedByUserId { get; set; }
    public ApplicationUser? DeletedByUser { get; set; }
}

/// <summary>
/// Allowed entity types for notes.
/// </summary>
public static class NoteEntityTypes
{
    public const string Person = "Person";
    public const string Union = "Union";
    public const string ParentChild = "ParentChild";
    public const string PersonMedia = "PersonMedia";
    public const string PersonLink = "PersonLink";

    public static readonly string[] All = { Person, Union, ParentChild, PersonMedia, PersonLink };
}
