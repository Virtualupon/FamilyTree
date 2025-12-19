// File: Services/IPersonLinkService.cs
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for cross-tree person link operations.
/// </summary>
public interface IPersonLinkService
{
    Task<ServiceResult<List<PersonLinkResponse>>> GetPersonLinksAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<PersonLinkResponse>>> GetPendingLinksAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<PersonLinkResponse>> CreateLinkAsync(
        CreatePersonLinkRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<PersonLinkResponse>> ReviewLinkAsync(
        Guid linkId,
        ApprovePersonLinkRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteLinkAsync(
        Guid linkId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<Dictionary<string, List<PersonLinkSummaryDto>>>> GetTreeLinksSummaryAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<PersonSearchResultDto>>> SearchForMatchesAsync(
        string name,
        DateTime? birthDate,
        Guid? excludeTreeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
