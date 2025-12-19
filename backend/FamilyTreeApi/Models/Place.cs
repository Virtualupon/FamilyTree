using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class Place
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }
    public Org? Org { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Type { get; set; }

    public Guid? ParentId { get; set; }
    public Place? Parent { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string? AltNamesJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Place> Children { get; set; } = new List<Place>();
}
