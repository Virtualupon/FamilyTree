using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using FamilyTreeApi.Models.Configuration;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IAdminService _adminService;
    private readonly ILogger<AuthController> _logger;
    private readonly string[] _trustedProxies;

    public AuthController(
        IAuthService authService,
        IAdminService adminService,
        ILogger<AuthController> logger,
        IConfiguration configuration)
    {
        _authService = authService;
        _adminService = adminService;
        _logger = logger;

        // SECURITY FIX: Configure trusted proxies for X-Forwarded-For validation
        _trustedProxies = configuration.GetSection("TrustedProxies").Get<string[]>()
            ?? new[] { "127.0.0.1", "::1" };
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

    /// <summary>
    /// Legacy single-phase registration (deprecated - use /register/initiate and /register/complete)
    /// </summary>
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

    // ============================================================================
    // Two-Phase Registration (Secure)
    // ============================================================================

    /// <summary>
    /// Phase 1: Initiate registration - validates email and sends verification code.
    /// Returns a registration token for Phase 2 (NOT the password).
    /// </summary>
    [HttpPost("register/initiate")]
    [ProducesResponseType(typeof(InitiateRegistrationResponse), 200)]
    [ProducesResponseType(429)]
    public async Task<ActionResult<InitiateRegistrationResponse>> InitiateRegistration(
        [FromBody] InitiateRegistrationRequest request)
    {
        try
        {
            var ipAddress = GetClientIpAddress();
            var response = await _authService.InitiateRegistrationAsync(request, ipAddress);

            // Note: We always return 200 to prevent enumeration, even on rate limit
            // The response.Success indicates actual success
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration initiation failed");
            // Still return success-like response to prevent enumeration
            return Ok(new InitiateRegistrationResponse(
                true,
                "If this email is not already registered, you will receive a verification code shortly.",
                "***",
                null));
        }
    }

    /// <summary>
    /// Phase 2: Complete registration - verify code and create account.
    /// Uses registration token from Phase 1 (password NOT re-transmitted).
    /// </summary>
    [HttpPost("register/complete")]
    [ProducesResponseType(typeof(CompleteRegistrationResponse), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(429)]
    public async Task<ActionResult<CompleteRegistrationResponse>> CompleteRegistration(
        [FromBody] CompleteRegistrationRequest request)
    {
        try
        {
            var ipAddress = GetClientIpAddress();
            var response = await _authService.CompleteRegistrationAsync(request, ipAddress);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration completion failed");
            return StatusCode(500, new { message = "An error occurred during registration" });
        }
    }

    // ============================================================================
    // Email Verification & Password Reset
    // ============================================================================

    /// <summary>
    /// Resend verification code with rate limiting.
    /// </summary>
    [HttpPost("resend-code")]
    [ProducesResponseType(typeof(ResendCodeResponse), 200)]
    [ProducesResponseType(429)]
    public async Task<ActionResult<ResendCodeResponse>> ResendCode([FromBody] ResendCodeRequest request)
    {
        try
        {
            var ipAddress = GetClientIpAddress();
            var response = await _authService.ResendVerificationCodeAsync(request.Email, request.Purpose, ipAddress);

            if (!response.Success && response.RetryAfterSeconds.HasValue)
            {
                Response.Headers["Retry-After"] = response.RetryAfterSeconds.Value.ToString();
                return StatusCode(429, response);
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Resend code failed");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Initiate forgot password flow.
    /// Always returns success to prevent email enumeration.
    /// </summary>
    [HttpPost("forgot-password")]
    [ProducesResponseType(typeof(ForgotPasswordResponse), 200)]
    public async Task<ActionResult<ForgotPasswordResponse>> ForgotPassword(
        [FromBody] ForgotPasswordRequest request)
    {
        try
        {
            var ipAddress = GetClientIpAddress();
            var response = await _authService.ForgotPasswordAsync(request.Email, ipAddress);

            // Always return 200 to prevent enumeration
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Forgot password failed");
            // Still return success to prevent enumeration
            return Ok(new ForgotPasswordResponse(true, "If an account exists, you will receive a reset code."));
        }
    }

    /// <summary>
    /// Reset password using verification code.
    /// </summary>
    [HttpPost("reset-password")]
    [ProducesResponseType(typeof(ResetPasswordResponse), 200)]
    [ProducesResponseType(400)]
    public async Task<ActionResult<ResetPasswordResponse>> ResetPassword(
        [FromBody] ResetPasswordRequest request)
    {
        try
        {
            var ipAddress = GetClientIpAddress();
            var response = await _authService.ResetPasswordAsync(request, ipAddress);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Password reset failed");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    /// <summary>
    /// Get towns for registration dropdown (public endpoint).
    /// </summary>
    [HttpGet("towns")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(List<TownInfoDto>), 200)]
    public async Task<ActionResult<List<TownInfoDto>>> GetTownsForRegistration()
    {
        try
        {
            var towns = await _authService.GetAvailableTownsAsync();
            return Ok(towns.Towns);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get towns for registration");
            return StatusCode(500, new { message = "An error occurred" });
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /// <summary>
    /// Get client IP address with trusted proxy validation.
    /// SECURITY FIX: Only trust X-Forwarded-For from configured trusted proxies.
    /// </summary>
    private string GetClientIpAddress()
    {
        var connectionIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        // Check if request came from a trusted proxy
        if (_trustedProxies.Contains(connectionIp))
        {
            // Trust X-Forwarded-For header from trusted proxies
            var forwardedFor = Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrEmpty(forwardedFor))
            {
                // Take the first (original client) IP from the chain
                var ip = forwardedFor.Split(',').FirstOrDefault()?.Trim();
                if (!string.IsNullOrEmpty(ip))
                    return ip;
            }
        }

        return connectionIp;
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
