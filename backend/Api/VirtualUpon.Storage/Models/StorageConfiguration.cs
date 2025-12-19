using System.ComponentModel.DataAnnotations;

public class StorageConfiguration
{
    [Required(ErrorMessage = "StorageType is required.")]
    public required string StorageType { get; set; } = "local";


    [Required(ErrorMessage = "CompressionEnabled is required.")]
    // Default = false
    public bool CompressionEnabled { get; set; } = false;

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
    public string BasePath { get; set; }
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
