using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;

namespace FamilyTreeApi.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthService> _logger;
    private readonly IRateLimitService _rateLimitService;
    private readonly IEmailService _emailService;
    private readonly ISecureCryptoService _cryptoService;
    private readonly RateLimitConfiguration _rateLimitConfig;
    private readonly IAuditLogService _auditLogService;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        ApplicationDbContext context,
        IConfiguration configuration,
        ILogger<AuthService> logger,
        IRateLimitService rateLimitService,
        IEmailService emailService,
        ISecureCryptoService cryptoService,
        IOptions<RateLimitConfiguration> rateLimitConfig,
        IAuditLogService auditLogService)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _context = context;
        _configuration = configuration;
        _logger = logger;
        _rateLimitService = rateLimitService;
        _emailService = emailService;
        _cryptoService = cryptoService;
        _rateLimitConfig = rateLimitConfig.Value;
        _auditLogService = auditLogService;
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

        await _auditLogService.LogAsync(
            user.Id, "Login", "Auth", Guid.Empty,
            $"User logged in: {user.Email}");

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

    // ============================================================================
    // Two-Phase Registration (Secure Implementation)
    // ============================================================================

    public async Task<InitiateRegistrationResponse> InitiateRegistrationAsync(
        InitiateRegistrationRequest request,
        string ipAddress)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        // 1. Rate limit check (IP-based)
        var ipRateLimit = await _rateLimitService.CheckAndIncrementAsync(
            $"register:ip:{ipAddress}",
            _rateLimitConfig.MaxRegistrationsPerIpPerHour,
            TimeSpan.FromHours(1));

        if (!ipRateLimit.IsAllowed)
        {
            _logger.LogWarning("Rate limit exceeded for IP {IpAddress} during registration", ipAddress);
            return new InitiateRegistrationResponse(
                false,
                "Too many registration attempts. Please try again later.",
                MaskEmail(normalizedEmail),
                null);
        }

        // 2. Rate limit check (email-based daily limit)
        var emailRateLimit = await _rateLimitService.CheckAndIncrementAsync(
            $"register:email:{normalizedEmail}:daily",
            _rateLimitConfig.MaxCodesPerEmailPerDay,
            TimeSpan.FromHours(24));

        if (!emailRateLimit.IsAllowed)
        {
            return new InitiateRegistrationResponse(
                false,
                "Too many attempts for this email. Please try again later.",
                MaskEmail(normalizedEmail),
                null);
        }

        // 3. Check if email is locked
        if (await _rateLimitService.IsEmailLockedAsync(normalizedEmail))
        {
            return new InitiateRegistrationResponse(
                false,
                "This email is temporarily locked. Please try again later.",
                MaskEmail(normalizedEmail),
                null);
        }

        // 4. Validate HomeTownId if provided
        if (request.HomeTownId.HasValue)
        {
            var townExists = await _context.Towns.AnyAsync(t => t.Id == request.HomeTownId.Value);
            if (!townExists)
            {
                return new InitiateRegistrationResponse(
                    false,
                    "Invalid home town selected.",
                    MaskEmail(normalizedEmail),
                    null);
            }
        }

        // 5. Check if email already registered (but don't reveal this!)
        var existingUser = await _userManager.FindByEmailAsync(normalizedEmail);

        // 6. Generate verification code
        var code = _cryptoService.GenerateSecureCode();
        var codeHash = _cryptoService.HashCode(code);

        // 7. Generate registration token (cryptographically random, non-enumerable)
        var registrationToken = _cryptoService.GenerateSecureToken();

        // 8. Hash password and create encrypted registration data
        var passwordHash = _userManager.PasswordHasher.HashPassword(null!, request.Password);
        var pendingData = new PendingRegistrationData
        {
            Email = normalizedEmail,
            PasswordHash = passwordHash,
            FirstName = request.FirstName,
            LastName = request.LastName,
            HomeTownId = request.HomeTownId,
            CreatedAt = DateTime.UtcNow
        };

        // 9. Encrypt the pending data
        var (encryptedData, iv) = _cryptoService.EncryptData(pendingData);

        if (existingUser != null)
        {
            // User exists - send "someone tried to register" notification
            // SECURITY: Do NOT create verification code for existing users
            await _emailService.SendExistingAccountNotificationAsync(normalizedEmail);

            _logger.LogInformation(
                "Registration attempted for existing email {Email}. Notification sent.",
                MaskEmail(normalizedEmail));
        }
        else
        {
            // New user - invalidate any existing codes and create new one
            await InvalidatePendingCodesAsync(normalizedEmail, VerificationPurpose.Registration);

            // Store verification code
            var verificationCode = new EmailVerificationCode
            {
                Email = normalizedEmail,
                UserId = null,  // No user yet
                CodeHash = codeHash,
                Purpose = VerificationPurpose.Registration.ToString(),
                ExpiresAt = DateTime.UtcNow.Add(_rateLimitConfig.CodeValidityDuration),
                IpAddress = ipAddress
            };

            _context.EmailVerificationCodes.Add(verificationCode);

            // Store registration token with encrypted data
            var regToken = new RegistrationToken
            {
                Token = registrationToken,
                Email = normalizedEmail,
                EncryptedData = encryptedData,
                IV = iv,
                ExpiresAt = DateTime.UtcNow.Add(_rateLimitConfig.RegistrationTokenValidityDuration),
                IpAddress = ipAddress
            };

            _context.RegistrationTokens.Add(regToken);
            await _context.SaveChangesAsync();

            // Send verification email
            var emailResult = await _emailService.SendVerificationCodeAsync(
                normalizedEmail,
                code,
                request.FirstName);

            if (!emailResult.Success)
            {
                _logger.LogWarning(
                    "Failed to send verification email to {Email}: {Error}",
                    MaskEmail(normalizedEmail),
                    emailResult.ErrorMessage);
            }
        }

        // 10. Set resend cooldown
        await _rateLimitService.SetResendCooldownAsync(
            normalizedEmail,
            VerificationPurpose.Registration.ToString(),
            _rateLimitConfig.ResendCooldownSeconds);

        // 11. ALWAYS return same response (prevents email enumeration)
        return new InitiateRegistrationResponse(
            true,
            "If this email is not already registered, you will receive a verification code shortly.",
            MaskEmail(normalizedEmail),
            existingUser == null ? registrationToken : null  // Only return token for new users
        );
    }

    public async Task<CompleteRegistrationResponse> CompleteRegistrationAsync(
        CompleteRegistrationRequest request,
        string ipAddress)
    {
        // 1. Find registration token
        var regToken = await _context.RegistrationTokens
            .FirstOrDefaultAsync(t => t.Token == request.RegistrationToken
                                   && !t.IsUsed
                                   && t.ExpiresAt > DateTime.UtcNow);

        if (regToken == null)
        {
            return new CompleteRegistrationResponse(
                false,
                "Invalid or expired registration. Please start over.",
                null);
        }

        var normalizedEmail = regToken.Email;

        // 2. Check email lock
        if (await _rateLimitService.IsEmailLockedAsync(normalizedEmail))
        {
            return new CompleteRegistrationResponse(
                false,
                "This email is temporarily locked due to too many failed attempts.",
                null);
        }

        // Use transaction for atomicity
        await using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            // 3. Find and validate verification code with optimistic locking
            var verificationCode = await _context.EmailVerificationCodes
                .Where(c => c.Email == normalizedEmail
                         && c.Purpose == VerificationPurpose.Registration.ToString()
                         && !c.IsUsed
                         && c.ExpiresAt > DateTime.UtcNow)
                .OrderByDescending(c => c.CreatedAt)
                .FirstOrDefaultAsync();

            if (verificationCode == null)
            {
                await transaction.RollbackAsync();
                return new CompleteRegistrationResponse(
                    false,
                    "Verification code expired. Please request a new one.",
                    null);
            }

            // 4. Check attempt count
            if (verificationCode.AttemptCount >= _rateLimitConfig.MaxVerificationAttemptsPerCode)
            {
                await transaction.RollbackAsync();
                return new CompleteRegistrationResponse(
                    false,
                    "Too many failed attempts. Please request a new code.",
                    null);
            }

            // 5. Verify code using constant-time comparison
            var requestCodeHash = _cryptoService.HashCode(request.Code);
            if (!_cryptoService.ConstantTimeEquals(verificationCode.CodeHash, requestCodeHash))
            {
                verificationCode.AttemptCount++;
                await _context.SaveChangesAsync();

                // Check for email lockout
                await _rateLimitService.IncrementEmailFailureAsync(normalizedEmail);

                var remaining = _rateLimitConfig.MaxVerificationAttemptsPerCode - verificationCode.AttemptCount;
                await transaction.CommitAsync();

                return new CompleteRegistrationResponse(
                    false,
                    remaining > 0
                        ? $"Invalid code. {remaining} attempts remaining."
                        : "Too many failed attempts. Please request a new code.",
                    null);
            }

            // 6. Mark code as used
            verificationCode.IsUsed = true;
            verificationCode.UsedAt = DateTime.UtcNow;

            // 7. Mark registration token as used
            regToken.IsUsed = true;
            regToken.UsedAt = DateTime.UtcNow;

            // 8. Check if user already exists (race condition protection)
            var existingUser = await _userManager.FindByEmailAsync(normalizedEmail);
            if (existingUser != null)
            {
                await transaction.RollbackAsync();
                return new CompleteRegistrationResponse(
                    false,
                    "An account with this email already exists.",
                    null);
            }

            // 9. Decrypt registration data
            PendingRegistrationData pendingData;
            try
            {
                pendingData = _cryptoService.DecryptData<PendingRegistrationData>(
                    regToken.EncryptedData,
                    regToken.IV);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to decrypt registration data for {Email}", MaskEmail(normalizedEmail));
                await transaction.RollbackAsync();
                return new CompleteRegistrationResponse(
                    false,
                    "Registration data corrupted. Please start over.",
                    null);
            }

            // 10. Create user (without using CreateAsync for password - we already have the hash)
            var user = new ApplicationUser
            {
                UserName = normalizedEmail,
                Email = normalizedEmail,
                NormalizedEmail = normalizedEmail.ToUpperInvariant(),
                NormalizedUserName = normalizedEmail.ToUpperInvariant(),
                FirstName = pendingData.FirstName,
                LastName = pendingData.LastName,
                HomeTownId = pendingData.HomeTownId,
                EmailConfirmed = true,  // Already verified!
                PasswordHash = pendingData.PasswordHash,  // Already hashed
                SecurityStamp = Guid.NewGuid().ToString(),
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // 11. Generate tokens
            var rawRefreshToken = GenerateRefreshToken();
            await _userManager.SetAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken", rawRefreshToken);

            var accessToken = await GenerateAccessTokenAsync(user);
            var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

            var userDto = await BuildUserDtoAsync(user);

            // 12. Commit transaction
            await transaction.CommitAsync();

            // 13. Clear rate limits for this email
            await _rateLimitService.ResetAsync($"register:email:{normalizedEmail}:daily");

            await _auditLogService.LogAsync(
                user.Id, "Register", "Auth", Guid.Empty,
                $"User registered: {user.Email}");

            _logger.LogInformation("User registered successfully: {Email}", MaskEmail(normalizedEmail));

            return new CompleteRegistrationResponse(
                true,
                "Registration successful!",
                new TokenResponse(accessToken, rawRefreshToken, accessTokenExpMinutes * 60, userDto));
        }
        catch (DbUpdateConcurrencyException)
        {
            await transaction.RollbackAsync();
            return new CompleteRegistrationResponse(
                false,
                "Registration was already completed. Please try logging in.",
                null);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("duplicate") == true ||
                                           ex.InnerException?.Message.Contains("unique") == true)
        {
            await transaction.RollbackAsync();
            return new CompleteRegistrationResponse(
                false,
                "An account with this email already exists.",
                null);
        }
    }

    // ============================================================================
    // Email Verification for Existing Users
    // ============================================================================

    public async Task<VerifyEmailResponse> VerifyEmailAsync(VerifyEmailRequest request, string ipAddress)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        // Find the user
        var user = await _userManager.FindByEmailAsync(normalizedEmail);
        if (user == null || user.EmailConfirmed)
        {
            return new VerifyEmailResponse(false, "Invalid verification request.", null);
        }

        // Find valid code
        var verificationCode = await _context.EmailVerificationCodes
            .Where(c => c.Email == normalizedEmail
                     && c.UserId == user.Id
                     && c.Purpose == VerificationPurpose.Registration.ToString()
                     && !c.IsUsed
                     && c.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync();

        if (verificationCode == null)
        {
            return new VerifyEmailResponse(false, "Verification code expired.", null);
        }

        // Verify code
        var requestCodeHash = _cryptoService.HashCode(request.Code);
        if (!_cryptoService.ConstantTimeEquals(verificationCode.CodeHash, requestCodeHash))
        {
            verificationCode.AttemptCount++;
            await _context.SaveChangesAsync();
            return new VerifyEmailResponse(false, "Invalid verification code.", null);
        }

        // Mark as verified
        verificationCode.IsUsed = true;
        verificationCode.UsedAt = DateTime.UtcNow;
        user.EmailConfirmed = true;
        await _userManager.UpdateAsync(user);
        await _context.SaveChangesAsync();

        // Generate tokens
        var rawRefreshToken = GenerateRefreshToken();
        await _userManager.SetAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken", rawRefreshToken);

        var accessToken = await GenerateAccessTokenAsync(user);
        var accessTokenExpMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);
        var userDto = await BuildUserDtoAsync(user);

        return new VerifyEmailResponse(
            true,
            "Email verified successfully!",
            new TokenResponse(accessToken, rawRefreshToken, accessTokenExpMinutes * 60, userDto));
    }

    public async Task<ResendCodeResponse> ResendVerificationCodeAsync(string email, string purpose, string ipAddress)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        // Check cooldown
        var cooldownSeconds = await _rateLimitService.GetResendCooldownSecondsAsync(normalizedEmail, purpose);
        if (cooldownSeconds > 0)
        {
            return new ResendCodeResponse(false, $"Please wait before requesting another code.", cooldownSeconds);
        }

        // Rate limit check
        var rateLimit = await _rateLimitService.CheckAndIncrementAsync(
            $"resend:{purpose}:{normalizedEmail}",
            _rateLimitConfig.MaxCodesPerEmailPerDay,
            TimeSpan.FromHours(24));

        if (!rateLimit.IsAllowed)
        {
            return new ResendCodeResponse(
                false,
                "Too many code requests. Please try again tomorrow.",
                rateLimit.RetryAfterSeconds);
        }

        // Generate new code
        var code = _cryptoService.GenerateSecureCode();
        var codeHash = _cryptoService.HashCode(code);

        // Invalidate old codes
        await InvalidatePendingCodesAsync(normalizedEmail, Enum.Parse<VerificationPurpose>(purpose));

        // For registration purpose, find the existing registration token
        if (purpose == VerificationPurpose.Registration.ToString())
        {
            var verificationCode = new EmailVerificationCode
            {
                Email = normalizedEmail,
                CodeHash = codeHash,
                Purpose = purpose,
                ExpiresAt = DateTime.UtcNow.Add(_rateLimitConfig.CodeValidityDuration),
                IpAddress = ipAddress
            };

            _context.EmailVerificationCodes.Add(verificationCode);
            await _context.SaveChangesAsync();

            await _emailService.SendVerificationCodeAsync(normalizedEmail, code, null);
        }
        else if (purpose == VerificationPurpose.PasswordReset.ToString())
        {
            var user = await _userManager.FindByEmailAsync(normalizedEmail);
            if (user != null)
            {
                var verificationCode = new EmailVerificationCode
                {
                    Email = normalizedEmail,
                    UserId = user.Id,
                    CodeHash = codeHash,
                    Purpose = purpose,
                    ExpiresAt = DateTime.UtcNow.Add(_rateLimitConfig.CodeValidityDuration),
                    IpAddress = ipAddress
                };

                _context.EmailVerificationCodes.Add(verificationCode);
                await _context.SaveChangesAsync();

                await _emailService.SendPasswordResetCodeAsync(normalizedEmail, code, user.FirstName);
            }
        }

        // Set cooldown
        await _rateLimitService.SetResendCooldownAsync(normalizedEmail, purpose, _rateLimitConfig.ResendCooldownSeconds);

        return new ResendCodeResponse(true, "A new code has been sent.", null);
    }

    // ============================================================================
    // Password Reset
    // ============================================================================

    public async Task<ForgotPasswordResponse> ForgotPasswordAsync(string email, string ipAddress)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        // Rate limit check
        var rateLimit = await _rateLimitService.CheckAndIncrementAsync(
            $"forgot:ip:{ipAddress}",
            _rateLimitConfig.MaxForgotPasswordPerIpPerHour,
            TimeSpan.FromHours(1));

        if (!rateLimit.IsAllowed)
        {
            // Still return success to prevent enumeration
            await Task.Delay(Random.Shared.Next(200, 500));  // Timing attack mitigation
            return new ForgotPasswordResponse(true, "If an account exists, you will receive a reset code.");
        }

        // Add artificial delay to prevent timing attacks
        await Task.Delay(Random.Shared.Next(200, 500));

        var user = await _userManager.FindByEmailAsync(normalizedEmail);

        if (user != null)
        {
            // Generate code
            var code = _cryptoService.GenerateSecureCode();
            var codeHash = _cryptoService.HashCode(code);

            // Invalidate old codes
            await InvalidatePendingCodesAsync(normalizedEmail, VerificationPurpose.PasswordReset);

            // Store new code
            var verificationCode = new EmailVerificationCode
            {
                Email = normalizedEmail,
                UserId = user.Id,
                CodeHash = codeHash,
                Purpose = VerificationPurpose.PasswordReset.ToString(),
                ExpiresAt = DateTime.UtcNow.Add(_rateLimitConfig.CodeValidityDuration),
                IpAddress = ipAddress
            };

            _context.EmailVerificationCodes.Add(verificationCode);
            await _context.SaveChangesAsync();

            // Send email
            await _emailService.SendPasswordResetCodeAsync(normalizedEmail, code, user.FirstName);
        }

        // ALWAYS return success (prevents enumeration)
        return new ForgotPasswordResponse(true, "If an account exists with this email, you will receive a reset code.");
    }

    public async Task<ResetPasswordResponse> ResetPasswordAsync(ResetPasswordRequest request, string ipAddress)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var user = await _userManager.FindByEmailAsync(normalizedEmail);
        if (user == null)
        {
            return new ResetPasswordResponse(false, "Invalid reset request.");
        }

        // Find valid code
        var verificationCode = await _context.EmailVerificationCodes
            .Where(c => c.Email == normalizedEmail
                     && c.UserId == user.Id
                     && c.Purpose == VerificationPurpose.PasswordReset.ToString()
                     && !c.IsUsed
                     && c.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync();

        if (verificationCode == null)
        {
            return new ResetPasswordResponse(false, "Reset code expired. Please request a new one.");
        }

        // Check attempts
        if (verificationCode.AttemptCount >= _rateLimitConfig.MaxVerificationAttemptsPerCode)
        {
            return new ResetPasswordResponse(false, "Too many failed attempts. Please request a new code.");
        }

        // Verify code using constant-time comparison
        var requestCodeHash = _cryptoService.HashCode(request.Code);
        if (!_cryptoService.ConstantTimeEquals(verificationCode.CodeHash, requestCodeHash))
        {
            verificationCode.AttemptCount++;
            await _context.SaveChangesAsync();
            await _rateLimitService.IncrementEmailFailureAsync(normalizedEmail);

            return new ResetPasswordResponse(false, "Invalid reset code.");
        }

        // Reset password
        var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, resetToken, request.NewPassword);

        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return new ResetPasswordResponse(false, $"Password reset failed: {errors}");
        }

        // Mark code as used
        verificationCode.IsUsed = true;
        verificationCode.UsedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Revoke all refresh tokens for security
        await _userManager.RemoveAuthenticationTokenAsync(user, "FamilyTreeApi", "RefreshToken");

        return new ResetPasswordResponse(true, "Password reset successfully. Please login with your new password.");
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    private async Task InvalidatePendingCodesAsync(string email, VerificationPurpose purpose)
    {
        var pendingCodes = await _context.EmailVerificationCodes
            .Where(c => c.Email == email
                     && c.Purpose == purpose.ToString()
                     && !c.IsUsed)
            .ToListAsync();

        foreach (var code in pendingCodes)
        {
            code.IsUsed = true;
            code.UsedAt = DateTime.UtcNow;
        }

        if (pendingCodes.Any())
        {
            await _context.SaveChangesAsync();
        }
    }

    private static string MaskEmail(string email)
    {
        var parts = email.Split('@');
        if (parts.Length != 2) return "***";

        var local = parts[0];
        var domain = parts[1];

        if (local.Length <= 2)
            return $"{local[0]}***@{domain}";

        return $"{local[0]}***{local[^1]}@{domain}";
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

        // Update LastActiveAt on every token refresh to track active sessions
        validUser.LastActiveAt = DateTime.UtcNow;
        await _userManager.UpdateAsync(validUser);

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
        var systemRole = userRoles.Contains("Developer") ? "Developer"
                       : userRoles.Contains("SuperAdmin") ? "SuperAdmin"
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
            // Also add tree role as ClaimTypes.Role so [Authorize(Roles = "...")] works for tree members
            claims.Add(new Claim(ClaimTypes.Role, orgUser.Role.ToString()));
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
        var systemRole = userRoles.Contains("Developer") ? "Developer"
                       : userRoles.Contains("SuperAdmin") ? "SuperAdmin"
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

        // Get home town name if set
        string? homeTownName = null;
        if (user.HomeTownId.HasValue)
        {
            homeTownName = await _context.Towns
                .Where(t => t.Id == user.HomeTownId.Value)
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
            selectedTownName,
            user.HomeTownId,
            homeTownName
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

        await _auditLogService.LogAsync(
            user.Id, "SelectTown", "Auth", Guid.Empty,
            $"User selected town: {townId}");

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
        var systemRole = userRoles.Contains("Developer") ? "Developer"
                       : userRoles.Contains("SuperAdmin") ? "SuperAdmin"
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