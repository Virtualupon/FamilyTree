using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

public class OrgUser
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }
    public Org Org { get; set; } = null!;

    [Required]
    public long UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    [Required]
    public OrgRole Role { get; set; } = OrgRole.Viewer;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
