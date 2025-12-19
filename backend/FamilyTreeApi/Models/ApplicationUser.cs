using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class ApplicationUser : IdentityUser<long>
{
    [MaxLength(100)]
    public string? FirstName { get; set; }

    [MaxLength(100)]
    public string? LastName { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;

    public virtual ICollection<ApplicationUserRole> UserRoles { get; set; } = new List<ApplicationUserRole>();
    
    public virtual ICollection<ApplicationUserClaim> Claims { get; set; } = new List<ApplicationUserClaim>();
    
    public virtual ICollection<ApplicationUserLogin> Logins { get; set; } = new List<ApplicationUserLogin>();
    
    public virtual ICollection<ApplicationUserToken> Tokens { get; set; } = new List<ApplicationUserToken>();

    public ICollection<OrgUser> OrgUsers { get; set; } = new List<OrgUser>();
    
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public ICollection<AdminTreeAssignment> AdminAssignments { get; set; } = new List<AdminTreeAssignment>();
}
