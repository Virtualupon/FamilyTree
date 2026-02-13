using FamilyTreeApi.DTOs;
using Microsoft.AspNetCore.Http;

namespace FamilyTreeApi.Services;

public interface ISupportTicketService
{
    // ============================================================================
    // User Operations (any authenticated user)
    // ============================================================================

    Task<ServiceResult<SupportTicketDetailDto>> CreateTicketAsync(
        CreateSupportTicketRequest request,
        long userId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<PagedResult<SupportTicketSummaryDto>>> GetMyTicketsAsync(
        long userId,
        SupportTicketQueryParams queryParams,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SupportTicketDetailDto>> GetTicketAsync(
        Guid id,
        long userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TicketAttachmentDto>> AddAttachmentAsync(
        Guid ticketId,
        IFormFile file,
        long userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TicketCommentDto>> AddCommentAsync(
        Guid ticketId,
        AddTicketCommentRequest request,
        long userId,
        bool isAdmin,
        CancellationToken cancellationToken = default);

    // ============================================================================
    // Admin Operations (SuperAdmin/Developer only)
    // ============================================================================

    Task<ServiceResult<PagedResult<SupportTicketSummaryDto>>> GetAllTicketsAsync(
        SupportTicketQueryParams queryParams,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SupportTicketDetailDto>> UpdateStatusAsync(
        Guid id,
        UpdateTicketStatusRequest request,
        long adminUserId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SupportTicketDetailDto>> AssignTicketAsync(
        Guid id,
        AssignTicketRequest request,
        long adminUserId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SupportTicketDetailDto>> UpdatePriorityAsync(
        Guid id,
        UpdateTicketPriorityRequest request,
        long adminUserId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SupportTicketDetailDto>> UpdateAdminNotesAsync(
        Guid id,
        UpdateAdminNotesRequest request,
        long adminUserId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteTicketAsync(
        Guid id,
        long adminUserId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SupportTicketStatsDto>> GetStatsAsync(
        CancellationToken cancellationToken = default);
}
