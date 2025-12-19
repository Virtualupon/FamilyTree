using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class Source
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }
    public Org? Org { get; set; }

    [Required]
    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Repository { get; set; }

    public string? Citation { get; set; }

    [MaxLength(500)]
    public string? Url { get; set; }

    public string? MetadataJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
