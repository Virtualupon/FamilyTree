using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.Models;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// User profile API controller - handles user-specific profile operations
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UserController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<UserController> _logger;

    private static readonly HashSet<string> ValidLanguages = new() { "en", "ar", "nob" };

    public UserController(UserManager<ApplicationUser> userManager, ILogger<UserController> logger)
    {
        _userManager = userManager;
        _logger = logger;
    }

    /// <summary>
    /// Update user's preferred language
    /// PUT /api/user/language
    /// </summary>
    [HttpPut("language")]
    public async Task<IActionResult> UpdateLanguage([FromBody] UpdateLanguageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Language))
        {
            return BadRequest(new { message = "Language is required" });
        }

        var language = request.Language.ToLowerInvariant();
        if (!ValidLanguages.Contains(language))
        {
            return BadRequest(new { message = $"Invalid language. Supported: {string.Join(", ", ValidLanguages)}" });
        }

        var userId = GetUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());

        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        user.PreferredLanguage = language;
        var result = await _userManager.UpdateAsync(user);

        if (!result.Succeeded)
        {
            _logger.LogError("Failed to update language for user {UserId}: {Errors}",
                userId, string.Join(", ", result.Errors.Select(e => e.Description)));
            return StatusCode(500, new { message = "Failed to update language preference" });
        }

        _logger.LogInformation("User {UserId} updated language to {Language}", userId, language);
        return Ok(new { language = user.PreferredLanguage });
    }

    /// <summary>
    /// Get current user's profile info
    /// GET /api/user/profile
    /// </summary>
    [HttpGet("profile")]
    public async Task<ActionResult<UserProfileResponse>> GetProfile()
    {
        var userId = GetUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());

        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        return Ok(new UserProfileResponse
        {
            Id = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            PreferredLanguage = user.PreferredLanguage
        });
    }

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
        {
            throw new UnauthorizedAccessException("User ID not found in token");
        }
        return userId;
    }
}

public class UpdateLanguageRequest
{
    public string Language { get; set; } = string.Empty;
}

public class UserProfileResponse
{
    public long Id { get; set; }
    public string? Email { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string PreferredLanguage { get; set; } = "en";
}
