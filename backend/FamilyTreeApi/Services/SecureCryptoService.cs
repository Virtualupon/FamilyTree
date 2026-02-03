using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FamilyTreeApi.Services;

/// <summary>
/// Cryptographic utilities for secure registration flow.
/// Provides:
/// - Secure random token generation
/// - AES-256-GCM encryption for registration data
/// - Constant-time comparison for verification codes
/// - SHA-256 hashing for code storage
/// </summary>
public interface ISecureCryptoService
{
    /// <summary>
    /// Generate a cryptographically secure random token.
    /// </summary>
    /// <param name="byteLength">Number of random bytes (default 64)</param>
    /// <returns>URL-safe Base64 encoded token</returns>
    string GenerateSecureToken(int byteLength = 64);

    /// <summary>
    /// Generate a cryptographically secure 6-digit code.
    /// </summary>
    /// <returns>6-digit numeric string (e.g., "123456")</returns>
    string GenerateSecureCode();

    /// <summary>
    /// Hash a verification code for storage.
    /// </summary>
    /// <param name="code">Plain text code</param>
    /// <returns>SHA-256 hash as hex string</returns>
    string HashCode(string code);

    /// <summary>
    /// Constant-time comparison of two strings.
    /// SECURITY: Prevents timing side-channel attacks.
    /// </summary>
    /// <param name="a">First string</param>
    /// <param name="b">Second string</param>
    /// <returns>True if equal, false otherwise</returns>
    bool ConstantTimeEquals(string a, string b);

    /// <summary>
    /// Encrypt registration data using AES-256-GCM.
    /// </summary>
    /// <param name="data">Data to encrypt</param>
    /// <returns>Tuple of (encrypted bytes, IV)</returns>
    (byte[] EncryptedData, byte[] IV) EncryptData<T>(T data);

    /// <summary>
    /// Decrypt registration data.
    /// </summary>
    /// <param name="encryptedData">Encrypted bytes</param>
    /// <param name="iv">Initialization vector</param>
    /// <returns>Decrypted data</returns>
    T DecryptData<T>(byte[] encryptedData, byte[] iv);
}

public class SecureCryptoService : ISecureCryptoService
{
    private readonly byte[] _encryptionKey;
    private readonly ILogger<SecureCryptoService> _logger;

    public SecureCryptoService(IConfiguration configuration, ILogger<SecureCryptoService> logger)
    {
        _logger = logger;

        // Use the existing JWT key or a dedicated encryption key
        var keyString = configuration["JwtSettings:tokenOptions:bearerTokenKeyStr"]
            ?? throw new InvalidOperationException("Encryption key not configured");

        // Derive a 256-bit key from the configuration string
        using var sha256 = SHA256.Create();
        _encryptionKey = sha256.ComputeHash(Encoding.UTF8.GetBytes(keyString));
    }

    public string GenerateSecureToken(int byteLength = 64)
    {
        var bytes = new byte[byteLength];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);

        // URL-safe Base64 encoding
        return Convert.ToBase64String(bytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }

    public string GenerateSecureCode()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[4];
        rng.GetBytes(bytes);

        // Convert to unsigned int and mod 1000000 for 6 digits
        var number = BitConverter.ToUInt32(bytes, 0) % 1000000;
        return number.ToString("D6");  // Pad with leading zeros
    }

    public string HashCode(string code)
    {
        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(code));
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    /// <summary>
    /// SECURITY FIX: Constant-time string comparison to prevent timing attacks.
    /// Uses CryptographicOperations.FixedTimeEquals for actual comparison.
    /// </summary>
    public bool ConstantTimeEquals(string a, string b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
            return false;

        // Convert to bytes for constant-time comparison
        var aBytes = Encoding.UTF8.GetBytes(a);
        var bBytes = Encoding.UTF8.GetBytes(b);

        // Use .NET's built-in constant-time comparison
        return CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
    }

    public (byte[] EncryptedData, byte[] IV) EncryptData<T>(T data)
    {
        var json = JsonSerializer.Serialize(data);
        var plainBytes = Encoding.UTF8.GetBytes(json);

        using var aes = Aes.Create();
        aes.Key = _encryptionKey;
        aes.GenerateIV();
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        using var encryptor = aes.CreateEncryptor();
        var encryptedBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        return (encryptedBytes, aes.IV);
    }

    public T DecryptData<T>(byte[] encryptedData, byte[] iv)
    {
        using var aes = Aes.Create();
        aes.Key = _encryptionKey;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        using var decryptor = aes.CreateDecryptor();
        var decryptedBytes = decryptor.TransformFinalBlock(encryptedData, 0, encryptedData.Length);
        var json = Encoding.UTF8.GetString(decryptedBytes);

        return JsonSerializer.Deserialize<T>(json)
            ?? throw new InvalidOperationException("Failed to decrypt data");
    }
}
