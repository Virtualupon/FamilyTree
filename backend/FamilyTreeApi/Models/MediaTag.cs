using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class MediaTag
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid MediaId { get; set; }
    public Media Media { get; set; } = null!;

    [Required]
    public Guid TagId { get; set; }
    public Tag Tag { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
