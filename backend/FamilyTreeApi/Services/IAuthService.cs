using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

public interface IAuthService
{
    Task<TokenResponse> LoginAsync(LoginRequest request);
    Task<TokenResponse> RegisterAsync(RegisterRequest request);
    Task<TokenResponse> RefreshTokenAsync(string refreshToken);
    Task<bool> RevokeTokenAsync(string refreshToken);
    string GenerateAccessToken(ApplicationUser user);
    string GenerateRefreshToken();

    /// <summary>
    /// Generate access token with selected town claim for Admin users
    /// </summary>
    Task<string> GenerateAccessTokenWithTownAsync(long userId, Guid townId);

    // ============================================================================
    // Governance Model - Language and Town Selection
    // ============================================================================

    /// <summary>
    /// Set preferred language for a user (first login onboarding)
    /// </summary>
    Task<SetLanguageResponse> SetLanguageAsync(long userId, string language);

    /// <summary>
    /// Complete first login setup (marks IsFirstLogin = false)
    /// </summary>
    Task<UserDto> CompleteOnboardingAsync(long userId);

    /// <summary>
    /// Get available towns for a User role to browse
    /// </summary>
    Task<AvailableTownsResponse> GetAvailableTownsAsync();

    /// <summary>
    /// Select a town for the current session (User role)
    /// Updates SelectedTownId and returns new token with town claim
    /// </summary>
    Task<SelectTownResponse> SelectTownForUserAsync(long userId, Guid townId);

    /// <summary>
    /// Get current user profile including IsFirstLogin and SelectedTown
    /// </summary>
    Task<UserDto> GetUserProfileAsync(long userId);
}
