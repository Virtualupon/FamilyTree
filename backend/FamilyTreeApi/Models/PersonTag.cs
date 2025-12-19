using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class PersonTag
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid PersonId { get; set; }
    public Person? Person { get; set; }

    [Required]
    public Guid TagId { get; set; }
    public Tag Tag { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
