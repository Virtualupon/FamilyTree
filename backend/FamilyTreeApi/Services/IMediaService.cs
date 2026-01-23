using FamilyTreeApi.Models;
using VirtualUpon.Storage.Dto;

namespace FamilyTreeApi.Services;

public interface IMediaService
{
    Task<Media> UploadMediaAsync(
        Guid personId,
        string base64Data,
        string fileName,
        string? mimeType = null,
        string? caption = null,
        string? description = null,
        string? copyright = null);

    Task<string?> GetMediaAsBase64Async(Guid mediaId);

    Task<(byte[] data, string mimeType)?> GetMediaBytesAsync(Guid mediaId);

    Task<bool> DeleteMediaAsync(Guid mediaId);

    Task<IEnumerable<Media>> GetPersonMediaAsync(Guid personId);

    /// <summary>
    /// Get a signed URL for secure media streaming.
    /// </summary>
    Task<SignedUrlResponseDto> GetSignedUrlAsync(Guid mediaId, int expiresInSeconds = 3600);
}
