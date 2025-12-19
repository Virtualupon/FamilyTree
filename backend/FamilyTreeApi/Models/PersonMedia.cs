using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Links media files to people (many-to-many)
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

    /// <summary>Notes about this person in the media (e.g., position in group photo)</summary>
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
