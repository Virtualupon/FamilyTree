// File: Services/IMediaManagementService.cs
using FamilyTreeApi.DTOs;
using Microsoft.AspNetCore.Http;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Media management operations.
/// Distinct from IMediaService which handles person-level media.
/// </summary>
public interface IMediaManagementService
{
    Task<ServiceResult<MediaSearchResponse>> SearchMediaAsync(
        MediaSearchRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<MediaResponse>> GetMediaAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<MediaResponse>> UploadMediaAsync(
        MediaUploadRequest request,
        IFormFile file,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<MediaResponse>> UpdateMediaAsync(
        Guid id,
        MediaUpdateRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteMediaAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<(byte[] Data, string ContentType, string FileName)>> DownloadMediaAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Get a signed URL for secure media streaming.
    /// </summary>
    Task<ServiceResult<SignedMediaUrlDto>> GetSignedUrlAsync(
        Guid id,
        int expiresInSeconds,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
