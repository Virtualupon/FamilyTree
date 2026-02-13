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
    private readonly IConfiguration _configuration;

    // Cookie configuration constants
    private const string AccessTokenCookie = "access_token";
    private const string RefreshTokenCookie = "refresh_token";
    private const string XsrfTokenCookie = "XSRF-TOKEN";

    public AuthController(
        IAuthService authService,
        IAdminService adminService,
        ILogger<AuthController> logger,
        IConfiguration configuration)
    {
        _authService = authService;
        _adminService = adminService;
        _logger = logger;
        _configuration = configuration;

        // SECURITY FIX: Configure trusted proxies for X-Forwarded-For validation
        _trustedProxies = configuration.GetSection("TrustedProxies").Get<string[]>()
            ?? new[] { "127.0.0.1", "::1" };
    }

    // ============================================================================
    // Cookie Helper Methods
    // ============================================================================

    /// <summary>
    /// Set HttpOnly secure cookies for access and refresh tokens.
    /// Access token: HttpOnly, Secure, SameSite=Lax, Path=/
    /// Refresh token: HttpOnly, Secure, SameSite=Strict, Path=/api/auth/refresh
    /// XSRF token: NOT HttpOnly (readable by Angular), Secure, SameSite=Lax
    /// </summary>
    private void SetTokenCookies(string accessToken, string refreshToken, int accessTokenExpSeconds)
    {
        var isProduction = !(_configuration.GetValue<bool>("Development:DisableSecureCookies", false));

        // Access token cookie — sent with every request
        Response.Cookies.Append(AccessTokenCookie, accessToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = isProduction,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromSeconds(accessTokenExpSeconds),
            IsEssential = true
        });

        // Refresh token cookie — only sent to the refresh endpoint
        var refreshTokenLifetimeDays = _configuration.GetValue<int>("JwtSettings:RefreshTokenLifetimeDays", 30);
        Response.Cookies.Append(RefreshTokenCookie, refreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = isProduction,
            SameSite = SameSiteMode.Strict,
            Path = "/api/auth",
            MaxAge = TimeSpan.FromDays(refreshTokenLifetimeDays),
            IsEssential = true
        });

        // XSRF token — readable by Angular's HttpClient for CSRF protection
        var xsrfToken = Guid.NewGuid().ToString("N");
        Response.Cookies.Append(XsrfTokenCookie, xsrfToken, new CookieOptions
        {
            HttpOnly = false, // Must be readable by JavaScript
            Secure = isProduction,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromSeconds(accessTokenExpSeconds),
            IsEssential = true
        });
    }

    /// <summary>
    /// Clear all authentication cookies.
    /// </summary>
    private void ClearTokenCookies()
    {
        var cookieOptions = new CookieOptions { Path = "/" };
        Response.Cookies.Delete(AccessTokenCookie, cookieOptions);
        Response.Cookies.Delete(RefreshTokenCookie, new CookieOptions { Path = "/api/auth" });
        Response.Cookies.Delete(XsrfTokenCookie, cookieOptions);
    }

    // ============================================================================
    // Authentication Endpoints
    // ============================================================================

    [HttpPost("login")]
    public async Task<ActionResult<CookieAuthResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            var response = await _authService.LoginAsync(request);

            // Set HttpOnly cookies instead of returning tokens in body
            var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
            SetTokenCookies(response.AccessToken, response.RefreshToken, accessTokenExpMinutes * 60);

            // Return user info only (no tokens in response body)
            return Ok(new CookieAuthResponse(response.User, accessTokenExpMinutes * 60));
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
    public async Task<ActionResult<CookieAuthResponse>> Register([FromBody] RegisterRequest request)
    {
        try
        {
            var response = await _authService.RegisterAsync(request);

            // Set HttpOnly cookies
            var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
            SetTokenCookies(response.AccessToken, response.RefreshToken, accessTokenExpMinutes * 60);

            return CreatedAtAction(nameof(Register), new CookieAuthResponse(response.User, accessTokenExpMinutes * 60));
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
                return BadRequest(new { success = response.Success, message = response.Message });

            // Set HttpOnly cookies if tokens are present in the response
            if (response.Tokens != null)
            {
                var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
                SetTokenCookies(
                    response.Tokens.AccessToken,
                    response.Tokens.RefreshToken,
                    accessTokenExpMinutes * 60);
            }

            // SECURITY: Return without tokens in body — they're in HttpOnly cookies
            return Ok(new
            {
                success = response.Success,
                message = response.Message,
                user = response.Tokens?.User,
                expiresIn = response.Tokens?.ExpiresIn
            });
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
    // Token Management
    // ============================================================================

    [HttpPost("refresh")]
    public async Task<ActionResult<CookieAuthResponse>> Refresh()
    {
        try
        {
            // Read refresh token from HttpOnly cookie instead of request body
            var refreshToken = Request.Cookies[RefreshTokenCookie];
            if (string.IsNullOrEmpty(refreshToken))
            {
                return Unauthorized(new { message = "No refresh token provided" });
            }

            var response = await _authService.RefreshTokenAsync(refreshToken);

            // Set new HttpOnly cookies
            var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
            SetTokenCookies(response.AccessToken, response.RefreshToken, accessTokenExpMinutes * 60);

            return Ok(new CookieAuthResponse(response.User, accessTokenExpMinutes * 60));
        }
        catch (UnauthorizedAccessException ex)
        {
            ClearTokenCookies();
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh failed");
            return StatusCode(500, new { message = "An error occurred during token refresh" });
        }
    }

    [HttpPost("revoke")]
    [Authorize]
    public async Task<ActionResult> Revoke()
    {
        try
        {
            // Read refresh token from HttpOnly cookie
            var refreshToken = Request.Cookies[RefreshTokenCookie];
            if (!string.IsNullOrEmpty(refreshToken))
            {
                await _authService.RevokeTokenAsync(refreshToken);
            }

            // Always clear cookies on revoke/logout
            ClearTokenCookies();

            return Ok(new { message = "Logged out successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token revocation failed");
            // Still clear cookies even on error
            ClearTokenCookies();
            return Ok(new { message = "Logged out" });
        }
    }

    // ============================================================================
    // Admin Town Selection (after login)
    // ============================================================================

    /// <summary>
    /// Get assigned towns for the current admin user (for town selection after login)
    /// </summary>
    [HttpGet("my-towns")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
    public async Task<ActionResult<AdminLoginResponse>> GetMyTowns()
    {
        try
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "User ID not found in token" });
            }

            var userContext = BuildUserContext();
            var result = await _adminService.GetAdminTownsAsync(userId, userContext);
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
    /// Sets new access_token cookie with town claim.
    /// </summary>
    [HttpPost("select-town")]
    [Authorize(Roles = "Developer,Admin,SuperAdmin")]
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
            var userContext = BuildUserContext();
            var townsResult = await _adminService.GetAdminTownsAsync(userId, userContext);
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

            // Update the access_token cookie with the town-scoped token
            var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
            var isProduction = !(_configuration.GetValue<bool>("Development:DisableSecureCookies", false));

            Response.Cookies.Append(AccessTokenCookie, token, new CookieOptions
            {
                HttpOnly = true,
                Secure = isProduction,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                MaxAge = TimeSpan.FromMinutes(accessTokenExpMinutes),
                IsEssential = true
            });

            return Ok(new SelectTownResponse(
                null, // No token in response body — it's in the cookie
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
    /// Select a town for viewing (User role) - updates SelectedTownId and returns new token in cookie
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

            // Set new access_token cookie with the town-scoped token
            if (response.AccessToken != null)
            {
                var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
                var isProduction = !(_configuration.GetValue<bool>("Development:DisableSecureCookies", false));

                Response.Cookies.Append(AccessTokenCookie, response.AccessToken, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = isProduction,
                    SameSite = SameSiteMode.Lax,
                    Path = "/",
                    MaxAge = TimeSpan.FromMinutes(accessTokenExpMinutes),
                    IsEssential = true
                });
            }

            // Return response without token in body
            return Ok(new SelectTownResponse(null, response.TownId, response.TownName));
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

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /// <summary>
    /// Get client IP address with trusted proxy validation.
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

    /// <summary>
    /// Builds UserContext from JWT claims for service-layer authorization.
    /// </summary>
    private UserContext BuildUserContext()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        long userId = 0;
        if (!string.IsNullOrEmpty(userIdClaim))
            long.TryParse(userIdClaim, out userId);

        Guid? orgId = null;
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (!string.IsNullOrEmpty(orgIdClaim) && Guid.TryParse(orgIdClaim, out var parsedOrgId))
            orgId = parsedOrgId;

        return new UserContext
        {
            UserId = userId,
            OrgId = orgId,
            SystemRole = User.FindFirst("systemRole")?.Value ?? "User",
            TreeRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Viewer"
        };
    }
}

/// <summary>
/// Response DTO for cookie-based auth (no tokens in body).
/// </summary>
public record CookieAuthResponse(UserDto User, int ExpiresIn);
