using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Distributed;
using VirtualUpon.Storage.Dto;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;
using WebDav;

namespace VirtualUpon.Storage.Services
{
    public class NextCloudStorageService : IStorageService
    {
        private readonly IWebDavClient _webDavClient;
        private readonly string _user;
        private readonly string _baseUri;
        private readonly HttpClient _httpClient;
        private readonly StorageConfiguration _config;
        private readonly int _storageTypeInt;
        private readonly bool _compressionEnabled;
        private readonly bool _storageCacheEnabled;
        private readonly IDistributedCache? _cache;

        public NextCloudStorageService(StorageConfiguration configuration, IWebDavClient webDavClient, HttpClient httpClient, IDistributedCache? cache = null)
        {
            _config = configuration ?? throw new ArgumentNullException(nameof(configuration), "Configuration cannot be null.");
            _webDavClient = webDavClient ?? throw new ArgumentNullException(nameof(webDavClient), "WebDavClient cannot be null.");
            _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient), "HttpClient cannot be null.");
            _cache = cache;

            if (configuration.Nextcloud == null)
            {
                throw new ArgumentNullException(nameof(configuration.Nextcloud), "Nextcloud configuration cannot be null.");
            }

            _user = configuration.Nextcloud.Username ?? throw new ArgumentNullException(nameof(configuration.Nextcloud.Username), "Username cannot be null.");
            _baseUri = configuration.Nextcloud.BaseUrl ?? throw new ArgumentNullException(nameof(configuration.Nextcloud.BaseUrl), "BaseUrl cannot be null.");

            var password = configuration.Nextcloud.Password ?? throw new ArgumentNullException(nameof(configuration.Nextcloud.Password), "Password cannot be null.");
            _compressionEnabled = configuration.CompressionEnabled;
            _storageCacheEnabled = configuration.StorageCacheEnabled;

            var byteArray = Encoding.ASCII.GetBytes($"{_user}:{password}");
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(byteArray));

            _storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(configuration.StorageType);
        }

        private string BuildFullPath(string[] pathSegments, string fileName)
        {
            var combinedSegments = pathSegments.Concat(pathSegments ?? Array.Empty<string>());
            var path = string.Join("/", combinedSegments.Where(segment => !string.IsNullOrWhiteSpace(segment)));
            return string.IsNullOrWhiteSpace(path) ? $"remote.php/dav/files/{_user}/{fileName}".Trim('/') : $"remote.php/dav/files/{_user}/{path}/{fileName}".Trim('/');
        }

        public async Task<SavedImageInfoDto> UploadFileAsync(string[] pathSegments, string fileName, byte[] data)
        {
            if (string.IsNullOrEmpty(fileName)) throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
            if (data == null || data.Length == 0) throw new ArgumentException("File data cannot be null or empty.", nameof(data));

            try
            {
                if (_compressionEnabled)
                {
                    data = FileCompressionUtility.Compress(data);
                }

                using var memoryStream = new MemoryStream(data);
                string fullPath = BuildFullPath(pathSegments, fileName);
                var uploadResult = await Task.Run(() => _webDavClient.PutFile(fullPath, memoryStream));

                if (!uploadResult.IsSuccessful)
                {
                    throw new InvalidOperationException($"Failed to upload file '{fileName}' to NextCloud.");
                }

                // Cache data if enabled
                if (_storageCacheEnabled && _cache != null)
                {
                    string cacheKey = $"nextcloudFile:{fileName}:data";
                    await _cache.SetAsync(cacheKey, data, new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });
                }

                return new SavedImageInfoDto
                {
                    StorageType = _storageTypeInt,
                    ImagePath = $"{_baseUri}/{fullPath}",
                    Success = true
                };
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"An error occurred while uploading to NextCloud: {ex.Message}", ex);
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

            if (_storageCacheEnabled && _cache != null)
            {
                string cacheKey = $"nextcloudFile:{fileName}:data";
                fileData = await _cache.GetAsync(cacheKey);

                if (fileData != null)
                {
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

            string fullPath = BuildFullPath(Array.Empty<string>(), fileName);

            try
            {
                var response = await Task.Run(() => _webDavClient.GetRawFile(fullPath));
                if (!response.IsSuccessful)
                {
                    return new DownloadFileResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = $"Failed to download file '{fileName}' from NextCloud. Status: {response.StatusCode}",
                        StatusCode = response.StatusCode.ToString()
                    };
                }

                using var memoryStream = new MemoryStream();
                await response.Stream.CopyToAsync(memoryStream);
                fileData = memoryStream.ToArray();

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

                if (_storageCacheEnabled && _cache != null)
                {
                    string cacheKey = $"nextcloudFile:{fileName}:data";
                    await _cache.SetAsync(cacheKey, fileData, new DistributedCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
                    });
                }

                return new DownloadFileResponseDto
                {
                    IsSuccessful = true,
                    FileData = fileData,
                    AdditionalInfo = $"File '{fileName}' successfully downloaded from NextCloud at path '{fullPath}'."
                };
            }
            catch (Exception ex)
            {
                return new DownloadFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"An error occurred while downloading from NextCloud: {ex.Message}"
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

            string fullPath = BuildFullPath(Array.Empty<string>(), fileName);

            try
            {
                var deleteResult = await Task.Run(() => _webDavClient.Delete(fullPath));
                if (!deleteResult.IsSuccessful)
                {
                    return new DeleteFileResponseDto
                    {
                        IsSuccessful = false,
                        ErrorMessage = $"Failed to delete file '{fileName}' from NextCloud. Status: {deleteResult.StatusCode}"
                    };
                }

                if (_storageCacheEnabled && _cache != null)
                {
                    string cacheKey = $"nextcloudFile:{fileName}:data";
                    await _cache.RemoveAsync(cacheKey);
                }

                return new DeleteFileResponseDto
                {
                    IsSuccessful = true,
                    DeletedFilePath = $"{_baseUri}/{fullPath}",
                    AdditionalInfo = $"File '{fileName}' successfully deleted from NextCloud at path '{fullPath}'."
                };
            }
            catch (Exception ex)
            {
                return new DeleteFileResponseDto
                {
                    IsSuccessful = false,
                    ErrorMessage = $"An error occurred while deleting from NextCloud: {ex.Message}"
                };
            }
        }

        #region Signed URL Methods

        /// <summary>
        /// Signed URLs are not natively supported by NextCloud/WebDAV.
        /// Use NextCloud's share link API for similar functionality.
        /// </summary>
        public Task<SignedUrlResponseDto> GetSignedUrlAsync(string filePath, int expiresInSeconds = 3600)
        {
            return Task.FromResult(new SignedUrlResponseDto
            {
                IsSuccessful = false,
                ErrorMessage = "Signed URLs are not supported for NextCloud storage. Use NextCloud's share link API instead."
            });
        }

        /// <summary>
        /// Not applicable for NextCloud storage. Always returns false.
        /// </summary>
        public bool ValidateSignedToken(string fileName, string token, long expires) => false;

        /// <summary>
        /// Not applicable for NextCloud storage. Always returns null.
        /// </summary>
        public string? GetLocalFilePath(string fileName) => null;

        #endregion
    }
}



//using System;
//using System.IO;
//using System.Linq;
//using System.Net.Http;
//using System.Net.Http.Headers;
//using System.Text;
//using System.Threading.Tasks;
//using VirtualUpon.Storage.Dto;
//using WebDav;

//using VirtualUpon.Storage.Factories;
////using VirtualUpon.Storage.Models;

//namespace VirtualUpon.Storage.Services
//{
//    public class NextCloudStorageService : IStorageService
//    {
//        private readonly IWebDavClient _webDavClient;
//        private readonly string _user;
//        private readonly string _baseUri;
//        private readonly HttpClient _httpClient;
//        private readonly StorageConfiguration _config;
//        private readonly int storageTypeInt;


//        public NextCloudStorageService(StorageConfiguration configuration, IWebDavClient webDavClient,  HttpClient httpClient)
//        {

//            _config = configuration;

//            _webDavClient = webDavClient ?? throw new ArgumentNullException(nameof(webDavClient), "WebDavClient cannot be null.");
//            _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient), "HttpClient cannot be null.");

//            if (configuration == null) throw new ArgumentNullException(nameof(configuration), "Configuration cannot be null.");
//            _user = configuration.Nextcloud.Username;
//            _baseUri = configuration.Nextcloud.BaseUrl;
//            var password = configuration.Nextcloud.Password;
//            if (string.IsNullOrEmpty(password)) throw new ArgumentNullException("NextCloud password is not configured.");

//            // Configure basic authentication for the HttpClient
//            var byteArray = Encoding.ASCII.GetBytes($"{_user}:{password}");
//            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(byteArray));


//        }

//        private string BuildFullPath(string[] pathSegments, string fileName)
//        {
//            var combinedSegments = pathSegments.Concat(pathSegments ?? Array.Empty<string>());
//            var path = string.Join("/", combinedSegments.Where(segment => !string.IsNullOrWhiteSpace(segment)));
//            return string.IsNullOrWhiteSpace(path) ? $"remote.php/dav/files/{_user}/{fileName}".Trim('/') : $"remote.php/dav/files/{_user}/{path}/{fileName}".Trim('/');
//        }

//        public async Task<SavedImageInfoDto> UploadFileAsync(string[] pathSegments, string fileName, byte[] data)
//        {
//            if (string.IsNullOrEmpty(fileName)) throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));
//            if (data == null || data.Length == 0) throw new ArgumentException("File data cannot be null or empty.", nameof(data));

//            try
//            {
//                using (var memoryStream = new MemoryStream(data))
//                {
//                    string fullPath = BuildFullPath(pathSegments, fileName);
//                    var uploadResult = await Task.Run(() => _webDavClient.PutFile(fullPath, memoryStream));

//                    if (!uploadResult.IsSuccessful)
//                    {
//                        throw new InvalidOperationException($"Failed to upload file '{fileName}' to NextCloud.");
//                    }

//                    return new SavedImageInfoDto
//                    {
//                        StorageType = storageTypeInt, // Assuming 4 represents NextCloud storage
//                        ImagePath = $"{_baseUri}/{fullPath}"
//                    };
//                }
//            }
//            catch (Exception ex)
//            {
//                throw new InvalidOperationException($"An error occurred while uploading to NextCloud: {ex.Message}", ex);
//            }
//        }

//        //  public async Task<DownloadFileResponseDto> DownloadFileAsync(string[] pathSegments, string fileName)
//        public async Task<DownloadFileResponseDto> DownloadFileAsync( string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName))
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = "File name cannot be null or empty."
//                };
//            }

//            //  string fullPath = IsFullPath(fileName) ? fileName : BuildFullPath(pathSegments, fileName);
//            string fullPath = fileName;

//            try
//            {
//                var response = await Task.Run(() => _webDavClient.GetRawFile(fullPath));
//                if (!response.IsSuccessful)
//                {
//                    return new DownloadFileResponseDto
//                    {
//                        IsSuccessful = false,
//                        ErrorMessage = $"Failed to download file '{fileName}' from NextCloud. Status: {response.StatusCode}",
//                        StatusCode = response.StatusCode.ToString()
//                    };
//                }

//                using (var memoryStream = new MemoryStream())
//                {
//                    await response.Stream.CopyToAsync(memoryStream);
//                    return new DownloadFileResponseDto
//                    {
//                        IsSuccessful = true,
//                        FileData = memoryStream.ToArray(),
//                        AdditionalInfo = $"File '{fileName}' successfully downloaded from NextCloud at path '{fullPath}'."
//                    };
//                }
//            }
//            catch (Exception ex)
//            {
//                return new DownloadFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"An error occurred while downloading from NextCloud: {ex.Message}"
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

//            //string fullPath = BuildFullPath(pathSegments, fileName);

//            string fullPath = fileName;

//            try
//            {
//                var deleteResult = await Task.Run(() => _webDavClient.Delete(fullPath));
//                if (!deleteResult.IsSuccessful)
//                {
//                    return new DeleteFileResponseDto
//                    {
//                        IsSuccessful = false,
//                        ErrorMessage = $"Failed to delete file '{fileName}' from NextCloud. Status: {deleteResult.StatusCode}"
//                    };
//                }

//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = true,
//                    DeletedFilePath = $"{_baseUri}/{fullPath}",
//                    AdditionalInfo = $"File '{fileName}' successfully deleted from NextCloud at path '{fullPath}'."
//                };
//            }
//            catch (Exception ex)
//            {
//                return new DeleteFileResponseDto
//                {
//                    IsSuccessful = false,
//                    ErrorMessage = $"An error occurred while deleting from NextCloud: {ex.Message}"
//                };
//            }
//        }

//        private bool IsFullPath(string fileName)
//        {
//            return fileName.Contains("/") || fileName.Contains("\\");
//        }

//        public async Task<bool> FileExistsAsync(string[] pathSegments, string fileName)
//        {
//            if (string.IsNullOrEmpty(fileName)) throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

//            string fullPath = BuildFullPath(pathSegments, fileName);

//            try
//            {
//                var request = new HttpRequestMessage(HttpMethod.Head, $"{_baseUri}/{fullPath}");
//                var response = await _httpClient.SendAsync(request);
//                return response.IsSuccessStatusCode;
//            }
//            catch (Exception ex)
//            {
//                throw new InvalidOperationException($"An error occurred while checking existence in NextCloud: {ex.Message}", ex);
//            }
//        }

//        public async Task CreateFolderAsync(string[] pathSegments, string folderName)
//        {
//            string fullPath = BuildFullPath(pathSegments, folderName);

//            try
//            {
//                var response = await Task.Run(() => _webDavClient.Mkcol(fullPath));
//                if (!response.IsSuccessful)
//                {
//                    throw new InvalidOperationException($"Failed to create folder '{folderName}' in NextCloud.");
//                }
//            }
//            catch (Exception ex)
//            {
//                throw new InvalidOperationException($"An error occurred while creating folder '{folderName}' in NextCloud: {ex.Message}", ex);
//            }
//        }
//    }
//}
