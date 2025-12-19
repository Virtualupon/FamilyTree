using Microsoft.AspNetCore.Identity;

namespace FamilyTreeApi.Models;

public class ApplicationUserToken : IdentityUserToken<long>
{
    public virtual ApplicationUser User { get; set; } = null!;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
