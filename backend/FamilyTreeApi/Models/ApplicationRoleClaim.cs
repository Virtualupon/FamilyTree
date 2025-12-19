using Microsoft.AspNetCore.Identity;

namespace FamilyTreeApi.Models;

public class ApplicationRoleClaim : IdentityRoleClaim<long>
{
    public virtual ApplicationRole Role { get; set; } = null!;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
