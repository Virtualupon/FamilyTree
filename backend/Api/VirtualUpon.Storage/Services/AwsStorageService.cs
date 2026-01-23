using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Caching.Distributed;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;

namespace VirtualUpon.Storage.Services
{
    public class AwsStorageService : IStorageService
    {
        private readonly IAmazonS3 _s3Client;
        private readonly string _bucketName;
        private readonly string _serviceURL;
        private readonly string _basePath;
        private readonly StorageConfiguration _config;
        private readonly int _storageTypeInt;
        private readonly bool _compressionEnabled;
        private readonly bool _storageCacheEnabled;
        private readonly IDistributedCache? _cache;

        public AwsStorageService(StorageConfiguration configuration, IDistributedCache? cache = null)
        {
            _config = configuration ?? throw new ArgumentNullException(nameof(configuration), "AWS configuration cannot be null.");
            _cache = cache;
            if (configuration.AWS == null ||
                string.IsNullOrEmpty(configuration.AWS.AccessKey) ||
                string.IsNullOrEmpty(configuration.AWS.SecretKey) ||
                string.IsNullOrEmpty(configuration.AWS.Region))
            {
                throw new ArgumentException("AWS configuration must include AWS, AccessKey, SecretKey, and Region.");
            }

            _bucketName = configuration.AWS.BucketName ?? throw new ArgumentNullException(nameof(configuration.AWS.BucketName), "Bucket name cannot be null.");
            _serviceURL = configuration.AWS.Region;
            _basePath = configuration.AWS.BasePath;

            var s3Config = new AmazonS3Config
            {
                RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(configuration.AWS.Region)
            };
            _s3Client = new AmazonS3Client(configuration.AWS.AccessKey, configuration.AWS.SecretKey, s3Config);

            _storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(configuration.StorageType);
            _compressionEnabled = configuration.CompressionEnabled;
            _storageCacheEnabled = configuration.StorageCacheEnabled;
        }

        public async Task<SavedImageInfoDto> UploadFileAsync(string[] pathSegments, string fileName, byte[] data)
        {
            if (string.IsNullOrEmpty(fileName))
                throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
            if (data == null || data.Length == 0)
                throw new ArgumentException("File data cannot be null or empty.", nameof(data));

            try
            {
                // Compress data if enabled
                if (_compressionEnabled)
                {
                    data = FileCompressionUtility.Compress(data);
                }

                var allPathSegments = new List<string> { _basePath };
                allPathSegments.AddRange(pathSegments);
                string key = StorageFilePath.BuildKey(allPathSegments.ToArray(), fileName);

                using (var memoryStream = new MemoryStream(data))
                {
                    var putRequest = new PutObjectRequest
                    {
                        BucketName = _bucketName,
                        Key = key,
                        InputStream = memoryStream,
                        CannedACL = S3CannedACL.PublicRead // Optional: Adjust ACL settings as needed
                    };

                    await _s3Client.PutObjectAsync(putRequest);

                    string imagePath = StorageFilePath.BuildImagePath(_serviceURL, _bucketName, key);

                    // Cache the data if enabled
                    if (_storageCacheEnabled && _cache != null)
                    {
                        string dataCacheKey = $"awsFile:{fileName}:data";
                        await _cache.SetAsync(dataCacheKey, data, new DistributedCacheEntryOptions
                        {
                            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                        });
                    }

                    return new SavedImageInfoDto
                    {
                        StorageType = _storageTypeInt,
                        ImagePath = imagePath
                    };
                }
            }
            catch (AmazonS3Exception ex)
            {
                throw new InvalidOperationException($"AWS S3 error occurred while uploading '{fileName}': {ex.Message}", ex);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"An unexpected error occurred while uploading '{fileName}': {ex.Message}", ex);
            }
        }

        public async Task<DownloadFileResponseDto> DownloadFileAsync(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
            {
                return new DownloadFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = "File name cannot be null or empty."
                };
            }

            byte[]? fileData = null;

            // Attempt to retrieve data from cache if enabled
            if (_storageCacheEnabled && _cache != null)
            {
                string dataCacheKey = $"awsFile:{fileName}:data";
                fileData = await _cache.GetAsync(dataCacheKey);

                if (fileData != null)
                {
                    // Decompress data if enabled
                    if (_compressionEnabled)
                    {
                        try
                        {
                            fileData = FileCompressionUtility.Decompress(fileData);
                        }
                        catch (Exception ex)
                        {
                            return new DownloadFileResponseDto
                            {
                                IsSuccessful = false,
                                ErrorMessage = $"Error decompressing cached data for file '{fileName}': {ex.Message}"
                            };
                        }
                    }

                    return new DownloadFileResponseDto
                    {
                        IsSuccessful = true,
                        FileData = fileData,
                        AdditionalInfo = $"File '{fileName}' retrieved from cache."
                    };
                }
            }

            // If not cached, download from S3
            string key = StorageFilePath.ExtractKeyFromFileName(fileName, _serviceURL, _bucketName);
            try
            {
                var request = new GetObjectRequest
                {
                    BucketName = _bucketName,
                    Key = key
                };

                using var response = await _s3Client.GetObjectAsync(request);
                using var memoryStream = new MemoryStream();
                await response.ResponseStream.CopyToAsync(memoryStream);
                fileData = memoryStream.ToArray();

                // Decompress data if enabled
                if (_compressionEnabled)
                {
                    try
                    {
                        fileData = FileCompressionUtility.Decompress(fileData);
                    }
                    catch (Exception ex)
                    {
                        return new DownloadFileResponseDto
                        {
                            IsSuccessful = false,
                            ErrorMessage = $"Error decompressing downloaded data for file '{fileName}': {ex.Message}"
                        };
                    }
                }

                // Cache the data for future use
                if (_storageCacheEnabled && _cache != null)
                {
                    string dataCacheKey = $"awsFile:{fileName}:data";
                    await _cache.SetAsync(dataCacheKey, fileData, new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });
                }

                return new DownloadFileResponseDto
                {
                    IsSuccessful = true,
                    FileData = fileData,
                    AdditionalInfo = $"File '{fileName}' successfully downloaded from AWS S3."
                };
            }
            catch (AmazonS3Exception ex)
            {
                return new DownloadFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"AWS S3 error occurred while downloading '{fileName}': {ex.Message}"
                };
            }
            catch (Exception ex)
            {
                return new DownloadFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"An unexpected error occurred while downloading '{fileName}': {ex.Message}"
                };
            }
        }

        public async Task<DeleteFileResponseDto> DeleteFileAsync(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
            {
                return new DeleteFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = "File name cannot be null or empty."
                };
            }

            string key = StorageFilePath.ExtractKeyFromFileName(fileName, _serviceURL, _bucketName);

            try
            {
                var request = new DeleteObjectRequest
                {
                    BucketName = _bucketName,
                    Key = key
                };

                await _s3Client.DeleteObjectAsync(request);

                // Remove cached data if enabled
                if (_storageCacheEnabled && _cache != null)
                {
                    string dataCacheKey = $"awsFile:{fileName}:data";
                    await _cache.RemoveAsync(dataCacheKey);
                }

                return new DeleteFileResponseDto
                {
                    IsSuccessful = true,
                    DeletedFilePath = $"{_bucketName}/{key}",
                    AdditionalInfo = $"File successfully deleted from AWS S3 at key '{key}'."
                };
            }
            catch (AmazonS3Exception ex)
            {
                return new DeleteFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"AWS S3 error occurred while deleting '{fileName}': {ex.Message}"
                };
            }
            catch (Exception ex)
            {
                return new DeleteFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"An unexpected error occurred while deleting '{fileName}': {ex.Message}"
                };
            }
        }

        #region Signed URL Methods

        /// <summary>
        /// Generates a pre-signed URL for secure file access from AWS S3.
        /// </summary>
        public Task<SignedUrlResponseDto> GetSignedUrlAsync(string filePath, int expiresInSeconds = 3600)
        {
            try
            {
                if (string.IsNullOrEmpty(filePath))
                {
                    return Task.FromResult(new SignedUrlResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = "File path cannot be null or empty."
                    });
                }

                // Enforce maximum expiration of 24 hours (AWS limit is 7 days, but we cap at 24h)
                const int maxExpirationSeconds = 86400;
                expiresInSeconds = Math.Min(Math.Max(expiresInSeconds, 1), maxExpirationSeconds);

                // Extract the key from the file path
                string key = StorageFilePath.ExtractKeyFromFileName(filePath, _serviceURL, _bucketName);

                // If key doesn't contain the base path, prepend it
                if (!string.IsNullOrEmpty(_basePath) && !key.StartsWith(_basePath))
                {
                    key = $"{_basePath.TrimEnd('/')}/{key}";
                }

                var request = new GetPreSignedUrlRequest
                {
                    BucketName = _bucketName,
                    Key = key,
                    Expires = DateTime.UtcNow.AddSeconds(expiresInSeconds),
                    Verb = HttpVerb.GET
                };

                string url = _s3Client.GetPreSignedURL(request);
                string contentType = MediaTypeHelper.GetContentType(filePath);

                return Task.FromResult(new SignedUrlResponseDto
                {
                    IsSuccessful = true,
                    Url = url,
                    ExpiresAt = DateTime.UtcNow.AddSeconds(expiresInSeconds),
                    ContentType = contentType
                });
            }
            catch (AmazonS3Exception ex)
            {
                return Task.FromResult(new SignedUrlResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"AWS S3 error generating signed URL: {ex.Message}"
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new SignedUrlResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"Failed to generate signed URL: {ex.Message}"
                });
            }
        }

        /// <summary>
        /// Not applicable for AWS S3 storage. Always returns false.
        /// </summary>
        public bool ValidateSignedToken(string fileName, string token, long expires) => false;

        /// <summary>
        /// Not applicable for AWS S3 storage. Always returns null.
        /// </summary>
        public string? GetLocalFilePath(string fileName) => null;

        #endregion
    }
}



//using Amazon.S3;
//using Amazon.S3.Model;
//using System;
//using System.IO;
//using System.Linq;
//using System.Threading.Tasks;
//using VirtualUpon.Storage.Dto;
//using VirtualUpon.Storage.Factories;
//using VirtualUpon.Storage.Utilities;

//namespace VirtualUpon.Storage.Services
//{
//    public class AwsStorageService : IStorageService
//    {
//        private readonly IAmazonS3 _s3Client;
//        private readonly string _bucketName;
//        private readonly string _serviceURL;
//        private readonly string _basePath;
//        private readonly StorageConfiguration _config;
//        private readonly int storageTypeInt;



//        public AwsStorageService(StorageConfiguration configuration)
//        {

//            _config = configuration;


//            if (configuration == null) throw new ArgumentNullException(nameof(configuration), "AWS configuration cannot be null.");
//            if (string.IsNullOrEmpty(configuration.AWS.AccessKey) || string.IsNullOrEmpty(configuration.AWS.SecretKey) || string.IsNullOrEmpty(configuration.AWS.Region))
//            {
//                throw new ArgumentException("AWS configuration must include AccessKey, SecretKey, and Region.");
//            }

//            _bucketName = configuration.AWS.BucketName ?? throw new ArgumentNullException(nameof(configuration.AWS.BucketName), "Bucket name cannot be null.");
//            // _prefixSegments = prefixSegments ?? Array.Empty<string>();
//            _serviceURL = configuration.AWS.Region;
//            _basePath = configuration.AWS.BasePath;




//             var config = new AmazonS3Config
//            {
//                RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(configuration.AWS.Region)
//            };
//            _s3Client = new AmazonS3Client(configuration.AWS.AccessKey, configuration.AWS.SecretKey, config);

//            storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(configuration.StorageType);
//        }

//        private string BuildFullPath(string[] pathSegments, string fileName)
//        {
//            var combinedSegments = pathSegments.Concat(pathSegments ?? Array.Empty<string>());
//            var path = string.Join("/", combinedSegments.Where(segment => !string.IsNullOrWhiteSpace(segment)));
//            return string.IsNullOrWhiteSpace(path) ? fileName : $"{path}/{fileName}".Trim('/');
//        }



//        public async Task<SavedImageInfoDto> UploadFileAsync( string[] pathSegments, string fileName, byte[] data)
//        {
//            if (string.IsNullOrEmpty(fileName))
//                throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
//            if (data == null || data.Length == 0)
//                throw new ArgumentException("File data cannot be null or empty.", nameof(data));

//            try
//            {
//                // Use a utility method to build the key from path segments and the file name
//               // string key = StorageFilePath.BuildKey(pathSegments, fileName);
//                // Combining _basePath and provided path segments to build the full key
//                var allPathSegments = new List<string> { _basePath };
//                allPathSegments.AddRange(pathSegments);

//                // Building the full key using the utility method
//                string key = StorageFilePath.BuildKey(allPathSegments.ToArray(), fileName);



//                using (var memoryStream = new MemoryStream(data))
//                {
//                    var putRequest = new PutObjectRequest
//                    {
//                        BucketName = _bucketName,
//                        Key = key,
//                        InputStream = memoryStream,
//                        CannedACL = S3CannedACL.PublicRead // Optional: Adjust ACL settings as needed
//                    };

//                    await _s3Client.PutObjectAsync(putRequest);

//                    // Use utility method to build image path if needed (assuming public URL)
//                    string imagePath = StorageFilePath.BuildImagePath(_serviceURL, _bucketName, key);

//                    return new SavedImageInfoDto
//                    {
//                        StorageType = storageTypeInt, // Example: 3 represents AWS storage
//                        ImagePath = imagePath
//                    };
//                }
//            }
//            catch (AmazonS3Exception ex)
//            {
//                throw new InvalidOperationException($"AWS S3 error occurred while uploading '{fileName}': {ex.Message}", ex);
//            }
//            catch (Exception ex)
//            {
//                throw new InvalidOperationException($"An unexpected error occurred while uploading '{fileName}': {ex.Message}", ex);
//            }
//        }

//        public async Task<DownloadFileResponseDto> DownloadFileAsync(string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName))
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = "File name cannot be null or empty."
//                };
//            }

//            // Extract the key using a utility function to ensure consistent behavior
//            string key = StorageFilePath.ExtractKeyFromFileName(fileName, _serviceURL, _bucketName);


//            try
//            {
//                var request = new GetObjectRequest
//                {
//                    BucketName = _bucketName,
//                    Key = key
//                };

//                using var response = await _s3Client.GetObjectAsync(request);
//                using var memoryStream = new MemoryStream();
//                await response.ResponseStream.CopyToAsync(memoryStream);

//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = true,
//                    FileData = memoryStream.ToArray(),
//                    AdditionalInfo = $"File '{fileName}' successfully downloaded from AWS S3 at key '{key}'."
//                };
//            }
//            catch (AmazonS3Exception ex)
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"AWS S3 error occurred while downloading '{fileName}': {ex.Message}",
//                    StatusCode = ex.StatusCode.ToString()
//                };
//            }
//            catch (Exception ex)
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"An unexpected error occurred while downloading '{fileName}': {ex.Message}"
//                };
//            }
//        }

//        private bool IsFullKey(string fileName)
//        {
//            return fileName.Contains("/") || fileName.Contains("\\");
//        }


//        public async Task<DeleteFileResponseDto> DeleteFileAsync(string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName))
//            {
//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = "File URL cannot be null or empty."
//                };
//            }

//            // Extract key from the URL (assuming _serviceURL and _bucketName are known)
//          //  string key = fileUrl.Replace($"{_serviceURL}/{_bucketName}/", "").TrimStart('/');
//            string key = StorageFilePath.ExtractKeyFromFileName(fileName, _serviceURL, _bucketName);

//            try
//            {
//                var request = new DeleteObjectRequest
//                {
//                    BucketName = _bucketName,
//                    Key = key
//                };

//                await _s3Client.DeleteObjectAsync(request);

//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = true,
//                    DeletedFilePath = $"{_bucketName}/{key}",
//                    AdditionalInfo = $"File successfully deleted from AWS S3 at key '{key}'."
//                };
//            }
//            catch (AmazonS3Exception ex)
//            {
//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"AWS S3 error occurred while deleting '{fileName}': {ex.Message}"
//                };
//            }
//            catch (Exception ex)
//            {
//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"An unexpected error occurred while deleting '{fileName}': {ex.Message}"
//                };
//            }
//        }

//        public async Task<bool> FileExistsAsync(string[] pathSegments, string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName)) throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

//            string key = BuildFullPath(pathSegments, fileName);

//            try
//            {
//                var request = new ListObjectsV2Request
//                {
//                    BucketName = _bucketName,
//                    Prefix = key
//                };

//                var response = await _s3Client.ListObjectsV2Async(request);
//                return response.S3Objects.Any();
//            }
//            catch (AmazonS3Exception ex)
//            {
//                throw new InvalidOperationException($"AWS S3 error occurred while checking existence of '{fileName}': {ex.Message}", ex);
//            }
//            catch (Exception ex)
//            {
//                throw new InvalidOperationException($"An unexpected error occurred while checking existence of '{fileName}': {ex.Message}", ex);
//            }
//        }
//    }
//}
