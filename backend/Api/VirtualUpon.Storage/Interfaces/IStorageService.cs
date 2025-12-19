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
    }
}
