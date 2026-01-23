using System.Threading.Tasks;
using VirtualUpon.Storage.Dto;

namespace VirtualUpon.Storage.Factories
{
    public interface IStorageService
    {
        /// <summary>
        /// Uploads a file to the storage system with a specified path structure.
        /// </summary>
        /// <param name="pathSegments">An array of path segments for constructing the full path.</param>
        /// <param name="fileName">The name of the file.</param>
        /// <param name="data">The file data as a byte array.</param>
        /// <returns>A task that returns a SavedImageInfoDto with details of the saved file.</returns>
        Task<SavedImageInfoDto> UploadFileAsync(string[] pathSegments, string fileName, byte[] data);

        /// <summary>
        /// Downloads a file from the storage system.
        /// </summary>
        /// <param name="pathSegments">An array of path segments for constructing the full path.</param>
        /// <param name="fileName">The name of the file to download.</param>
        /// <returns>A task that returns a DownloadFileResponseDto with details of the download operation.</returns>
        Task<DownloadFileResponseDto> DownloadFileAsync(string fileName);

        //Task<DownloadFileResponseDto> DownloadFileAsync(string[] pathSegments, string fileName);

        /// <summary>
        /// Deletes a file from the storage system.
        /// </summary>
        /// <param name="pathSegments">An array of path segments for constructing the full path.</param>
        /// <param name="fileName">The name of the file to delete.</param>
        /// <returns>A task that returns a DeleteFileResponseDto with details of the deletion operation.</returns>
        Task<DeleteFileResponseDto> DeleteFileAsync(string fileName);

        /// <summary>
        /// Checks if a file exists in the storage system.
        /// </summary>
        /// <param name="pathSegments">An array of path segments for constructing the full path.</param>
        /// <param name="fileName">The name of the file to check.</param>
        /// <returns>A task that returns true if the file exists, otherwise false.</returns>
       // Task<bool> FileExistsAsync(string[] pathSegments, string fileName);

        /// <summary>
        /// Generates a signed URL for secure file access.
        /// For cloud storage (AWS, Cloudflare, Linode), returns a pre-signed URL directly to the storage.
        /// For local storage, returns a URL with an HMAC token for validation.
        /// </summary>
        /// <param name="filePath">The file path or key to generate URL for.</param>
        /// <param name="expiresInSeconds">URL expiration time in seconds (default 3600, max 86400).</param>
        /// <returns>A SignedUrlResponseDto with the signed URL or error details.</returns>
        Task<SignedUrlResponseDto> GetSignedUrlAsync(string filePath, int expiresInSeconds = 3600);

        /// <summary>
        /// Validates a signed token for local storage streaming.
        /// Only applicable for local storage; cloud storage services return false.
        /// </summary>
        /// <param name="fileName">The file name that was signed.</param>
        /// <param name="token">The token to validate.</param>
        /// <param name="expires">The expiration timestamp (Unix epoch seconds).</param>
        /// <returns>True if token is valid and not expired; false otherwise.</returns>
        bool ValidateSignedToken(string fileName, string token, long expires);

        /// <summary>
        /// Gets the local file path for streaming (local storage only).
        /// Includes path traversal protection.
        /// </summary>
        /// <param name="fileName">The file name or relative path.</param>
        /// <returns>The full local file path, or null if not found, invalid, or not local storage.</returns>
        string? GetLocalFilePath(string fileName);
    }
}
