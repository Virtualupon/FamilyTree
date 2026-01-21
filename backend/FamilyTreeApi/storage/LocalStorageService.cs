using FamilyTreeApi.Models.Configuration;
using Microsoft.Extensions.Caching.Distributed;

namespace FamilyTreeApi.Storage;

/// <summary>
/// Local file system storage service implementation
/// </summary>
public class LocalStorageService : IStorageService
{
    private readonly StorageConfiguration _config;
    private readonly ILogger<LocalStorageService>? _logger;
    private readonly string _basePath;

    public LocalStorageService(StorageConfiguration config, IDistributedCache? cache = null, ILogger<LocalStorageService>? logger = null)
    {
        _config = config;
        _logger = logger;
        _basePath = config.LocalStorage?.BasePath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");

        // Ensure base directory exists
        if (!Directory.Exists(_basePath))
        {
            Directory.CreateDirectory(_basePath);
        }
    }

    public async Task<SavedMediaInfo> UploadFileAsync(string[] pathSegments, string fileName, byte[] data)
    {
        try
        {
            // Build full path
            var relativePath = Path.Combine(pathSegments);
            var directoryPath = Path.Combine(_basePath, relativePath);

            // Ensure directory exists
            if (!Directory.Exists(directoryPath))
            {
                Directory.CreateDirectory(directoryPath);
            }

            var fullPath = Path.Combine(directoryPath, fileName);

            // Write file
            await File.WriteAllBytesAsync(fullPath, data);

            // Build URL path (relative to web root)
            var urlPath = $"/uploads/{string.Join("/", pathSegments)}/{fileName}";

            _logger?.LogInformation("Uploaded file to {Path}", fullPath);

            return new SavedMediaInfo
            {
                ImagePath = urlPath,
                StorageKey = $"{string.Join("/", pathSegments)}/{fileName}"
            };
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error uploading file {FileName}", fileName);
            throw;
        }
    }

    public async Task<DownloadResponse> DownloadFileAsync(string url)
    {
        try
        {
            // Convert URL to file path
            var relativePath = url.TrimStart('/').Replace("uploads/", "");
            var fullPath = Path.Combine(_basePath, relativePath);

            if (!File.Exists(fullPath))
            {
                _logger?.LogWarning("File not found: {Path}", fullPath);
                return new DownloadResponse { FileData = null };
            }

            var data = await File.ReadAllBytesAsync(fullPath);
            var mimeType = GetMimeType(fullPath);

            return new DownloadResponse
            {
                FileData = data,
                MimeType = mimeType
            };
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error downloading file from {Url}", url);
            return new DownloadResponse { FileData = null };
        }
    }

    public Task DeleteFileAsync(string url)
    {
        try
        {
            var relativePath = url.TrimStart('/').Replace("uploads/", "");
            var fullPath = Path.Combine(_basePath, relativePath);

            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
                _logger?.LogInformation("Deleted file: {Path}", fullPath);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error deleting file {Url}", url);
        }

        return Task.CompletedTask;
    }

    private static string GetMimeType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            ".mov" => "video/quicktime",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".ogg" => "audio/ogg",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream"
        };
    }
}
