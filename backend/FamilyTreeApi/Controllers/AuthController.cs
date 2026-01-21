using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IAdminService _adminService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        IAdminService adminService,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _adminService = adminService;
        _logger = logger;
    }

    [HttpPost("login")]
    public async Task<ActionResult<TokenResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            var response = await _authService.LoginAsync(request);
            return Ok(response);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login failed for {Email}", request.Email);
            return StatusCode(500, new { message = "An error occurred during login" });
        }
    }

    [HttpPost("register")]
    public async Task<ActionResult<TokenResponse>> Register([FromBody] RegisterRequest request)
    {
        try
        {
            var response = await _authService.RegisterAsync(request);
            return CreatedAtAction(nameof(Register), response);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration failed for {Email}", request.Email);
            return StatusCode(500, new { message = "An error occurred during registration" });
        }
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<TokenResponse>> Refresh([FromBody] RefreshTokenRequest request)
    {
        try
        {
            var response = await _authService.RefreshTokenAsync(request.RefreshToken);
            return Ok(response);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh failed");
            return StatusCode(500, new { message = "An error occurred during token refresh" });
        }
    }

    [HttpPost("revoke")]
    public async Task<ActionResult> Revoke([FromBody] RefreshTokenRequest request)
    {
        try
        {
            var result = await _authService.RevokeTokenAsync(request.RefreshToken);
            if (result)
            {
                return Ok(new { message = "Token revoked successfully" });
            }
            return NotFound(new { message = "Token not found" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token revocation failed");
            return StatusCode(500, new { message = "An error occurred during token revocation" });
        }
    }

    /// <summary>
    /// Get assigned towns for the current admin user (for town selection after login)
    /// </summary>
    [HttpGet("my-towns")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<AdminLoginResponse>> GetMyTowns()
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            var result = await _adminService.GetAdminTownsAsync(userId);
            if (!result.IsSuccess)
            {
                return BadRequest(new { message = result.ErrorMessage });
            }

            return Ok(result.Data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get admin towns");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Select a town for the current session (returns new token with town claim) - Admin/SuperAdmin
    /// </summary>
    [HttpPost("select-town")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<SelectTownResponse>> SelectTown([FromBody] SelectTownRequest request)
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            // Verify user has access to this town
            var townsResult = await _adminService.GetAdminTownsAsync(userId);
            if (!townsResult.IsSuccess)
            {
                return BadRequest(new { message = townsResult.ErrorMessage });
            }

            var assignedTown = townsResult.Data!.AssignedTowns
                .FirstOrDefault(t => t.Id == request.TownId);

            if (assignedTown == null)
            {
                return Forbid();
            }

            // Generate new token with selected town
            var token = await _authService.GenerateAccessTokenWithTownAsync(userId, request.TownId);

            return Ok(new SelectTownResponse(
                token,
                request.TownId,
                assignedTown.Name
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to select town");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    // ============================================================================
    // Governance Model - Language and Town Selection Endpoints
    // ============================================================================

    /// <summary>
    /// Set preferred language for the current user (first login onboarding)
    /// </summary>
    [HttpPost("set-language")]
    [Authorize]
    public async Task<ActionResult<SetLanguageResponse>> SetLanguage([FromBody] SetLanguageRequest request)
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            var response = await _authService.SetLanguageAsync(userId, request.Language);
            return Ok(response);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set language");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Complete first login onboarding (marks IsFirstLogin = false)
    /// </summary>
    [HttpPost("complete-onboarding")]
    [Authorize]
    public async Task<ActionResult<UserDto>> CompleteOnboarding()
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            var userDto = await _authService.CompleteOnboardingAsync(userId);
            return Ok(userDto);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete onboarding");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get available towns for User role to browse
    /// </summary>
    [HttpGet("available-towns")]
    [Authorize]
    public async Task<ActionResult<AvailableTownsResponse>> GetAvailableTowns()
    {
        try
        {
            var response = await _authService.GetAvailableTownsAsync();
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get available towns");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Select a town for viewing (User role) - updates SelectedTownId and returns new token
    /// </summary>
    [HttpPost("select-town-user")]
    [Authorize]
    public async Task<ActionResult<SelectTownResponse>> SelectTownForUser([FromBody] SelectTownRequest request)
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            var response = await _authService.SelectTownForUserAsync(userId, request.TownId);
            return Ok(response);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to select town for user");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get current user profile including IsFirstLogin and SelectedTown
    /// </summary>
    [HttpGet("profile")]
    [Authorize]
    public async Task<ActionResult<UserDto>> GetProfile()
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            var userDto = await _authService.GetUserProfileAsync(userId);
            return Ok(userDto);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get user profile");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }
}
