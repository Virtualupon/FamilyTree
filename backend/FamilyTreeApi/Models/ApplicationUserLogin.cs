using Microsoft.AspNetCore.Identity;

namespace FamilyTreeApi.Models;

public class ApplicationUserLogin : IdentityUserLogin<long>
{
    public virtual ApplicationUser User { get; set; } = null!;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
