using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for PersonMedia many-to-many operations
/// </summary>
public interface IPersonMediaService
{
    // ========================================================================
    // UPLOAD OPERATIONS
    // ========================================================================

    /// <summary>
    /// Uploads media and links it to specified persons
    /// </summary>
    Task<ServiceResult<MediaWithPersonsDto>> UploadMediaAsync(
        MediaUploadWithPersonsDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // ========================================================================
    // QUERY OPERATIONS
    // ========================================================================

    /// <summary>
    /// Gets all media for a person with linked persons info
    /// </summary>
    Task<ServiceResult<IEnumerable<PersonMediaListItemDto>>> GetMediaByPersonAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all media for a person grouped by type
    /// </summary>
    Task<ServiceResult<PersonMediaGroupedDto>> GetMediaByPersonGroupedAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a single media with Base64 data and linked persons
    /// </summary>
    Task<ServiceResult<MediaWithDataDto>> GetMediaByIdAsync(
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all persons linked to a specific media
    /// </summary>
    Task<ServiceResult<IEnumerable<LinkedPersonDto>>> GetLinkedPersonsAsync(
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // ========================================================================
    // LINKING OPERATIONS
    // ========================================================================

    /// <summary>
    /// Links a person to existing media
    /// </summary>
    Task<ServiceResult> LinkPersonToMediaAsync(
        Guid personId,
        Guid mediaId,
        LinkPersonToMediaDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Unlinks a person from media
    /// </summary>
    Task<ServiceResult> UnlinkPersonFromMediaAsync(
        Guid personId,
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // ========================================================================
    // DELETE OPERATIONS
    // ========================================================================

    /// <summary>
    /// Deletes media and all its links
    /// </summary>
    Task<ServiceResult> DeleteMediaAsync(
        Guid mediaId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
