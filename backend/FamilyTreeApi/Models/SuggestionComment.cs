using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Conversation thread between suggestion submitter and admin reviewers
/// </summary>
public class SuggestionComment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SuggestionId { get; set; }
    public RelationshipSuggestion Suggestion { get; set; } = null!;

    [Required]
    public long AuthorUserId { get; set; }
    public ApplicationUser AuthorUser { get; set; } = null!;

    [Required]
    [MaxLength(2000)]
    public string Content { get; set; } = string.Empty;

    /// <summary>
    /// TRUE if comment is from an admin/reviewer, FALSE if from the submitter
    /// </summary>
    public bool IsAdminComment { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
