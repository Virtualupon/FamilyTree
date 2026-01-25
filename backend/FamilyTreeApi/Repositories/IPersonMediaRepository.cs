using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Repository interface for PersonMedia junction table operations
/// </summary>
public interface IPersonMediaRepository : IRepository<PersonMedia>
{
    /// <summary>
    /// Gets all media links for a specific person with Media details
    /// </summary>
    Task<IEnumerable<PersonMedia>> GetByPersonIdWithMediaAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all person links for a specific media with Person details
    /// </summary>
    Task<IEnumerable<PersonMedia>> GetByMediaIdWithPersonsAsync(Guid mediaId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a specific link between a person and media
    /// </summary>
    Task<PersonMedia?> GetLinkAsync(Guid personId, Guid mediaId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if a link exists between a person and media
    /// </summary>
    Task<bool> LinkExistsAsync(Guid personId, Guid mediaId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if a person exists
    /// </summary>
    Task<bool> PersonExistsAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if a media exists
    /// </summary>
    Task<bool> MediaExistsAsync(Guid mediaId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Removes all links for a specific media
    /// </summary>
    Task RemoveAllLinksForMediaAsync(Guid mediaId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a Media entity by its ID
    /// </summary>
    Task<Models.Media?> GetMediaByIdAsync(Guid mediaId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all person links for multiple media items with Person details
    /// </summary>
    Task<IEnumerable<PersonMedia>> GetByMediaIdsWithPersonsAsync(IEnumerable<Guid> mediaIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates a Media entity's translation fields
    /// </summary>
    Task UpdateMediaTranslationsAsync(
        Guid mediaId,
        string? description,
        string? descriptionAr,
        string? descriptionNob,
        CancellationToken cancellationToken = default);
}