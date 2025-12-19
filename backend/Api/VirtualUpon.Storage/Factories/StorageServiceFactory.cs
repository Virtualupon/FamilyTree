using Microsoft.Extensions.Configuration;
using System;
using System.Net.Http;
//using VirtualUpon.Storage.Models;
using VirtualUpon.Storage.Services;
using WebDav;
using Microsoft.Extensions.Caching.Distributed;

namespace VirtualUpon.Storage.Factories
{
    public static class StorageServiceFactory
    {
        public static IStorageService CreateStorageService(StorageConfiguration config, IConfiguration configuration, 
            IWebDavClient webDavClient, HttpClient httpClient,
            IDistributedCache? cache = null)
        {
            if (config == null)
            {
                throw new ArgumentNullException(nameof(config), "Storage configuration cannot be null.");
            }

            // Extract the PathPrefix as an array of segments
            // string[] pathPrefixSegments = config.PathPrefix ?? new[] { "default", "path" }; // Fallback default segments if none are provided

            return config.StorageType.ToLower() switch
            {
                "local" => CreateLocalStorageService(config,  cache),
                "aws" => CreateAwsStorageService(config, cache),
                "linode" => CreateLinodeStorageService(config, cache),
                "nextcloud" => CreateNextCloudStorageService(config, webDavClient, httpClient, cache),
                "cloudflare" => CreateCloudflareStorageService(config, cache),
                _ => throw new ArgumentException($"Invalid storage type '{config.StorageType}'")
            };
        }

        public static IStorageService CreateLocalStorageService(StorageConfiguration config, IDistributedCache? cache)
        {
            if (config.LocalStorage == null)
            {
                throw new ArgumentNullException(nameof(config.LocalStorage), "Local storage configuration cannot be null.");
            }

            string basePath = config.LocalStorage.BasePath ?? throw new ArgumentNullException(nameof(config.LocalStorage.BasePath), "BasePath cannot be null for local storage.");
            return new LocalStorageService(config);
        }

        public static IStorageService CreateAwsStorageService(StorageConfiguration config, IDistributedCache? cache)
        {
            if (config.AWS == null)
            {
                throw new ArgumentNullException(nameof(config.AWS), "AWS configuration cannot be null.");
            }

            return new AwsStorageService(
                config
            );
        }

        public static IStorageService CreateLinodeStorageService(StorageConfiguration config, IDistributedCache? cache)
        {
            if (config.Linode == null)
            {
                throw new ArgumentNullException(nameof(config.Linode), "Linode configuration cannot be null.");
            }


            return new LinodeStorageClient(config);
        }

        public static IStorageService CreateNextCloudStorageService(StorageConfiguration config, IWebDavClient webDavClient, HttpClient httpClient, IDistributedCache? cache)
        {
            if (config.Nextcloud == null)
            {
                throw new ArgumentNullException(nameof(config.Nextcloud), "NextCloud configuration cannot be null.");
            }

            if (config == null)
            {
                throw new ArgumentNullException(nameof(config), "Configuration cannot be null.");
            }

            return new NextCloudStorageService(config, webDavClient, httpClient);
        }

        public static IStorageService CreateCloudflareStorageService(StorageConfiguration config, IDistributedCache? cache)
        {
            if (config.Cloudflare == null)
            {
                throw new ArgumentNullException(nameof(config.Cloudflare), "Cloudflare configuration cannot be null.");
            }

            return new CloudflareStorageService(config, cache);
        }
    }
}










//using Microsoft.Extensions.Configuration;
//using System;
//using System.Net.Http;
////using VirtualUpon.Storage.Models;
//using VirtualUpon.Storage.Services;
//using WebDav;

//namespace VirtualUpon.Storage.Factories
//{
//    public static class StorageServiceFactory
//    {
//        public static IStorageService CreateStorageService(StorageConfiguration config, IConfiguration configuration, IWebDavClient webDavClient, HttpClient httpClient)
//        {
//            if (config == null)
//            {
//                throw new ArgumentNullException(nameof(config), "Storage configuration cannot be null.");
//            }

//            // Extract the PathPrefix as an array of segments
//           // string[] pathPrefixSegments = config.PathPrefix ?? new[] { "default", "path" }; // Fallback default segments if none are provided

//            return config.StorageType.ToLower() switch
//            {
//                "local" => CreateLocalStorageService(config),
//                "aws" => CreateAwsStorageService(config),
//                "linode" => CreateLinodeStorageService(config),
//                "nextcloud" => CreateNextCloudStorageService(config,  webDavClient, httpClient),
//                _ => throw new ArgumentException($"Invalid storage type '{config.StorageType}'")
//            };
//        }

//        public static IStorageService CreateLocalStorageService(StorageConfiguration config)
//        {
//            if (config.LocalStorage == null)
//            {
//                throw new ArgumentNullException(nameof(config.LocalStorage), "Local storage configuration cannot be null.");
//            }

//            string basePath = config.LocalStorage.BasePath ?? throw new ArgumentNullException(nameof(config.LocalStorage.BasePath), "BasePath cannot be null for local storage.");
//            return new LocalStorageService(basePath);
//        }

//        public static IStorageService CreateAwsStorageService(StorageConfiguration config)
//        {
//            if (config.AWS == null)
//            {
//                throw new ArgumentNullException(nameof(config.AWS), "AWS configuration cannot be null.");
//            }

//            return new AwsStorageService(
//                config.AWS
//            );
//        }

//        public static IStorageService CreateLinodeStorageService(StorageConfiguration config)
//        {
//            if (config.Linode == null)
//            {
//                throw new ArgumentNullException(nameof(config.Linode), "Linode configuration cannot be null.");
//            }


//            return new LinodeStorageClient(config.Linode);
//        }

//        public static IStorageService CreateNextCloudStorageService(StorageConfiguration config, IWebDavClient webDavClient, HttpClient httpClient)
//        {
//            if (config.Nextcloud == null)
//            {
//                throw new ArgumentNullException(nameof(config.Nextcloud), "NextCloud configuration cannot be null.");
//            }

//            if (config == null)
//            {
//                throw new ArgumentNullException(nameof(config), "Configuration cannot be null.");
//            }

//            return new NextCloudStorageService(config.Nextcloud, webDavClient,  httpClient );
//        }
//    }
//}


