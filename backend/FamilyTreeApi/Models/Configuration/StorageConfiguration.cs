namespace FamilyTreeApi.Models.Configuration;

public class StorageConfiguration
{
    public string StorageType { get; set; } = "LocalStorage";
    public LocalStorageConfig? LocalStorage { get; set; }
    public AwsConfig? AWS { get; set; }
    public LinodeConfig? Linode { get; set; }
    public NextcloudConfig? Nextcloud { get; set; }
    public CloudflareConfig? Cloudflare { get; set; }
}

public class LocalStorageConfig
{
    public string BasePath { get; set; } = "/var/www/familytree/media/";
}

public class AwsConfig
{
    public string? AccessKey { get; set; }
    public string? SecretKey { get; set; }
    public string? Region { get; set; }
    public string? BucketName { get; set; }
}

public class LinodeConfig
{
    public string? AccessKey { get; set; }
    public string? SecretKey { get; set; }
    public string? S3Endpoint { get; set; }
    public string? BucketName { get; set; }
}

public class NextcloudConfig
{
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? BaseUrl { get; set; }
}

public class CloudflareConfig
{
    public string? AccountId { get; set; }
    public string? AccessKey { get; set; }
    public string? SecretKey { get; set; }
    public string? BucketName { get; set; }
}
