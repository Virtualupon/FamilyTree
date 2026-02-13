#nullable enable
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API controller for managing notes on any entity (Person, Union, ParentChild, PersonMedia, PersonLink).
/// Notes are tri-language (NotesEn, NotesAr, NotesNob) and support one-to-many per entity.
/// </summary>
[ApiController]
[Route("api/notes")]
[Authorize]
public class NoteController : ControllerBase
{
    private readonly INoteService _noteService;
    private readonly ILogger<NoteController> _logger;

    public NoteController(INoteService noteService, ILogger<NoteController> logger)
    {
        _noteService = noteService;
        _logger = logger;
    }

    /// <summary>
    /// Get all notes for an entity.
    /// </summary>
    [HttpGet("{entityType}/{entityId}")]
    public async Task<IActionResult> GetNotes(string entityType, Guid entityId, CancellationToken ct)
    {
        var notes = await _noteService.GetNotesAsync(entityType, entityId, ct);
        return Ok(notes);
    }

    /// <summary>
    /// Get a specific note by ID.
    /// </summary>
    [HttpGet("by-id/{noteId}")]
    public async Task<IActionResult> GetNoteById(Guid noteId, CancellationToken ct)
    {
        var note = await _noteService.GetNoteByIdAsync(noteId, ct);
        if (note == null)
            return NotFound();
        return Ok(note);
    }

    /// <summary>
    /// Create a new note for an entity.
    /// </summary>
    [HttpPost("{entityType}/{entityId}")]
    public async Task<IActionResult> CreateNote(string entityType, Guid entityId, [FromBody] CreateNoteDto dto, CancellationToken ct)
    {
        var userId = GetUserId();
        if (userId == null)
            return Unauthorized();

        var result = await _noteService.CreateNoteAsync(entityType, entityId, dto, userId.Value, ct);
        if (!result.IsSuccess)
            return MapError(result);

        return CreatedAtAction(nameof(GetNoteById), new { noteId = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update an existing note.
    /// </summary>
    [HttpPut("{noteId}")]
    public async Task<IActionResult> UpdateNote(Guid noteId, [FromBody] UpdateNoteDto dto, CancellationToken ct)
    {
        var userId = GetUserId();
        if (userId == null)
            return Unauthorized();

        var result = await _noteService.UpdateNoteAsync(noteId, dto, userId.Value, ct);
        if (!result.IsSuccess)
            return MapError(result);

        return Ok(result.Data);
    }

    /// <summary>
    /// Delete a note (soft delete).
    /// </summary>
    [HttpDelete("{noteId}")]
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    public async Task<IActionResult> DeleteNote(Guid noteId, CancellationToken ct)
    {
        var userId = GetUserId();
        if (userId == null)
            return Unauthorized();

        var result = await _noteService.DeleteNoteAsync(noteId, userId.Value, ct);
        if (!result.IsSuccess)
            return MapError(result);

        return NoContent();
    }

    private long? GetUserId()
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return long.TryParse(userIdStr, out var id) ? id : null;
    }

    private IActionResult MapError(ServiceResult result)
    {
        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { error = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.InternalError => StatusCode(500, new { error = result.ErrorMessage }),
            _ => BadRequest(new { error = result.ErrorMessage })
        };
    }
}
