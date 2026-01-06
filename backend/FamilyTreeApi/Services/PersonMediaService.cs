using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service implementation for PersonMedia many-to-many operations
/// </summary>
public class PersonMediaService : IPersonMediaService
{
    private readonly IPersonMediaRepository _personMediaRepository;
    private readonly IFileStorageService _fileStorage;
    private readonly IMediaService _mediaService;
    private readonly ILogger<PersonMediaService> _logger;

    // Allowed MIME types per media kind
    private static readonly Dictionary<string, MediaKind> MimeTypeToKind = new(StringComparer.OrdinalIgnoreCase)
    {
        { "image/jpeg", MediaKind.Image },
        { "image/png", MediaKind.Image },
        { "image/gif", MediaKind.Image },
        { "image/webp", MediaKind.Image },
        { "audio/mpeg", MediaKind.Audio },
        { "audio/mp3", MediaKind.Audio },
        { "audio/wav", MediaKind.Audio },
        { "audio/ogg", MediaKind.Audio },
        { "audio/webm", MediaKind.Audio },
        { "video/mp4", MediaKind.Video },
        { "video/webm", MediaKind.Video },
        { "video/ogg", MediaKind.Video }
    };

    // Size limits in bytes
    private static readonly Dictionary<MediaKind, long> MaxSizeBytes = new()
    {
        { MediaKind.Image, 10L * 1024 * 1024 },    // 10 MB
        { MediaKind.Audio, 50L * 1024 * 1024 },    // 50 MB
        { MediaKind.Video, 100L * 1024 * 1024 },   // 100 MB
        { MediaKind.Document, 20L * 1024 * 1024 }  // 20 MB
    };

    public PersonMediaService(
        IPersonMediaRepository personMediaRepository,
        IFileStorageService fileStorage,
        IMediaService mediaService,
        ILogger<PersonMediaService> logger)
    {
        _personMediaRepository = personMediaRepository;
        _fileStorage = fileStorage;
        _mediaService = mediaService;
        _logger = logger;
    }

    // ========================================================================
    // UPLOAD OPERATIONS
    // ========================================================================

    public async Task<ServiceResult<MediaWithPersonsDto>> UploadMediaAsync(
        MediaUploadWithPersonsDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check authorization
            if (!userContext.CanContribute())
            {
                return ServiceResult<MediaWithPersonsDto>.Forbidden("You don't have permission to upload media");
            }

            // Validate person IDs
            if (dto.PersonIds == null || dto.PersonIds.Count == 0)
            {
                return ServiceResult<MediaWithPersonsDto>.Failure("At least one person must be specified");
            }

            // Validate all persons exist
            foreach (var personId in dto.PersonIds)
            {
                if (!await _personMediaRepository.PersonExistsAsync(personId, cancellationToken))
                {
                    return ServiceResult<MediaWithPersonsDto>.NotFound($"Person {personId} not found");
                }
            }

            // Validate MIME type
            if (!MimeTypeToKind.TryGetValue(dto.MimeType, out var mediaKind))
            {
                return ServiceResult<MediaWithPersonsDto>.Failure(
                    $"Unsupported MIME type: {dto.MimeType}. Allowed: {string.Join(", ", MimeTypeToKind.Keys)}");
            }

            // Convert Base64 to bytes
            byte[] fileData;
            try
            {
                fileData = Base64ToBytes(dto.Base64Data);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Invalid Base64 data received");
                return ServiceResult<MediaWithPersonsDto>.Failure("Invalid Base64 data");
            }

            // Validate file size
            if (MaxSizeBytes.TryGetValue(mediaKind, out var maxSize) && fileData.Length > maxSize)
            {
                var maxSizeMB = maxSize / (1024 * 1024);
                var actualSizeMB = Math.Round(fileData.Length / (1024.0 * 1024.0), 2);
                return ServiceResult<MediaWithPersonsDto>.Failure(
                    $"File size ({actualSizeMB} MB) exceeds maximum ({maxSizeMB} MB) for {mediaKind}");
            }

            // Upload media using existing MediaService
            var mediaResult = await _mediaService.UploadMediaAsync(
                dto.PersonIds[0], // Use first person as the "primary" for storage path
                dto.Base64Data,
                dto.FileName,
                dto.MimeType,
                dto.Title,
                dto.Description,
                null // copyright
            );

            if (mediaResult == null)
            {
                return ServiceResult<MediaWithPersonsDto>.InternalError("Failed to upload media");
            }

            // Create PersonMedia links for all specified persons
            var linkedPersons = new List<LinkedPersonDto>();
            for (int i = 0; i < dto.PersonIds.Count; i++)
            {
                var personId = dto.PersonIds[i];
                var link = new PersonMedia
                {
                    PersonId = personId,
                    MediaId = mediaResult.Id,
                    IsPrimary = i == 0, // First person is primary
                    LinkedAt = DateTime.UtcNow
                };

                _personMediaRepository.Add(link);

                // We'll fetch person names separately
                linkedPersons.Add(new LinkedPersonDto(
                    personId,
                    null, // Will be populated when querying
                    link.IsPrimary,
                    link.Notes,
                    link.LinkedAt
                ));
            }

            await _personMediaRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Uploaded media {MediaId} and linked to {Count} persons",
                mediaResult.Id, dto.PersonIds.Count);

            var response = new MediaWithPersonsDto(
                mediaResult.Id,
                mediaResult.FileName,
                mediaResult.MimeType,
                mediaResult.FileSize,
                mediaKind.ToString(),
                dto.Title,
                dto.Description,
                mediaResult.ThumbnailPath,
                DateTime.UtcNow,
                DateTime.UtcNow,
                linkedPersons
            );

            return ServiceResult<MediaWithPersonsDto>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading media");
            return ServiceResult<MediaWithPersonsDto>.InternalError("Failed to upload media");
        }
    }

    // ========================================================================
    // QUERY OPERATIONS
    // ========================================================================

    public async Task<ServiceResult<IEnumerable<PersonMediaListItemDto>>> GetMediaByPersonAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await _personMediaRepository.PersonExistsAsync(personId, cancellationToken))
            {
                return ServiceResult<IEnumerable<PersonMediaListItemDto>>.NotFound("Person not found");
            }

            var links = await _personMediaRepository.GetByPersonIdWithMediaAsync(personId, cancellationToken);

            // Get all linked persons for these media items in a separate query to avoid cycle
            var mediaIds = links.Select(l => l.MediaId).Distinct().ToList();
            var allPersonLinks = await _personMediaRepository.GetByMediaIdsWithPersonsAsync(mediaIds, cancellationToken);

            // Group person links by media ID for efficient lookup
            var personLinksByMedia = allPersonLinks
                .GroupBy(pm => pm.MediaId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var items = links.Select(link => {
                var linkedPersons = personLinksByMedia.TryGetValue(link.MediaId, out var pLinks)
                    ? pLinks.Select(pl => new LinkedPersonDto(
                        pl.PersonId,
                        pl.Person?.PrimaryName,
                        pl.IsPrimary,
                        pl.Notes,
                        pl.LinkedAt
                    )).ToList()
                    : new List<LinkedPersonDto>();

                return new PersonMediaListItemDto(
                    link.MediaId,
                    link.Media.FileName,
                    link.Media.MimeType,
                    link.Media.FileSize,
                    link.Media.Kind.ToString(),
                    link.Media.Title,
                    link.Media.Description,
                    link.Media.ThumbnailPath,
                    link.IsPrimary,
                    link.SortOrder,
                    link.LinkedAt,
                    linkedPersons
                );
            });

            return ServiceResult<IEnumerable<PersonMediaListItemDto>>.Success(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting media for person {PersonId}", personId);
            return ServiceResult<IEnumerable<PersonMediaListItemDto>>.InternalError("Failed to get media");
        }
    }

    public async Task<ServiceResult<PersonMediaGroupedDto>> GetMediaByPersonGroupedAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await GetMediaByPersonAsync(personId, userContext, cancellationToken);
            if (!result.IsSuccess)
            {
                return ServiceResult<PersonMediaGroupedDto>.Failure(result.ErrorMessage!, result.ErrorType);
            }

            var items = result.Data!.ToList();

            var grouped = new PersonMediaGroupedDto
            {
                Images = items.Where(m => m.MediaKind == MediaKind.Image.ToString()).ToList(),
                Audio = items.Where(m => m.MediaKind == MediaKind.Audio.ToString()).ToList(),
                Videos = items.Where(m => m.MediaKind == MediaKind.Video.ToString()).ToList()
            };

            return ServiceResult<PersonMediaGroupedDto>.Success(grouped);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting grouped media for person {PersonId}", personId);
            return ServiceResult<PersonMediaGroupedDto>.InternalError("Failed to get media");
        }
    }

    public async Task<ServiceResult<MediaWithDataDto>> GetMediaByIdAsync(
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Get media entity
            var media = await _personMediaRepository.GetMediaByIdAsync(mediaId, cancellationToken);
            if (media == null)
            {
                return ServiceResult<MediaWithDataDto>.NotFound("Media not found");
            }

            // Get Base64 data
            var base64Data = await _mediaService.GetMediaAsBase64Async(mediaId);
            if (base64Data == null)
            {
                return ServiceResult<MediaWithDataDto>.NotFound("Media file not found");
            }

            // Get linked persons
            var links = await _personMediaRepository.GetByMediaIdWithPersonsAsync(mediaId, cancellationToken);
            var linkedPersons = links.Select(pl => new LinkedPersonDto(
                pl.PersonId,
                pl.Person?.PrimaryName,
                pl.IsPrimary,
                pl.Notes,
                pl.LinkedAt
            )).ToList();

            var response = new MediaWithDataDto(
                media.Id,
                media.FileName,
                media.MimeType,
                media.FileSize,
                media.Kind.ToString(),
                media.Title,
                media.Description,
                base64Data,
                media.CreatedAt,
                linkedPersons
            );

            return ServiceResult<MediaWithDataDto>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting media {MediaId}", mediaId);
            return ServiceResult<MediaWithDataDto>.InternalError("Failed to get media");
        }
    }

    public async Task<ServiceResult<IEnumerable<LinkedPersonDto>>> GetLinkedPersonsAsync(
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await _personMediaRepository.MediaExistsAsync(mediaId, cancellationToken))
            {
                return ServiceResult<IEnumerable<LinkedPersonDto>>.NotFound("Media not found");
            }

            var links = await _personMediaRepository.GetByMediaIdWithPersonsAsync(mediaId, cancellationToken);

            var linkedPersons = links.Select(pl => new LinkedPersonDto(
                pl.PersonId,
                pl.Person?.PrimaryName,
                pl.IsPrimary,
                pl.Notes,
                pl.LinkedAt
            ));

            return ServiceResult<IEnumerable<LinkedPersonDto>>.Success(linkedPersons);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting linked persons for media {MediaId}", mediaId);
            return ServiceResult<IEnumerable<LinkedPersonDto>>.InternalError("Failed to get linked persons");
        }
    }

    // ========================================================================
    // LINKING OPERATIONS
    // ========================================================================

    public async Task<ServiceResult> LinkPersonToMediaAsync(
        Guid personId,
        Guid mediaId,
        LinkPersonToMediaDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!userContext.CanContribute())
            {
                return ServiceResult.Forbidden("You don't have permission to link media");
            }

            if (!await _personMediaRepository.PersonExistsAsync(personId, cancellationToken))
            {
                return ServiceResult.NotFound("Person not found");
            }

            if (!await _personMediaRepository.MediaExistsAsync(mediaId, cancellationToken))
            {
                return ServiceResult.NotFound("Media not found");
            }

            if (await _personMediaRepository.LinkExistsAsync(personId, mediaId, cancellationToken))
            {
                return ServiceResult.Failure("Person is already linked to this media");
            }

            var link = new PersonMedia
            {
                PersonId = personId,
                MediaId = mediaId,
                IsPrimary = dto.IsPrimary,
                Notes = dto.Notes,
                LinkedAt = DateTime.UtcNow
            };

            _personMediaRepository.Add(link);
            await _personMediaRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Linked person {PersonId} to media {MediaId}", personId, mediaId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error linking person {PersonId} to media {MediaId}", personId, mediaId);
            return ServiceResult.InternalError("Failed to link person to media");
        }
    }

    public async Task<ServiceResult> UnlinkPersonFromMediaAsync(
        Guid personId,
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!userContext.CanEdit())
            {
                return ServiceResult.Forbidden("You don't have permission to unlink media");
            }

            var link = await _personMediaRepository.GetLinkAsync(personId, mediaId, cancellationToken);
            if (link == null)
            {
                return ServiceResult.NotFound("Link not found");
            }

            _personMediaRepository.Remove(link);
            await _personMediaRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Unlinked person {PersonId} from media {MediaId}", personId, mediaId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unlinking person {PersonId} from media {MediaId}", personId, mediaId);
            return ServiceResult.InternalError("Failed to unlink person from media");
        }
    }

    // ========================================================================
    // DELETE OPERATIONS
    // ========================================================================

    public async Task<ServiceResult> DeleteMediaAsync(
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!userContext.CanEdit())
            {
                return ServiceResult.Forbidden("You don't have permission to delete media");
            }

            if (!await _personMediaRepository.MediaExistsAsync(mediaId, cancellationToken))
            {
                return ServiceResult.NotFound("Media not found");
            }

            // Delete the media file (this also removes via cascade)
            var deleted = await _mediaService.DeleteMediaAsync(mediaId);
            if (!deleted)
            {
                return ServiceResult.InternalError("Failed to delete media");
            }

            _logger.LogInformation("Deleted media {MediaId}", mediaId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media {MediaId}", mediaId);
            return ServiceResult.InternalError("Failed to delete media");
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private static byte[] Base64ToBytes(string base64)
    {
        // Handle data URL format (e.g., "data:image/png;base64,...")
        if (base64.Contains(','))
        {
            base64 = base64.Split(',')[1];
        }
        return Convert.FromBase64String(base64);
    }
}