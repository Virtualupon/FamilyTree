using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Comment in a support ticket conversation thread.
/// IsAdminResponse distinguishes admin replies from user messages.
/// </summary>
public class SupportTicketComment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TicketId { get; set; }
    public SupportTicket Ticket { get; set; } = null!;

    [Required]
    public string Content { get; set; } = string.Empty;

    /// <summary>
    /// True if this comment was posted by a SuperAdmin/Developer
    /// </summary>
    public bool IsAdminResponse { get; set; } = false;

    [Required]
    public long AuthorUserId { get; set; }
    public ApplicationUser AuthorUser { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
}
