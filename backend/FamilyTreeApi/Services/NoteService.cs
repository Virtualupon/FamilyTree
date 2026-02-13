using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Services;

public interface INoteService
{
    Task<List<GetNoteDto>> GetNotesAsync(string entityType, Guid entityId, CancellationToken ct = default);
    Task<GetNoteDto?> GetNoteByIdAsync(Guid noteId, CancellationToken ct = default);
    Task<ServiceResult<GetNoteDto>> CreateNoteAsync(string entityType, Guid entityId, CreateNoteDto dto, long userId, CancellationToken ct = default);
    Task<ServiceResult<GetNoteDto>> UpdateNoteAsync(Guid noteId, UpdateNoteDto dto, long userId, CancellationToken ct = default);
    Task<ServiceResult> DeleteNoteAsync(Guid noteId, long userId, CancellationToken ct = default);
}

public class NoteService : INoteService
{
    private readonly ApplicationDbContext _context;

    public NoteService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<GetNoteDto>> GetNotesAsync(string entityType, Guid entityId, CancellationToken ct = default)
    {
        return await _context.EntityNotes
            .Where(n => n.EntityType == entityType && n.EntityId == entityId && !n.IsDeleted)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => MapToDto(n))
            .ToListAsync(ct);
    }

    public async Task<GetNoteDto?> GetNoteByIdAsync(Guid noteId, CancellationToken ct = default)
    {
        var note = await _context.EntityNotes
            .Where(n => n.Id == noteId && !n.IsDeleted)
            .FirstOrDefaultAsync(ct);

        return note == null ? null : MapToDto(note);
    }

    public async Task<ServiceResult<GetNoteDto>> CreateNoteAsync(string entityType, Guid entityId, CreateNoteDto dto, long userId, CancellationToken ct = default)
    {
        if (!NoteEntityTypes.All.Contains(entityType))
            return ServiceResult<GetNoteDto>.Failure($"Invalid entity type: {entityType}", ServiceErrorType.BadRequest);

        // Validate at least one language has content
        if (string.IsNullOrWhiteSpace(dto.NotesEn) && string.IsNullOrWhiteSpace(dto.NotesAr) && string.IsNullOrWhiteSpace(dto.NotesNob))
            return ServiceResult<GetNoteDto>.Failure("At least one language note is required", ServiceErrorType.BadRequest);

        var note = new EntityNote
        {
            EntityType = entityType,
            EntityId = entityId,
            NotesEn = dto.NotesEn?.Trim(),
            NotesAr = dto.NotesAr?.Trim(),
            NotesNob = dto.NotesNob?.Trim(),
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.EntityNotes.Add(note);
        await _context.SaveChangesAsync(ct);

        return ServiceResult<GetNoteDto>.Success(MapToDto(note));
    }

    public async Task<ServiceResult<GetNoteDto>> UpdateNoteAsync(Guid noteId, UpdateNoteDto dto, long userId, CancellationToken ct = default)
    {
        var note = await _context.EntityNotes
            .FirstOrDefaultAsync(n => n.Id == noteId && !n.IsDeleted, ct);

        if (note == null)
            return ServiceResult<GetNoteDto>.Failure("Note not found", ServiceErrorType.NotFound);

        if (dto.NotesEn != null) note.NotesEn = dto.NotesEn.Trim();
        if (dto.NotesAr != null) note.NotesAr = dto.NotesAr.Trim();
        if (dto.NotesNob != null) note.NotesNob = dto.NotesNob.Trim();
        note.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);

        return ServiceResult<GetNoteDto>.Success(MapToDto(note));
    }

    public async Task<ServiceResult> DeleteNoteAsync(Guid noteId, long userId, CancellationToken ct = default)
    {
        var note = await _context.EntityNotes
            .FirstOrDefaultAsync(n => n.Id == noteId && !n.IsDeleted, ct);

        if (note == null)
            return ServiceResult.Failure("Note not found", ServiceErrorType.NotFound);

        note.IsDeleted = true;
        note.DeletedAt = DateTime.UtcNow;
        note.DeletedByUserId = userId;

        await _context.SaveChangesAsync(ct);

        return ServiceResult.Success();
    }

    private static GetNoteDto MapToDto(EntityNote note)
    {
        return new GetNoteDto(
            Id: note.Id,
            EntityType: note.EntityType,
            EntityId: note.EntityId,
            NotesEn: note.NotesEn,
            NotesAr: note.NotesAr,
            NotesNob: note.NotesNob,
            CreatedByUserId: note.CreatedByUserId,
            CreatedByUserName: null, // Loaded separately if needed
            CreatedAt: note.CreatedAt,
            UpdatedAt: note.UpdatedAt
        );
    }
}
