namespace FamilyTreeApi.Storage;

/// <summary>
/// Helper for storage type conversions
/// </summary>
public static class StorageTypeHelper
{
    public static int ConvertStorageTypeToInt(string storageType)
    {
        return storageType?.ToLowerInvariant() switch
        {
            "local" => 1,
            "linode" => 2,
            "aws" or "s3" => 3,
            "nextcloud" => 4,
            "cloudflare" or "r2" => 5,
            _ => 1 // Default to local
        };
    }

    public static string ConvertIntToStorageType(int storageType)
    {
        return storageType switch
        {
            1 => "local",
            2 => "linode",
            3 => "aws",
            4 => "nextcloud",
            5 => "cloudflare",
            _ => "local"
        };
    }
}
