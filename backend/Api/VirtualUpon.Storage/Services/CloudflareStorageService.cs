using Amazon;
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
    public class CloudflareStorageService : IStorageService
    {
        private readonly IAmazonS3 _s3Client;
        private readonly string _bucketName;
        private readonly string _serviceURL;
        private readonly string _basePath;
        private readonly int _storageTypeInt;
        private readonly bool _compressionEnabled;
        private readonly bool _storageCacheEnabled;
        private readonly IDistributedCache? _cache;

        public CloudflareStorageService(StorageConfiguration configuration, IDistributedCache? cache = null)
        {
            _cache = cache;

            if (configuration.Cloudflare == null ||
                string.IsNullOrEmpty(configuration.Cloudflare.AccountId) ||
                string.IsNullOrEmpty(configuration.Cloudflare.AccessKey) ||
                string.IsNullOrEmpty(configuration.Cloudflare.SecretKey))
            {
                throw new ArgumentException("Cloudflare configuration must include AccountId, AccessKey, and SecretKey.");
            }

            var accessKey = configuration.Cloudflare.AccessKey;
            var secretKey = configuration.Cloudflare.SecretKey;
            var accountId = configuration.Cloudflare.AccountId;
            
            // Cloudflare R2 endpoint format: https://<accountid>.r2.cloudflarestorage.com
            _serviceURL = $"https://{accountId}.r2.cloudflarestorage.com";
            _bucketName = configuration.Cloudflare.BucketName;
            _basePath = configuration.Cloudflare.BasePath;

            var s3Config = new AmazonS3Config
            {
                ServiceURL = _serviceURL,
                ForcePathStyle = true, // R2 works better with path-style
                UseHttp = false, // Always use HTTPS with R2
                SignatureVersion = "4" // Use AWS Signature Version 4
            };

            // Disable payload signing - R2 doesn't support STREAMING-AWS4-HMAC-SHA256-PAYLOAD
            AWSConfigsS3.UseSignatureVersion4 = true;

            _s3Client = new AmazonS3Client(accessKey, secretKey, s3Config);

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

                // Combine path segments to build the full key
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
                        DisablePayloadSigning = true // R2 doesn't support STREAMING-AWS4-HMAC-SHA256-PAYLOAD
                    };

                    await _s3Client.PutObjectAsync(putRequest);

                    string imagePath = StorageFilePath.BuildImagePath(_serviceURL, _bucketName, key);

                    // Cache the data if enabled
                    if (_storageCacheEnabled && _cache != null)
                    {
                        string dataCacheKey = $"cloudflareFile:{fileName}:data";
                        await _cache.SetAsync(dataCacheKey, data, new DistributedCacheEntryOptions
                        {
                            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                        });
                    }

                    return new SavedImageInfoDto
                    {
                        StorageType = _storageTypeInt,
                        ImagePath = imagePath,
                        Success = true
                    };
                }
            }
            catch (AmazonS3Exception ex)
            {
                throw new InvalidOperationException($"Cloudflare R2 error occurred while uploading '{fileName}': {ex.Message}", ex);
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
                string dataCacheKey = $"cloudflareFile:{fileName}:data";
                fileData = await _cache.GetAsync(dataCacheKey);

                if (fileData != null)
                {
                    // Decompress data if enabled
                    if (_compressionEnabled)
                    {
                        try
                        {
                            if (FileCompressionUtility.IsCompressed(fileData))
                            {
                                fileData = FileCompressionUtility.Decompress(fileData);
                            }
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

            // If not cached, download from R2
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
                        if (FileCompressionUtility.IsCompressed(fileData))
                        {
                            fileData = FileCompressionUtility.Decompress(fileData);
                        }
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
                    string dataCacheKey = $"cloudflareFile:{fileName}:data";
                    await _cache.SetAsync(dataCacheKey, fileData, new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });
                }

                return new DownloadFileResponseDto
                {
                    IsSuccessful = true,
                    FileData = fileData,
                    AdditionalInfo = $"File '{fileName}' successfully downloaded from Cloudflare R2."
                };
            }
            catch (AmazonS3Exception ex)
            {
                return new DownloadFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"Cloudflare R2 error occurred while downloading '{fileName}': {ex.Message}"
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
                    string dataCacheKey = $"cloudflareFile:{fileName}:data";
                    await _cache.RemoveAsync(dataCacheKey);
                }

                return new DeleteFileResponseDto
                {
                    IsSuccessful = true,
                    DeletedFilePath = $"{_bucketName}/{key}",
                    AdditionalInfo = $"File successfully deleted from Cloudflare R2 at key '{key}'."
                };
            }
            catch (AmazonS3Exception ex)
            {
                return new DeleteFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"Cloudflare R2 error occurred while deleting '{fileName}': {ex.Message}"
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
        /// Generates a pre-signed URL for secure file access from Cloudflare R2.
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

                // Enforce maximum expiration of 24 hours
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
                    ErrorMessage = $"Cloudflare R2 error generating signed URL: {ex.Message}"
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
        /// Not applicable for Cloudflare R2 storage. Always returns false.
        /// </summary>
        public bool ValidateSignedToken(string fileName, string token, long expires) => false;

        /// <summary>
        /// Not applicable for Cloudflare R2 storage. Always returns null.
        /// </summary>
        public string? GetLocalFilePath(string fileName) => null;

        #endregion
    }
}
