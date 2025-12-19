using Microsoft.AspNetCore.Identity;

namespace FamilyTreeApi.Models;

public class ApplicationUserRole : IdentityUserRole<long>
{
    public virtual ApplicationUser User { get; set; } = null!;
    
    public virtual ApplicationRole Role { get; set; } = null!;
    
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    
    public long? AssignedBy { get; set; }
}
