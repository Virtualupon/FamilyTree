namespace FamilyTreeApi.DTOs;

public record LoginRequest(string Email, string Password);

public record RegisterRequest(
    string Email,
    string Password,
    string? FirstName,
    string? LastName
);

// ============================================================================
// Two-Phase Registration DTOs
// SECURITY FIX: Separates initiation from completion to prevent:
// - Storing password in frontend sessionStorage
// - Creating unverified user accounts
// ============================================================================

/// <summary>
/// Phase 1: Initiate registration - validates email and sends verification code.
/// User record is NOT created at this stage.
/// </summary>
public record InitiateRegistrationRequest(
    string Email,
    string Password,
    string? FirstName,
    string? LastName,
    Guid? HomeTownId
);

/// <summary>
/// Response for initiation - returns a registration token.
/// SECURITY: Always returns success-like response to prevent email enumeration.
/// The registrationToken is used in Phase 2 (not the password).
/// </summary>
public record InitiateRegistrationResponse(
    bool Success,
    string Message,
    string MaskedEmail,
    string? RegistrationToken  // One-time token for Phase 2 (NOT the password!)
);

/// <summary>
/// Phase 2: Complete registration - verify code using token.
/// SECURITY FIX: Password is NOT sent again - retrieved from encrypted storage using token.
/// </summary>
public record CompleteRegistrationRequest(
    string RegistrationToken,  // The token from Phase 1
    string Code                // The 6-digit verification code
);

/// <summary>
/// Response with tokens after successful verification.
/// </summary>
public record CompleteRegistrationResponse(
    bool Success,
    string Message,
    TokenResponse? Tokens
);

// ============================================================================
// Email Verification DTOs
// ============================================================================

public record VerifyEmailRequest(string Email, string Code);
public record VerifyEmailResponse(bool Success, string Message, TokenResponse? Tokens);

public record ResendCodeRequest(string Email, string Purpose);
public record ResendCodeResponse(bool Success, string Message, int? RetryAfterSeconds);

// ============================================================================
// Password Reset DTOs
// ============================================================================

public record ForgotPasswordRequest(string Email);

/// <summary>
/// SECURITY: Always returns success to prevent email enumeration.
/// </summary>
public record ForgotPasswordResponse(bool Success, string Message);

public record ResetPasswordRequest(string Email, string Code, string NewPassword);
public record ResetPasswordResponse(bool Success, string Message);

// ============================================================================
// User DTO - Updated with HomeTown fields
// ============================================================================

public record UserDto(
    long Id,
    string Email,
    string? FirstName,
    string? LastName,
    bool EmailConfirmed,
    Guid? OrgId,
    string? OrgName,
    int Role,
    string SystemRole = "User",
    string PreferredLanguage = "en",
    bool IsFirstLogin = true,
    Guid? SelectedTownId = null,
    string? SelectedTownName = null,
    Guid? HomeTownId = null,
    string? HomeTownName = null
);

public record TokenResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn,
    UserDto User
);

public record RefreshTokenRequest(string RefreshToken);

// ============================================================================
// Governance Model DTOs - Language and Town Selection
// ============================================================================

/// <summary>
/// Request to set user's preferred language on first login
/// </summary>
public record SetLanguageRequest(string Language);

/// <summary>
/// Response after language is set
/// </summary>
public record SetLanguageResponse(
    string Language,
    bool IsFirstLogin,
    UserDto User
);

/// <summary>
/// Request to select a town for viewing (User role) or managing (Admin role)
/// </summary>
public record SelectTownRequest(Guid TownId);

/// <summary>
/// Response after town is selected, includes new access token with town claim
/// </summary>
public record SelectTownResponse(
    string AccessToken,
    Guid TownId,
    string TownName
);

/// <summary>
/// Town info for selection dropdown
/// </summary>
public record TownInfoDto(
    Guid Id,
    string Name,
    string? NameEn,
    string? NameAr,
    string? Country,
    int TreeCount
);

/// <summary>
/// Response for getting available towns (for User role)
/// </summary>
public record AvailableTownsResponse(
    List<TownInfoDto> Towns
);

/// <summary>
/// Response for admin login showing assigned towns
/// </summary>
public record AdminLoginResponse(
    List<TownInfoDto> AssignedTowns,
    bool IsSuperAdmin
);