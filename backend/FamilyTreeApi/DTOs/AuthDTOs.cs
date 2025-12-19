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
    string SystemRole = "User"
);

public record TokenResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn,
    UserDto User
);

public record RefreshTokenRequest(string RefreshToken);