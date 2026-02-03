using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Distributed;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;

namespace VirtualUpon.Storage.Services
{
    public class LocalStorageService : IStorageService
    {
        private readonly string _basePath;
        private readonly StorageConfiguration _config;
        private readonly int _storageTypeInt;
        private readonly bool _compressionEnabled;
        private readonly bool _storageCacheEnabled;
        private readonly IDistributedCache? _cache;

        public LocalStorageService(StorageConfiguration config, IDistributedCache? cache = null)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config), "Configuration cannot be null.");
            _cache = cache;

            if (config.LocalStorage == null || string.IsNullOrEmpty(config.LocalStorage.BasePath))
            {
                throw new ArgumentNullException(nameof(config.LocalStorage), "LocalStorage configuration is missing or BasePath is null/empty.");
            }

            _basePath = config.LocalStorage.BasePath;
            _storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(config.StorageType);
            _compressionEnabled = config.CompressionEnabled;
            _storageCacheEnabled = config.StorageCacheEnabled;

            // Ensure the base directory exists
            if (!Directory.Exists(_basePath))
            {
                Directory.CreateDirectory(_basePath);
            }
        }

        public async Task<SavedImageInfoDto> UploadFileAsync(string[] pathSegments, string fileName, byte[] data)
        {
            if (string.IsNullOrEmpty(fileName))
            {
                throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
            }

            if (data == null || data.Length == 0)
            {
                throw new ArgumentException("File data cannot be null or empty.", nameof(data));
            }

            string fullPath = StorageFilePath.BuildLocalStoragePath(_basePath, pathSegments, _config.StorageType);

            // Ensure the directory exists
            if (!Directory.Exists(fullPath))
            {
                Directory.CreateDirectory(fullPath);
            }

            string filePath = Path.Combine(fullPath, fileName);
            try
            {
                // Save the file locally
                await File.WriteAllBytesAsync(filePath, data);

                // Cache the file path and data if caching is enabled
                if (_storageCacheEnabled && _cache != null)
                {
                    string dataCacheKey = $"localFile:{fileName}:data";
                    byte[] cacheData = _compressionEnabled ? FileCompressionUtility.Compress(data) : data;
                    await _cache.SetAsync(dataCacheKey, cacheData, new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });

                    string pathCacheKey = $"localFile:{fileName}:path";
                    await _cache.SetStringAsync(pathCacheKey, filePath, new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });
                }

                return new SavedImageInfoDto
                {
                    StorageType = _storageTypeInt,
                    ImagePath = Path.GetFullPath(filePath),
                    Success = true
                };
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"An error occurred while uploading the file '{fileName}'.", ex);
            }
        }
        public async Task<DownloadFileResponseDto> DownloadFileAsync(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
            {
                return CreateErrorResponse("File name cannot be null or empty.");
            }

            try
            {
                // Normalize the file path
                string normalizedPath = StorageFilePath.NormalizeFilePath(fileName);

                // Attempt to get the file from cache
                var cachedResponse = await TryGetFileFromCacheAsync(normalizedPath);
                if (cachedResponse != null) return cachedResponse;

                // Attempt to get the file from disk
                var fileData = await ReadFileFromDiskAsync(normalizedPath);
                if (fileData == null)
                {
                    return CreateErrorResponse($"File '{normalizedPath}' not found on disk.");
                }

                // Optionally decompress data
                fileData = DecompressData(fileData);

                // Cache the file data
                await CacheFileDataAsync(normalizedPath, fileData);

                return CreateSuccessResponse(fileData, $"File '{normalizedPath}' successfully downloaded from disk.");
            }
            catch (Exception ex)
            {
                return CreateErrorResponse($"An error occurred while downloading the file '{fileName}': {ex.Message}");
            }
        }

        private async Task<DownloadFileResponseDto?> TryGetFileFromCacheAsync(string fileName)
        {
            if (!_storageCacheEnabled || _cache == null) return null;

            string dataCacheKey = $"localFile:{fileName}:data";
            var cachedData = await _cache.GetAsync(dataCacheKey);

            if (cachedData != null)
            {
                cachedData = DecompressData(cachedData);
                return CreateSuccessResponse(cachedData, $"File '{fileName}' retrieved from cache.");
            }

            return null;
        }

        private async Task<byte[]?> ReadFileFromDiskAsync(string fileName)
        {
            // Normalize the file path
            string normalizedPath = StorageFilePath.NormalizeFilePath(fileName);

            if (!File.Exists(normalizedPath)) return null;

            return await File.ReadAllBytesAsync(normalizedPath);
        }

        private byte[] DecompressData(byte[] data)
        {
            if (_compressionEnabled && FileCompressionUtility.IsCompressed(data))
            {
                return FileCompressionUtility.Decompress(data);
            }

            return data;
        }

        private async Task CacheFileDataAsync(string fileName, byte[] data)
        {
            if (!_storageCacheEnabled || _cache == null) return;

            string dataCacheKey = $"localFile:{fileName}:data";
            byte[] cacheData = _compressionEnabled ? FileCompressionUtility.Compress(data) : data;

            await _cache.SetAsync(dataCacheKey, cacheData, new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });
        }

        private DownloadFileResponseDto CreateErrorResponse(string errorMessage)
        {
            return new DownloadFileResponseDto
            {
                IsSuccessful = false,
                ErrorMessage = errorMessage
            };
        }

        private DownloadFileResponseDto CreateSuccessResponse(byte[] fileData, string additionalInfo)
        {
            return new DownloadFileResponseDto
            {
                IsSuccessful = true,
                FileData = fileData,
                AdditionalInfo = additionalInfo
            };
        }


        //public async Task<DownloadFileResponseDto> DownloadFileAsync(string fileName)
        //{
        //    if (string.IsNullOrEmpty(fileName))
        //    {
        //        return new DownloadFileResponseDto
        //        {
        //            IsSuccessful = false,
        //            ErrorMessage = "File name cannot be null or empty."
        //        };
        //    }

        //    byte[]? fileData = null; // Allow null

        //    // Attempt to retrieve data from cache if caching is enabled
        //    if (_storageCacheEnabled && _cache != null)
        //    {
        //        string dataCacheKey = $"localFile:{fileName}:data";

        //        var cachedData = await _cache.GetAsync(dataCacheKey);
        //        if (cachedData != null) // Ensure cachedData is not null
        //        {
        //            // Decompress the data if compression is enabled
        //            if (_compressionEnabled)
        //            {
        //                try
        //                {
        //                    cachedData = FileCompressionUtility.Decompress(cachedData);
        //                }
        //                catch (Exception ex)
        //                {
        //                    return new DownloadFileResponseDto
        //                    {
        //                        IsSuccessful = false,
        //                        ErrorMessage = $"Error decompressing cached data for file '{fileName}': {ex.Message}"
        //                    };
        //                }
        //            }

        //            return new DownloadFileResponseDto
        //            {
        //                IsSuccessful = true,
        //                FileData = cachedData,
        //                AdditionalInfo = $"File '{fileName}' retrieved from cache."
        //            };
        //        }
        //    }

        //    // If not cached, read the file from disk
        //    string filePath = Path.Combine(_basePath, fileName);
        //    if (!File.Exists(filePath))
        //    {
        //        return new DownloadFileResponseDto
        //        {
        //            IsSuccessful = false,
        //            ErrorMessage = $"File '{fileName}' not found on disk."
        //        };
        //    }

        //    try
        //    {
        //        fileData = await File.ReadAllBytesAsync(filePath);

        //        // Decompress data if compression is enabled
        //        if (_compressionEnabled)
        //        {
        //            try
        //            {
        //                fileData = FileCompressionUtility.Decompress(fileData);
        //            }
        //            catch (Exception ex)
        //            {
        //                return new DownloadFileResponseDto
        //                {
        //                    IsSuccessful = false,
        //                    ErrorMessage = $"Error decompressing file '{fileName}' from disk: {ex.Message}"
        //                };
        //            }
        //        }

        //        // Cache the file data for future requests
        //        if (_storageCacheEnabled && _cache != null)
        //        {
        //            string dataCacheKey = $"localFile:{fileName}:data";
        //            byte[] cacheData = _compressionEnabled ? FileCompressionUtility.Compress(fileData) : fileData;
        //            await _cache.SetAsync(dataCacheKey, cacheData, new DistributedCacheEntryOptions
        //            {
        //                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
        //            });
        //        }

        //        return new DownloadFileResponseDto
        //        {
        //            IsSuccessful = true,
        //            FileData = fileData,
        //            AdditionalInfo = $"File '{fileName}' successfully downloaded from disk."
        //        };
        //    }
        //    catch (Exception ex)
        //    {
        //        return new DownloadFileResponseDto
        //        {
        //            IsSuccessful = false,
        //            ErrorMessage = $"An error occurred while downloading the file '{fileName}': {ex.Message}"
        //        };
        //    }
        //}


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

            string filePath = Path.Combine(_basePath, fileName);
            if (File.Exists(filePath))
            {
                try
                {
                    File.Delete(filePath);

                    // Remove cached data if caching is enabled
                    if (_storageCacheEnabled && _cache != null)
                    {
                        string dataCacheKey = $"localFile:{fileName}:data";
                        await _cache.RemoveAsync(dataCacheKey);

                        string pathCacheKey = $"localFile:{fileName}:path";
                        await _cache.RemoveAsync(pathCacheKey);
                    }

                    return new DeleteFileResponseDto
                    {
                        IsSuccessful = true,
                        DeletedFilePath = filePath,
                        AdditionalInfo = $"File '{fileName}' successfully deleted."
                    };
                }
                catch (Exception ex)
                {
                    return new DeleteFileResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = $"An error occurred while deleting the file '{fileName}': {ex.Message}"
                    };
                }
            }
            else
            {
                return new DeleteFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"File '{fileName}' not found."
                };
            }
        }

        #region Signed URL Methods

        /// <summary>
        /// Generates a signed URL for secure file access.
        /// </summary>
        public Task<SignedUrlResponseDto> GetSignedUrlAsync(string filePath, int expiresInSeconds = 3600)
        {
            try
            {
                // Validate configuration
                if (string.IsNullOrEmpty(_config.LocalStorage?.BaseUrl))
                {
                    return Task.FromResult(new SignedUrlResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = "BaseUrl is not configured for local storage signed URLs."
                    });
                }

                if (string.IsNullOrEmpty(_config.LocalStorage?.SignedUrlPathTemplate))
                {
                    return Task.FromResult(new SignedUrlResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = "SignedUrlPathTemplate is not configured for local storage signed URLs."
                    });
                }

                if (string.IsNullOrEmpty(_config.LocalStorage?.TokenSecret))
                {
                    return Task.FromResult(new SignedUrlResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = "TokenSecret is not configured for local storage signed URLs."
                    });
                }

                if (_config.LocalStorage.TokenSecret.Length < 32)
                {
                    return Task.FromResult(new SignedUrlResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = "TokenSecret must be at least 32 characters long."
                    });
                }

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

                // Calculate expiration timestamp (Unix epoch seconds)
                var expiresAt = DateTime.UtcNow.AddSeconds(expiresInSeconds);
                var expiresTimestamp = new DateTimeOffset(expiresAt).ToUnixTimeSeconds();

                // Generate token
                var token = GenerateToken(filePath, expiresTimestamp);

                // URL-encode the file path for use in URL
                var encodedFileName = Uri.EscapeDataString(filePath);

                // Build URL from template
                var path = _config.LocalStorage.SignedUrlPathTemplate
                    .Replace("{fileName}", encodedFileName)
                    .Replace("{token}", token)
                    .Replace("{expires}", expiresTimestamp.ToString());

                var url = _config.LocalStorage.BaseUrl.TrimEnd('/') + path;

                // Get content type
                var contentType = MediaTypeHelper.GetContentType(filePath);

                return Task.FromResult(new SignedUrlResponseDto
                {
                    IsSuccessful = true,
                    Url = url,
                    ExpiresAt = expiresAt,
                    ContentType = contentType
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
        /// Validates a signed token for local storage streaming.
        /// </summary>
        public bool ValidateSignedToken(string fileName, string token, long expires)
        {
            try
            {
                if (string.IsNullOrEmpty(fileName) || string.IsNullOrEmpty(token))
                    return false;

                if (string.IsNullOrEmpty(_config.LocalStorage?.TokenSecret))
                    return false;

                // Check if token has expired
                var expiresAt = DateTimeOffset.FromUnixTimeSeconds(expires).UtcDateTime;
                if (DateTime.UtcNow > expiresAt)
                    return false;

                // Regenerate the expected token and compare
                var expectedToken = GenerateToken(fileName, expires);

                // Use constant-time comparison to prevent timing attacks
                return CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(token),
                    Encoding.UTF8.GetBytes(expectedToken));
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Gets the local file path for streaming with path traversal protection.
        /// </summary>
        public string? GetLocalFilePath(string fileName)
        {
            try
            {
                if (string.IsNullOrEmpty(fileName))
                    return null;

                // Decode URL-encoded file name
                var decodedFileName = Uri.UnescapeDataString(fileName);

                // Path traversal protection - reject any path with ..
                if (decodedFileName.Contains(".."))
                    return null;

                // Build full path
                var fullPath = Path.Combine(_basePath, decodedFileName);

                // Normalize path and verify it's within base path
                var normalizedPath = Path.GetFullPath(fullPath);
                var normalizedBasePath = Path.GetFullPath(_basePath);

                if (!normalizedPath.StartsWith(normalizedBasePath, StringComparison.OrdinalIgnoreCase))
                    return null;

                // Check if file exists
                if (!File.Exists(normalizedPath))
                    return null;

                return normalizedPath;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Generates an HMACSHA256 token for signing URLs.
        /// </summary>
        private string GenerateToken(string fileName, long expires)
        {
            var message = $"{fileName}{expires}";
            var secretBytes = Encoding.UTF8.GetBytes(_config.LocalStorage!.TokenSecret!);

            using var hmac = new HMACSHA256(secretBytes);
            var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));

            // Base64url encoding (URL-safe)
            return Convert.ToBase64String(hashBytes)
                .Replace('+', '-')
                .Replace('/', '_')
                .TrimEnd('=');
        }

        #endregion
    }
}








//using System;
//using System.IO;
//using System.Threading.Tasks;
//using VirtualUpon.Storage.Factories;
//using VirtualUpon.Storage.Dto;
//using VirtualUpon.Storage.Utilities;
//using System.ComponentModel.DataAnnotations;
//namespace VirtualUpon.Storage.Services
//{
//    public class LocalStorageService : IStorageService
//    {
//        private readonly string _basePath;
//        private readonly StorageConfiguration _config;
//        private readonly int storageTypeInt;

//        private readonly bool _compressionEnabled;

//        private readonly bool _storageCacheEnabled;



//        public LocalStorageService(StorageConfiguration config)
//        {

//            _config = config;
//            if (config.LocalStorage == null || string.IsNullOrEmpty(config.LocalStorage.BasePath))
//            {
//                throw new ArgumentNullException(nameof(config.LocalStorage), "LocalStorage configuration is missing or BasePath is null/empty.");
//            }


//            if (string.IsNullOrEmpty(config.LocalStorage.BasePath))
//            {
//                throw new ArgumentException("Base path cannot be null or empty.", nameof(config.LocalStorage.BasePath));
//            }

//            _basePath = config.LocalStorage.BasePath;

//            storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(config.StorageType);

//            _compressionEnabled= config.CompressionEnabled;
//            _storageCacheEnabled=config.StorageCacheEnabled;


//            // Ensure the base directory exists
//            if (!Directory.Exists(_basePath))
//            {
//                Directory.CreateDirectory(_basePath);
//            }
//        }

//        public async Task<SavedImageInfoDto> UploadFileAsync(string[] pathSegments, string fileName, byte[] data)
//        {
//            if (string.IsNullOrEmpty(fileName))
//            {
//                throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
//            }

//            if (data == null || data.Length == 0)
//            {
//                throw new ArgumentException("File data cannot be null or empty.", nameof(data));
//            }

//            // Combine path prefix segments and provided path segments
//         //   string[] fullPathSegments = CombinePathSegments(_pathPrefixSegments, pathSegments);

//           // string fullPath = PathUtility.BuildStoragePath(_basePath, fullPathSegments, _storageType);
//            string fullPath = StorageFilePath.BuildLocalStoragePath(_basePath, pathSegments, _config.StorageType);

//            // Ensure the directory exists
//            if (!Directory.Exists(fullPath))
//            {
//                Directory.CreateDirectory(fullPath);
//            }

//            string filePath = Path.Combine(fullPath, fileName);
//            try
//            {
//                await File.WriteAllBytesAsync(filePath, data);

//                // Return the SavedImageInfoDto with StorageType and ImagePath
//                return new SavedImageInfoDto
//                {
//                    StorageType = storageTypeInt, // Assuming 1 represents local storage
//                    ImagePath = Path.GetFullPath(filePath) // Full file path
//                };
//            }
//            catch (Exception ex)
//            {
//                throw new InvalidOperationException($"An error occurred while uploading the file '{fileName}'.", ex);
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

//            string filePath;

//            // Check if fileName is already a full path
//            if (Path.IsPathRooted(fileName))
//            {
//                // Use fileName as the full path if it is rooted
//                filePath = fileName;
//            }
//            else
//            {
//                //// Combine path prefix segments and provided path segments
//                //string[] fullPathSegments = CombinePathSegments(pathSegments, pathSegments);
//                //string fullPath = PathUtility.BuildStoragePath(_basePath, fullPathSegments, _storageType);
//                //filePath = Path.Combine(fullPath, fileName);
//                filePath = fileName;
//            }

//            if (!File.Exists(filePath))
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"File '{fileName}' not found at '{filePath}'."
//                };
//            }

//            try
//            {




//                byte[] fileData = await File.ReadAllBytesAsync(filePath);
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = true,
//                    FileData = fileData,
//                    AdditionalInfo = $"File '{fileName}' successfully downloaded."
//                };
//            }
//            catch (Exception ex)
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"An error occurred while downloading the file '{fileName}': {ex.Message}"
//                };
//            }
//        }

//        public async Task<DeleteFileResponseDto> DeleteFileAsync(string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName))
//            {
//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = "File name cannot be null or empty."
//                };
//            }

//            //// Combine path prefix segments and provided path segments
//            //string[] fullPathSegments = CombinePathSegments(pathSegments, pathSegments);
//            //string fullPath = StorageFilePath.BuildLocalStoragePath(_basePath, fullPathSegments, _storageType);
//            //string filePath = Path.Combine(fullPath, fileName);

//            string filePath = fileName;

//            if (File.Exists(filePath))
//            {
//                try
//                {
//                    File.Delete(filePath);
//                    await Task.CompletedTask; // For asynchronous signature

//                    return new DeleteFileResponseDto
//                    {
//                        IsSuccessful = true,
//                        DeletedFilePath = filePath,
//                        AdditionalInfo = $"File '{fileName}' successfully deleted."
//                    };
//                }
//                catch (Exception ex)
//                {
//                    return new DeleteFileResponseDto
//                    {
//                        IsSuccessful = false,
//                        ErrorMessage = $"An error occurred while deleting the file '{fileName}': {ex.Message}"
//                    };
//                }
//            }
//            else
//            {
//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"File '{fileName}' not found at '{fileName}'."
//                };
//            }
//        }


//        public async Task<bool> FileExistsAsync(string[] pathSegments, string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName))
//            {
//                throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
//            }

//            // Combine path prefix segments and provided path segments
//            string[] fullPathSegments = CombinePathSegments(pathSegments, pathSegments);
//            string fullPath = StorageFilePath.BuildLocalStoragePath(_basePath, fullPathSegments, _storageType);
//            string filePath = Path.Combine(fullPath, fileName);
//            bool exists = File.Exists(filePath);
//            return await Task.FromResult(exists);
//        }

//        private static string[] CombinePathSegments(string[] prefixSegments, string[] additionalSegments)
//        {
//            var combined = new string[prefixSegments.Length + (additionalSegments?.Length ?? 0)];
//            prefixSegments.CopyTo(combined, 0);
//            additionalSegments?.CopyTo(combined, prefixSegments.Length);
//            return combined;
//        }
//    }
//}
