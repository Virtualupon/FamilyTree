using FamilyTreeApi.Models.Configuration;
using Microsoft.Extensions.Caching.Distributed;
using WebDav;

namespace FamilyTreeApi.Storage;

/// <summary>
/// Factory for creating storage service instances based on configuration.
/// Currently only local storage is fully implemented.
/// Other storage types (Linode, AWS, NextCloud, Cloudflare) would need proper implementation.
/// </summary>
public static class StorageServiceFactory
{
    public static IStorageService CreateLocalStorageService(
        StorageConfiguration config,
        IDistributedCache? cache = null,
        ILogger<LocalStorageService>? logger = null)
    {
        return new LocalStorageService(config, cache, logger);
    }

    public static IStorageService CreateLinodeStorageService(
        StorageConfiguration config,
        IDistributedCache? cache = null)
    {
        // TODO: Implement Linode Object Storage support
        // For now, fall back to local storage
        return new LocalStorageService(config, cache);
    }

    public static IStorageService CreateAwsStorageService(
        StorageConfiguration config,
        IDistributedCache? cache = null)
    {
        // TODO: Implement AWS S3 support
        // For now, fall back to local storage
        return new LocalStorageService(config, cache);
    }

    public static IStorageService CreateNextCloudStorageService(
        StorageConfiguration config,
        IWebDavClient webDavClient,
        HttpClient httpClient,
        IDistributedCache? cache = null)
    {
        // TODO: Implement NextCloud WebDAV support
        // For now, fall back to local storage
        return new LocalStorageService(config, cache);
    }

    public static IStorageService CreateCloudflareStorageService(
        StorageConfiguration config,
        IDistributedCache? cache = null)
    {
        // TODO: Implement Cloudflare R2 support
        // For now, fall back to local storage
        return new LocalStorageService(config, cache);
    }
}
