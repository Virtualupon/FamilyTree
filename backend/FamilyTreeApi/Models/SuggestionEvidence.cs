using System.ComponentModel.DataAnnotations;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Models;

/// <summary>
/// Evidence attachments supporting suggestions (photos, documents, audio, video, URLs)
/// </summary>
public class SuggestionEvidence
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SuggestionId { get; set; }
    public RelationshipSuggestion Suggestion { get; set; } = null!;

    [Required]
    public EvidenceType Type { get; set; }

    /// <summary>
    /// Reference to uploaded media file in MediaFiles table
    /// </summary>
    public Guid? MediaId { get; set; }
    public Media? Media { get; set; }

    /// <summary>
    /// URL for web-based evidence
    /// </summary>
    [MaxLength(2000)]
    public string? Url { get; set; }

    [MaxLength(200)]
    public string? UrlTitle { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public int SortOrder { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
