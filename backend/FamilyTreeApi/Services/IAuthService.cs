using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

public interface IAuthService
{
    Task<TokenResponse> LoginAsync(LoginRequest request);

    /// <summary>
    /// Legacy single-phase registration (kept for backwards compatibility).
    /// New implementations should use two-phase registration.
    /// </summary>
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
    // Two-Phase Registration (Secure)
    // ============================================================================

    /// <summary>
    /// Phase 1: Initiate registration - validate email, send verification code.
    /// Does NOT create user record. Returns a registration token for Phase 2.
    /// SECURITY: Always returns same response regardless of email existence.
    /// </summary>
    Task<InitiateRegistrationResponse> InitiateRegistrationAsync(
        InitiateRegistrationRequest request,
        string ipAddress);

    /// <summary>
    /// Phase 2: Complete registration - verify code and create user.
    /// Creates user record only after successful code verification.
    /// SECURITY: Uses registration token instead of re-sending password.
    /// </summary>
    Task<CompleteRegistrationResponse> CompleteRegistrationAsync(
        CompleteRegistrationRequest request,
        string ipAddress);

    // ============================================================================
    // Email Verification (for existing unverified users)
    // ============================================================================

    /// <summary>
    /// Verify email for an existing unverified user.
    /// </summary>
    Task<VerifyEmailResponse> VerifyEmailAsync(VerifyEmailRequest request, string ipAddress);

    /// <summary>
    /// Resend verification code with rate limiting.
    /// </summary>
    Task<ResendCodeResponse> ResendVerificationCodeAsync(string email, string purpose, string ipAddress);

    // ============================================================================
    // Password Reset
    // ============================================================================

    /// <summary>
    /// Initiate forgot password flow.
    /// SECURITY: Always returns success to prevent email enumeration.
    /// </summary>
    Task<ForgotPasswordResponse> ForgotPasswordAsync(string email, string ipAddress);

    /// <summary>
    /// Reset password using verification code.
    /// </summary>
    Task<ResetPasswordResponse> ResetPasswordAsync(ResetPasswordRequest request, string ipAddress);

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
