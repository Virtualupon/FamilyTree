using System.Text.RegularExpressions;

namespace FamilyTreeApi.Services;

/// <summary>
/// Local file system storage implementation
/// </summary>
public class LocalFileStorageService : IFileStorageService
{
    private readonly string _basePath;
    private readonly ILogger<LocalFileStorageService> _logger;

    // Pattern to match dangerous path characters
    private static readonly Regex InvalidPathChars = new(@"[<>:""|?*\x00-\x1F]", RegexOptions.Compiled);
    private static readonly Regex InvalidFileNameChars = new(@"[<>:""/\\|?*\x00-\x1F]", RegexOptions.Compiled);

    public LocalFileStorageService(IConfiguration configuration, ILogger<LocalFileStorageService> logger)
    {
        _basePath = configuration["FileStorage:BasePath"]
            ?? Path.Combine(Directory.GetCurrentDirectory(), "storage", "media");
        _logger = logger;

        // Ensure base directory exists
        if (!Directory.Exists(_basePath))
        {
            Directory.CreateDirectory(_basePath);
            _logger.LogInformation("Created storage base directory: {BasePath}", _basePath);
        }
    }

    public async Task<string> SaveFileAsync(byte[] data, string fileName, string subDirectory)
    {
        ArgumentNullException.ThrowIfNull(data);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);

        // Sanitize inputs
        var sanitizedFileName = SanitizeFileName(fileName);
        var sanitizedSubDir = SanitizeSubDirectory(subDirectory);

        // Generate unique filename with GUID prefix to prevent collisions
        var extension = Path.GetExtension(sanitizedFileName);
        var uniqueFileName = $"{Guid.NewGuid()}_{sanitizedFileName}";

        // Build full directory path
        var directoryPath = Path.Combine(_basePath, sanitizedSubDir);

        // Validate path safety (prevent directory traversal)
        var fullDirectoryPath = Path.GetFullPath(directoryPath);
        var basePath = Path.GetFullPath(_basePath);

        if (!fullDirectoryPath.StartsWith(basePath, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Directory traversal attempt detected: {SubDirectory}", subDirectory);
            throw new InvalidOperationException("Invalid storage path");
        }

        // Create directory if not exists
        if (!Directory.Exists(fullDirectoryPath))
        {
            Directory.CreateDirectory(fullDirectoryPath);
        }

        // Build relative storage path
        var relativePath = Path.Combine(sanitizedSubDir, uniqueFileName);
        var fullPath = Path.Combine(_basePath, relativePath);

        // Write file
        await File.WriteAllBytesAsync(fullPath, data);

        _logger.LogInformation("Saved file: {RelativePath} ({Size} bytes)", relativePath, data.Length);

        return relativePath;
    }

    public async Task<byte[]> GetFileAsync(string storagePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storagePath);

        var fullPath = GetSafeFullPath(storagePath);

        if (!File.Exists(fullPath))
        {
            _logger.LogWarning("File not found: {StoragePath}", storagePath);
            throw new FileNotFoundException("File not found", storagePath);
        }

        return await File.ReadAllBytesAsync(fullPath);
    }

    public Task DeleteFileAsync(string storagePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storagePath);

        var fullPath = GetSafeFullPath(storagePath);

        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            _logger.LogInformation("Deleted file: {StoragePath}", storagePath);
        }
        else
        {
            _logger.LogWarning("Attempted to delete non-existent file: {StoragePath}", storagePath);
        }

        return Task.CompletedTask;
    }

    public bool FileExists(string storagePath)
    {
        if (string.IsNullOrWhiteSpace(storagePath))
            return false;

        try
        {
            var fullPath = GetSafeFullPath(storagePath);
            return File.Exists(fullPath);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Validates and returns safe full path, preventing directory traversal attacks
    /// </summary>
    private string GetSafeFullPath(string storagePath)
    {
        var sanitizedPath = storagePath
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar);

        var fullPath = Path.GetFullPath(Path.Combine(_basePath, sanitizedPath));
        var basePath = Path.GetFullPath(_basePath);

        if (!fullPath.StartsWith(basePath, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Directory traversal attempt detected: {StoragePath}", storagePath);
            throw new InvalidOperationException("Invalid storage path");
        }

        return fullPath;
    }

    /// <summary>
    /// Sanitizes file name by removing dangerous characters
    /// </summary>
    private static string SanitizeFileName(string fileName)
    {
        // Get just the filename without any path components
        var name = Path.GetFileName(fileName);

        // Remove invalid characters
        name = InvalidFileNameChars.Replace(name, "_");

        // Remove leading/trailing dots and spaces
        name = name.Trim('.', ' ');

        // If name is empty after sanitization, use a default
        if (string.IsNullOrWhiteSpace(name))
        {
            name = "file";
        }

        // Limit length
        if (name.Length > 200)
        {
            var ext = Path.GetExtension(name);
            var baseName = Path.GetFileNameWithoutExtension(name);
            name = baseName[..Math.Min(baseName.Length, 200 - ext.Length)] + ext;
        }

        return name;
    }

    /// <summary>
    /// Sanitizes subdirectory path by removing dangerous characters
    /// </summary>
    private static string SanitizeSubDirectory(string subDirectory)
    {
        if (string.IsNullOrWhiteSpace(subDirectory))
            return string.Empty;

        // Normalize separators
        var sanitized = subDirectory
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar);

        // Split into parts and sanitize each
        var parts = sanitized.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
        var sanitizedParts = new List<string>();

        foreach (var part in parts)
        {
            // Skip parent directory references
            if (part == ".." || part == ".")
                continue;

            // Remove invalid characters
            var sanitizedPart = InvalidPathChars.Replace(part, "_").Trim('.', ' ');

            if (!string.IsNullOrWhiteSpace(sanitizedPart))
            {
                sanitizedParts.Add(sanitizedPart);
            }
        }

        return string.Join(Path.DirectorySeparatorChar.ToString(), sanitizedParts);
    }
}
