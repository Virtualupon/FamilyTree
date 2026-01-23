using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Junction table linking Media files to People (many-to-many).
/// A single media file can be linked to multiple persons.
/// </summary>
public class PersonMedia
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid PersonId { get; set; }
    public Person Person { get; set; } = null!;

    [Required]
    public Guid MediaId { get; set; }
    public Media Media { get; set; } = null!;

    /// <summary>Is this the primary/profile photo for this person?</summary>
    public bool IsPrimary { get; set; } = false;

    /// <summary>Display order when showing person's media</summary>
    public int SortOrder { get; set; } = 0;

    /// <summary>Notes about this person in the media in English (or original input language)</summary>
    public string? Notes { get; set; }

    /// <summary>Notes in Arabic (auto-translated)</summary>
    public string? NotesAr { get; set; }

    /// <summary>Notes in Nobiin (auto-translated)</summary>
    public string? NotesNob { get; set; }

    /// <summary>When this record was created</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When this person was linked to this media</summary>
    public DateTime LinkedAt { get; set; } = DateTime.UtcNow;
}
