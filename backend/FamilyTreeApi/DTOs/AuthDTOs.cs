namespace FamilyTreeApi.DTOs;

public record LoginRequest(string Email, string Password);

public record RegisterRequest(
    string Email,
    string Password,
    string? FirstName,
    string? LastName
);

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
    string? SelectedTownName = null
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