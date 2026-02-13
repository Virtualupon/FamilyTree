using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Platform-level support ticket system.
/// Any authenticated user can submit tickets; SuperAdmin/Developer can manage.
/// </summary>
[ApiController]
[Route("api/support-tickets")]
[Authorize]
public class SupportTicketController : ControllerBase
{
    private readonly ISupportTicketService _service;
    private readonly ILogger<SupportTicketController> _logger;

    private const long MaxAttachmentSize = 10 * 1024 * 1024; // 10MB

    public SupportTicketController(
        ISupportTicketService service,
        ILogger<SupportTicketController> logger)
    {
        _service = service;
        _logger = logger;
    }

    // ============================================================================
    // Helpers
    // ============================================================================

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            throw new UnauthorizedAccessException("User ID not found in token");
        return userId;
    }

    /// <summary>
    /// AUDIT FIX: includes Developer (unlike SuggestionController.IsAdmin which is missing it)
    /// </summary>
    private bool IsAdmin()
    {
        return User.IsInRole("Developer") || User.IsInRole("SuperAdmin");
    }

    private ActionResult HandleServiceResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
            return Ok(result.Data);

        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.Unauthorized => Unauthorized(new { message = result.ErrorMessage }),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }

    private ActionResult HandleServiceResult(ServiceResult result)
    {
        if (result.IsSuccess)
            return Ok(new { message = "Success" });

        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.Unauthorized => Unauthorized(new { message = result.ErrorMessage }),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }

    // ============================================================================
    // User Endpoints (any authenticated user)
    // ============================================================================

    /// <summary>
    /// Create a new support ticket
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<SupportTicketDetailDto>> CreateTicket(
        [FromBody] CreateSupportTicketRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.CreateTicketAsync(request, userId, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating support ticket");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get my submitted tickets (paginated)
    /// </summary>
    [HttpGet("my")]
    public async Task<ActionResult<PagedResult<SupportTicketSummaryDto>>> GetMyTickets(
        [FromQuery] SupportTicketQueryParams queryParams,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.GetMyTicketsAsync(userId, queryParams, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting my tickets");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get ticket by ID (submitter sees own; admin sees all)
    /// AUDIT FIX: uses {id:guid} route constraint to prevent collision with /my and /stats
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SupportTicketDetailDto>> GetTicket(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var isAdmin = IsAdmin();
            var result = await _service.GetTicketAsync(id, userId, isAdmin, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ticket {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Upload an image attachment to a ticket
    /// </summary>
    [HttpPost("{id:guid}/attachments")]
    [RequestSizeLimit(MaxAttachmentSize)]
    public async Task<ActionResult<TicketAttachmentDto>> UploadAttachment(
        Guid id,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        try
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided" });

            var userId = GetUserId();
            var isAdmin = IsAdmin();
            var result = await _service.AddAttachmentAsync(id, file, userId, isAdmin, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading attachment to ticket {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Add a comment to a ticket
    /// </summary>
    [HttpPost("{id:guid}/comments")]
    public async Task<ActionResult<TicketCommentDto>> AddComment(
        Guid id,
        [FromBody] AddTicketCommentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var isAdmin = IsAdmin();
            var result = await _service.AddCommentAsync(id, request, userId, isAdmin, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding comment to ticket {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    // ============================================================================
    // Admin Endpoints (Developer/SuperAdmin only)
    // ============================================================================

    /// <summary>
    /// Get all tickets (admin view, paginated)
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<PagedResult<SupportTicketSummaryDto>>> GetAllTickets(
        [FromQuery] SupportTicketQueryParams queryParams,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _service.GetAllTicketsAsync(queryParams, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all tickets");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Update ticket status
    /// </summary>
    [HttpPut("{id:guid}/status")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<SupportTicketDetailDto>> UpdateStatus(
        Guid id,
        [FromBody] UpdateTicketStatusRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.UpdateStatusAsync(id, request, userId, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating ticket status {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Assign ticket to an admin user
    /// </summary>
    [HttpPut("{id:guid}/assign")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<SupportTicketDetailDto>> AssignTicket(
        Guid id,
        [FromBody] AssignTicketRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.AssignTicketAsync(id, request, userId, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assigning ticket {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Update ticket priority
    /// </summary>
    [HttpPut("{id:guid}/priority")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<SupportTicketDetailDto>> UpdatePriority(
        Guid id,
        [FromBody] UpdateTicketPriorityRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.UpdatePriorityAsync(id, request, userId, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating ticket priority {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Update internal admin notes (not visible to submitter)
    /// </summary>
    [HttpPut("{id:guid}/admin-notes")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<SupportTicketDetailDto>> UpdateAdminNotes(
        Guid id,
        [FromBody] UpdateAdminNotesRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.UpdateAdminNotesAsync(id, request, userId, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating admin notes for ticket {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Soft delete a ticket
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult> DeleteTicket(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = GetUserId();
            var result = await _service.DeleteTicketAsync(id, userId, cancellationToken);
            return HandleServiceResult(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting ticket {TicketId}", id);
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get ticket statistics (admin dashboard)
    /// </summary>
    [HttpGet("stats")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<SupportTicketStatsDto>> GetStats(
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _service.GetStatsAsync(cancellationToken);
            return HandleServiceResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ticket statistics");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }
}
