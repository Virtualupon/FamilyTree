using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Image attachment on a support ticket.
/// Files stored via VirtualUpon.Storage at path: support-tickets/{ticketId}/{fileName}
/// </summary>
public class SupportTicketAttachment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TicketId { get; set; }
    public SupportTicket Ticket { get; set; } = null!;

    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string StorageKey { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? MimeType { get; set; }

    public long FileSize { get; set; }

    public long UploadedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
