using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

public class ApplicationUser : IdentityUser<long>
{
    [MaxLength(100)]
    public string? FirstName { get; set; }

    [MaxLength(100)]
    public string? LastName { get; set; }

    [MaxLength(10)]
    public string PreferredLanguage { get; set; } = "en";

    /// <summary>
    /// The currently selected town for browsing family trees.
    /// Required for Admin and User roles after login.
    /// </summary>
    public Guid? SelectedTownId { get; set; }
    public Town? SelectedTown { get; set; }

    /// <summary>
    /// User's home town (where they are from).
    /// Optional field set during registration for community connection.
    /// </summary>
    public Guid? HomeTownId { get; set; }
    public Town? HomeTown { get; set; }

    /// <summary>
    /// Flag indicating user needs to complete onboarding (language selection).
    /// Set to FALSE after first setup.
    /// </summary>
    public bool IsFirstLogin { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Tracks last user activity (updated on token refresh).
    /// Used for admin dashboard "active users" reporting.
    /// </summary>
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;

    public virtual ICollection<ApplicationUserRole> UserRoles { get; set; } = new List<ApplicationUserRole>();
    
    public virtual ICollection<ApplicationUserClaim> Claims { get; set; } = new List<ApplicationUserClaim>();
    
    public virtual ICollection<ApplicationUserLogin> Logins { get; set; } = new List<ApplicationUserLogin>();
    
    public virtual ICollection<ApplicationUserToken> Tokens { get; set; } = new List<ApplicationUserToken>();

    public ICollection<OrgUser> OrgUsers { get; set; } = new List<OrgUser>();
    
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public ICollection<AdminTreeAssignment> AdminAssignments { get; set; } = new List<AdminTreeAssignment>();

    /// <summary>Town assignments for Admin-level users (town-scoped access)</summary>
    public ICollection<AdminTownAssignment> AdminTownAssignments { get; set; } = new List<AdminTownAssignment>();
}
