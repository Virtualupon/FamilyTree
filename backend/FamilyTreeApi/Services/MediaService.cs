using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.Models.Enums;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;

namespace FamilyTreeApi.Services;

public class MediaService : IMediaService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<MediaService> _logger;
    private readonly IDistributedCache _cache;
    private readonly StorageConfiguration _storageConfig;
    private readonly IStorageService _storageService;
    private readonly int _currentStorageType;

    public MediaService(
        ApplicationDbContext context,
        ILogger<MediaService> logger,
        StorageConfiguration storageConfig,
        IDistributedCache cache,
        IStorageService storageService)
    {
        _context = context;
        _logger = logger;
        _cache = cache;
        _storageConfig = storageConfig;
        _storageService = storageService;
        _currentStorageType = StorageTypeHelper.ConvertStorageTypeToInt(storageConfig.StorageType);
    }

    public async Task<Media> UploadMediaAsync(
        Guid personId,
        string base64Data,
        string fileName,
        string? mimeType = null,
        string? caption = null,
        string? copyright = null)
    {
        try
        {
            // Convert Base64 to bytes
            var mediaBytes = Base64ToBytes(base64Data);

            // Determine media kind from MIME type
            var mediaKind = DetermineMediaKind(mimeType ?? GetMimeTypeFromExtension(fileName));

            // Determine file extension
            var extension = Path.GetExtension(fileName);
            if (string.IsNullOrEmpty(extension))
            {
                extension = GetExtensionFromMimeType(mimeType ?? "application/octet-stream");
            }

            // Generate unique filename
            var uniqueFileName = $"{mediaKind}_{Guid.NewGuid()}{extension}";

            // Define storage path segments
            string[] pathSegments = new[] { "family-tree", "people", personId.ToString(), mediaKind.ToString().ToLower() };

            // Upload to storage
            var savedMediaInfo = await _storageService.UploadFileAsync(
                pathSegments,
                uniqueFileName,
                mediaBytes
            );

            // Get file size
            var fileSize = mediaBytes.Length;

            // Get OrgId from Person
            var person = await _context.People.FindAsync(personId);
            var orgId = person?.OrgId ?? Guid.Empty;

            // Create media record
            var media = new Media
            {
                Id = Guid.NewGuid(),
                OrgId = orgId,
                PersonId = personId,
                Url = savedMediaInfo.ImagePath,
                StorageKey = $"{string.Join("/", pathSegments)}/{uniqueFileName}",
                FileName = fileName,
                MimeType = mimeType,
                FileSize = fileSize,
                Kind = mediaKind,
                StorageType = _currentStorageType,
                Title = caption,
                Copyright = copyright,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _context.MediaFiles.AddAsync(media);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Uploaded media {FileName} ({MediaKind}) for person {PersonId}",
                fileName,
                mediaKind,
                personId);

            return media;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading media for person {PersonId}", personId);
            throw;
        }
    }

    public async Task<string?> GetMediaAsBase64Async(Guid mediaId)
    {
        try
        {
            var media = await _context.MediaFiles
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.Id == mediaId);

            if (media == null || string.IsNullOrEmpty(media.Url))
                return null;

            var storageService = GetStorageServiceByType(media.StorageType);
            var response = await storageService.DownloadFileAsync(media.Url);

            return BytesToBase64(response.FileData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving media {MediaId} as Base64", mediaId);
            return null;
        }
    }

    public async Task<(byte[] data, string mimeType)?> GetMediaBytesAsync(Guid mediaId)
    {
        try
        {
            var media = await _context.MediaFiles
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.Id == mediaId);

            if (media == null || string.IsNullOrEmpty(media.Url))
                return null;

            var storageService = GetStorageServiceByType(media.StorageType);
            var response = await storageService.DownloadFileAsync(media.Url);

            return (response.FileData, media.MimeType ?? "application/octet-stream");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving media bytes {MediaId}", mediaId);
            return null;
        }
    }

    public async Task<bool> DeleteMediaAsync(Guid mediaId)
    {
        try
        {
            var media = await _context.MediaFiles.FindAsync(mediaId);
            if (media == null)
                return false;

            // Delete from storage
            if (!string.IsNullOrEmpty(media.Url))
            {
                try
                {
                    var storageService = GetStorageServiceByType(media.StorageType);
                    await storageService.DeleteFileAsync(media.Url);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete media file from storage: {Url}", media.Url);
                }
            }

            // Delete from database
            _context.MediaFiles.Remove(media);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Deleted media {MediaId}", mediaId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media {MediaId}", mediaId);
            return false;
        }
    }

    public async Task<IEnumerable<Media>> GetPersonMediaAsync(Guid personId)
    {
        return await _context.MediaFiles
            .AsNoTracking()
            .Where(m => m.PersonId == personId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();
    }

    private IStorageService GetStorageServiceByType(int storageType)
    {
        var cache = _cache;

        return storageType switch
        {
            1 => StorageServiceFactory.CreateLocalStorageService(_storageConfig, cache),
            2 => StorageServiceFactory.CreateLinodeStorageService(_storageConfig, cache),
            3 => StorageServiceFactory.CreateAwsStorageService(_storageConfig, cache),
            4 => StorageServiceFactory.CreateNextCloudStorageService(_storageConfig, new WebDav.WebDavClient(), new HttpClient(), cache),
            5 => StorageServiceFactory.CreateCloudflareStorageService(_storageConfig, cache),
            _ => throw new ArgumentException($"Unsupported storage type: {storageType}")
        };
    }

    private static byte[] Base64ToBytes(string base64)
    {
        if (base64.Contains(','))
        {
            base64 = base64.Split(',')[1];
        }
        return Convert.FromBase64String(base64);
    }

    private static string BytesToBase64(byte[] bytes)
    {
        return Convert.ToBase64String(bytes);
    }

    private static MediaKind DetermineMediaKind(string mimeType)
    {
        if (mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return MediaKind.Image;
        if (mimeType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
            return MediaKind.Video;
        if (mimeType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
            return MediaKind.Audio;

        return MediaKind.Document;
    }

    private static string GetExtensionFromMimeType(string mimeType)
    {
        return mimeType.ToLower() switch
        {
            "image/jpeg" => ".jpg",
            "image/jpg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            "video/mp4" => ".mp4",
            "video/webm" => ".webm",
            "video/quicktime" => ".mov",
            "audio/mpeg" => ".mp3",
            "audio/mp3" => ".mp3",
            "audio/wav" => ".wav",
            "audio/webm" => ".webm",
            "audio/ogg" => ".ogg",
            "application/pdf" => ".pdf",
            _ => ".bin"
        };
    }

    private static string GetMimeTypeFromExtension(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLower();
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
