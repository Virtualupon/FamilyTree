using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

public class PersonName
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid PersonId { get; set; }
    public Person Person { get; set; } = null!;

    [Required]
    [MaxLength(10)]
    public string Script { get; set; } = "Latin";

    [MaxLength(100)]
    public string? Given { get; set; }

    [MaxLength(100)]
    public string? Middle { get; set; }

    [MaxLength(100)]
    public string? Family { get; set; }

    [MaxLength(300)]
    public string? Full { get; set; }

    [MaxLength(300)]
    public string? Transliteration { get; set; }

    public NameType Type { get; set; } = NameType.Primary;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
