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
        var users = await _userManager.Users.ToListAsync();

        ApplicationUser? validUser = null;
        foreach (var user in users)
        {
            var storedToken = await _userManager.GetAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken");
            if (storedToken == refreshToken)
            {
                validUser = user;
                break;
            }
        }

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
        var users = await _userManager.Users.ToListAsync();

        ApplicationUser? validUser = null;
        foreach (var user in users)
        {
            var storedToken = await _userManager.GetAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken");
            if (storedToken == refreshToken)
            {
                validUser = user;
                break;
            }
        }

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

        return new UserDto(
            user.Id,
            user.Email!,
            user.FirstName,
            user.LastName,
            user.EmailConfirmed,
            orgUser?.OrgId,
            orgUser?.Org?.Name,
            orgUser != null ? (int)orgUser.Role : 0,
            systemRole
        );
    }
}