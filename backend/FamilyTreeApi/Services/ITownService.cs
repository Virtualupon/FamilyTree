// File: Services/ITownService.cs
using FamilyTreeApi.DTOs;
using Microsoft.AspNetCore.Http;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Town operations.
/// </summary>
public interface ITownService
{
    Task<ServiceResult<PagedResult<TownListItemDto>>> GetTownsAsync(
        TownSearchDto search,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TownDetailDto>> GetTownAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<FamilyTreeListItem>>> GetTownTreesAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TownDetailDto>> CreateTownAsync(
        CreateTownDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TownDetailDto>> UpdateTownAsync(
        Guid id,
        UpdateTownDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteTownAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TownImportResultDto>> ImportTownsAsync(
        IFormFile file,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<List<string>>> GetCountriesAsync(
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TownStatisticsDto>> GetTownStatisticsAsync(
        Guid townId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}
