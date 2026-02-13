namespace FamilyTreeApi.DTOs;

/// <summary>
/// DTO for returning a note.
/// </summary>
public record GetNoteDto(
    Guid Id,
    string EntityType,
    Guid EntityId,
    string? NotesEn,
    string? NotesAr,
    string? NotesNob,
    long? CreatedByUserId,
    string? CreatedByUserName,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>
/// DTO for creating a new note.
/// </summary>
public class CreateNoteDto
{
    public string? NotesEn { get; set; }
    public string? NotesAr { get; set; }
    public string? NotesNob { get; set; }
}

/// <summary>
/// DTO for updating an existing note.
/// </summary>
public class UpdateNoteDto
{
    public string? NotesEn { get; set; }
    public string? NotesAr { get; set; }
    public string? NotesNob { get; set; }
}
