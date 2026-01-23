using System.ComponentModel.DataAnnotations;

public class StorageConfiguration
{
    [Required(ErrorMessage = "StorageType is required.")]
    public required string StorageType { get; set; } = "local";


    [Required(ErrorMessage = "CompressionEnabled is required.")]
    // Default = false
    public bool CompressionEnabled { get; set; } = false;

    /// <summary>
    /// When enabled, skips compression for already-compressed file types (media, images, archives).
    /// </summary>
    public bool SmartCompressionEnabled { get; set; } = false;

    [Required(ErrorMessage = "StorageCacheEnabled is required.")]
    public bool StorageCacheEnabled { get; set; } = false;

    public LocalStorageConfiguration? LocalStorage { get; set; }
    public AWSConfiguration? AWS { get; set; }
    public LinodeConfiguration? Linode { get; set; }
    public NextCloudConfiguration? Nextcloud { get; set; }
    public CloudflareConfiguration? Cloudflare { get; set; }
}

public class LocalStorageConfiguration
{
    /// <summary>
    /// The base directory path where files are stored locally.
    /// </summary>
    public string BasePath { get; set; }

    /// <summary>
    /// The base URL for generating signed URLs (e.g., "https://api.yourapp.com").
    /// Required for signed URL generation.
    /// </summary>
    public string? BaseUrl { get; set; }

    /// <summary>
    /// Template for generating signed URLs. Placeholders: {fileName}, {token}, {expires}.
    /// Example: "/media/stream/{fileName}?token={token}&amp;expires={expires}"
    /// </summary>
    public string? SignedUrlPathTemplate { get; set; }

    /// <summary>
    /// Secret key for HMAC token generation. Must be at least 32 characters.
    /// </summary>
    public string? TokenSecret { get; set; }
}

public class AWSConfiguration
{
    public string AccessKey { get; set; }
    public string SecretKey { get; set; }
    public string Region { get; set; }
    public string BucketName { get; set; }
    public string BasePath { get; set; }
}

public class LinodeConfiguration
{
    public string AccessKey { get; set; }
    public string SecretKey { get; set; }
    public string S3Endpoint { get; set; }
    public string BucketName { get; set; }
    public string BasePath { get; set; }
}

public class NextCloudConfiguration
{
    public string BaseUrl { get; set; }
    public string Username { get; set; }
    public string Password { get; set; }
    public string BasePath { get; set; }
}

public class CloudflareConfiguration
{
    public string AccountId { get; set; }
    public string AccessKey { get; set; }
    public string SecretKey { get; set; }
    public string BucketName { get; set; }
    public string BasePath { get; set; }
}
