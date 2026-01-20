using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        ApplicationDbContext context,
        IConfiguration configuration,
        ILogger<AuthService> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<TokenResponse> LoginAsync(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user == null)
        {
            throw new UnauthorizedAccessException("Invalid email or password");
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: false);
        if (!result.Succeeded)
        {
            throw new UnauthorizedAccessException("Invalid email or password");
        }

        user.LastLoginAt = DateTime.UtcNow;

        // Clear selected town on every login - user must re-select town each session
        // This ensures proper town-scoped access control
        user.SelectedTownId = null;

        await _userManager.UpdateAsync(user);

        var rawRefreshToken = GenerateRefreshToken();
        await _userManager.SetAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken", rawRefreshToken);

        var accessToken = await GenerateAccessTokenAsync(user);
        var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

        var userDto = await BuildUserDtoAsync(user);

        return new TokenResponse(
            accessToken,
            rawRefreshToken,
            accessTokenExpMinutes * 60,
            userDto
        );
    }

    public async Task<TokenResponse> RegisterAsync(RegisterRequest request)
    {
        var existingUser = await _userManager.FindByEmailAsync(request.Email);
        if (existingUser != null)
        {
            throw new InvalidOperationException("Email already registered");
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            EmailConfirmed = false,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Registration failed: {errors}");
        }

        var rawRefreshToken = GenerateRefreshToken();
        await _userManager.SetAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken", rawRefreshToken);

        var accessToken = await GenerateAccessTokenAsync(user);
        var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

        var userDto = await BuildUserDtoAsync(user);

        return new TokenResponse(
            accessToken,
            rawRefreshToken,
            accessTokenExpMinutes * 60,
            userDto
        );
    }

    public async Task<TokenResponse> RefreshTokenAsync(string refreshToken)
    {
        // ? FIXED: Single query instead of loading all users
        var tokenRecord = await _context.Set<ApplicationUserToken>()
            .FirstOrDefaultAsync(t =>
                t.LoginProvider == "FamilyTreeApi" &&
                t.Name == "RefreshToken" &&
                t.Value == refreshToken);

        if (tokenRecord == null)
        {
            throw new UnauthorizedAccessException("Invalid or expired refresh token");
        }

        var validUser = await _userManager.FindByIdAsync(tokenRecord.UserId.ToString());
        if (validUser == null)
        {
            throw new UnauthorizedAccessException("Invalid or expired refresh token");
        }

        var rawRefreshToken = GenerateRefreshToken();
        await _userManager.SetAuthenticationTokenAsync(validUser, "FamilyTreeApi", "RefreshToken", rawRefreshToken);

        var accessToken = await GenerateAccessTokenAsync(validUser);
        var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

        var userDto = await BuildUserDtoAsync(validUser);

        return new TokenResponse(
            accessToken,
            rawRefreshToken,
            accessTokenExpMinutes * 60,
            userDto
        );
    }

    public async Task<bool> RevokeTokenAsync(string refreshToken)
    {
        // ? FIXED: Single query instead of loading all users
        var tokenRecord = await _context.Set<ApplicationUserToken>()
            .FirstOrDefaultAsync(t =>
                t.LoginProvider == "FamilyTreeApi" &&
                t.Name == "RefreshToken" &&
                t.Value == refreshToken);

        if (tokenRecord == null)
        {
            return false;
        }

        var validUser = await _userManager.FindByIdAsync(tokenRecord.UserId.ToString());
        if (validUser == null)
        {
            return false;
        }

        await _userManager.RemoveAuthenticationTokenAsync(validUser, "FamilyTreeApi", "RefreshToken");
        return true;
    }

    private async Task<string> GenerateAccessTokenAsync(ApplicationUser user)
    {
        var secret = _configuration["JwtSettings:tokenOptions:bearerTokenKeyStr"]
    ?? throw new InvalidOperationException("JWT bearer token key not configured");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Get Identity roles for user
        var userRoles = await _userManager.GetRolesAsync(user);
        var systemRole = userRoles.Contains("SuperAdmin") ? "SuperAdmin"
                       : userRoles.Contains("Admin") ? "Admin"
                       : "User";

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email!),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("firstName", user.FirstName ?? ""),
            new Claim("lastName", user.LastName ?? ""),
            new Claim("systemRole", systemRole)
        };

        // Add Identity roles to claims for [Authorize(Roles = "...")] to work
        foreach (var role in userRoles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var orgUsers = await _context.OrgUsers
            .Where(ou => ou.UserId == user.Id)
            .ToListAsync();

        foreach (var orgUser in orgUsers)
        {
            claims.Add(new Claim("orgId", orgUser.OrgId.ToString()));
            claims.Add(new Claim("treeRole", orgUser.Role.ToString()));
        }

        var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

        var token = new JwtSecurityToken(
            issuer: _configuration["JwtSettings:validationParameters:ValidIssuer"] ?? "FamilyTreeApi",
            audience: _configuration["JwtSettings:validationParameters:ValidAudience"] ?? "FamilyTreeApp",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(accessTokenExpMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateAccessToken(ApplicationUser user)
    {
        return GenerateAccessTokenAsync(user).GetAwaiter().GetResult();
    }

    public string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }

    private async Task<UserDto> BuildUserDtoAsync(ApplicationUser user)
    {
        var orgUser = await _context.OrgUsers
            .Include(ou => ou.Org)
            .FirstOrDefaultAsync(ou => ou.UserId == user.Id);

        // Get system role from Identity
        var userRoles = await _userManager.GetRolesAsync(user);
        var systemRole = userRoles.Contains("SuperAdmin") ? "SuperAdmin"
                       : userRoles.Contains("Admin") ? "Admin"
                       : "User";

        // Get selected town name if set
        string? selectedTownName = null;
        if (user.SelectedTownId.HasValue)
        {
            selectedTownName = await _context.Towns
                .Where(t => t.Id == user.SelectedTownId.Value)
                .Select(t => t.Name)
                .FirstOrDefaultAsync();
        }

        return new UserDto(
            user.Id,
            user.Email!,
            user.FirstName,
            user.LastName,
            user.EmailConfirmed,
            orgUser?.OrgId,
            orgUser?.Org?.Name,
            orgUser != null ? (int)orgUser.Role : 0,
            systemRole,
            user.PreferredLanguage,
            user.IsFirstLogin,
            user.SelectedTownId,
            selectedTownName
        );
    }

    // ============================================================================
    // Governance Model - Language and Town Selection
    // ============================================================================

    public async Task<SetLanguageResponse> SetLanguageAsync(long userId, string language)
    {
        // Validate language
        var validLanguages = new[] { "en", "ar", "nob" };
        if (!validLanguages.Contains(language))
        {
            throw new ArgumentException($"Invalid language. Supported: {string.Join(", ", validLanguages)}");
        }

        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new UnauthorizedAccessException("User not found");

        user.PreferredLanguage = language;
        await _userManager.UpdateAsync(user);

        var userDto = await BuildUserDtoAsync(user);

        return new SetLanguageResponse(
            language,
            user.IsFirstLogin,
            userDto
        );
    }

    public async Task<UserDto> CompleteOnboardingAsync(long userId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new UnauthorizedAccessException("User not found");

        user.IsFirstLogin = false;
        await _userManager.UpdateAsync(user);

        return await BuildUserDtoAsync(user);
    }

    public async Task<AvailableTownsResponse> GetAvailableTownsAsync()
    {
        var towns = await _context.Towns
            .OrderBy(t => t.Name)
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.NameEn,
                t.NameAr,
                t.Country,
                TreeCount = t.FamilyTrees.Count
            })
            .ToListAsync();

        var result = towns.Select(t => new TownInfoDto(
            t.Id,
            t.Name,
            t.NameEn,
            t.NameAr,
            t.Country,
            t.TreeCount
        )).ToList();

        return new AvailableTownsResponse(result);
    }

    public async Task<SelectTownResponse> SelectTownForUserAsync(long userId, Guid townId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new UnauthorizedAccessException("User not found");

        // Verify town exists
        var town = await _context.Towns.FindAsync(townId)
            ?? throw new ArgumentException("Town not found");

        // Update user's selected town
        user.SelectedTownId = townId;
        await _userManager.UpdateAsync(user);

        // Generate new token with town claim
        var accessToken = await GenerateAccessTokenWithTownAsync(userId, townId);

        return new SelectTownResponse(
            accessToken,
            townId,
            town.Name
        );
    }

    public async Task<UserDto> GetUserProfileAsync(long userId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new UnauthorizedAccessException("User not found");

        return await BuildUserDtoAsync(user);
    }

    /// <summary>
    /// Generate access token with selected town claim for Admin users.
    /// This token includes a "selectedTownId" claim that scopes their access.
    /// </summary>
    public async Task<string> GenerateAccessTokenWithTownAsync(long userId, Guid townId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new UnauthorizedAccessException("User not found");

        var secret = _configuration["JwtSettings:tokenOptions:bearerTokenKeyStr"]
            ?? throw new InvalidOperationException("JWT bearer token key not configured");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Get Identity roles for user
        var userRoles = await _userManager.GetRolesAsync(user);
        var systemRole = userRoles.Contains("SuperAdmin") ? "SuperAdmin"
                       : userRoles.Contains("Admin") ? "Admin"
                       : "User";

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email!),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("firstName", user.FirstName ?? ""),
            new Claim("lastName", user.LastName ?? ""),
            new Claim("systemRole", systemRole),
            new Claim("selectedTownId", townId.ToString())  // Town-scoped access
        };

        // Add Identity roles to claims
        foreach (var role in userRoles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        // For town-scoped tokens, include all trees in the selected town
        var treesInTown = await _context.Orgs
            .Where(o => o.TownId == townId)
            .Select(o => o.Id)
            .ToListAsync();

        foreach (var treeId in treesInTown)
        {
            claims.Add(new Claim("orgId", treeId.ToString()));
        }

        var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

        var token = new JwtSecurityToken(
            issuer: _configuration["JwtSettings:validationParameters:ValidIssuer"] ?? "FamilyTreeApi",
            audience: _configuration["JwtSettings:validationParameters:ValidAudience"] ?? "FamilyTreeApp",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(accessTokenExpMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}