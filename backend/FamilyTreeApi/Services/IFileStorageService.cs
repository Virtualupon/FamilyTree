namespace FamilyTreeApi.Services;

/// <summary>
/// Abstraction for file storage operations - allows swapping to cloud storage later
/// </summary>
public interface IFileStorageService
{
    /// <summary>
    /// Saves a file to storage
    /// </summary>
    /// <param name="data">File binary data</param>
    /// <param name="fileName">Original file name</param>
    /// <param name="subDirectory">Subdirectory path (e.g., "persons/123/2025/12")</param>
    /// <returns>Relative storage path</returns>
    Task<string> SaveFileAsync(byte[] data, string fileName, string subDirectory);

    /// <summary>
    /// Retrieves a file from storage
    /// </summary>
    /// <param name="storagePath">Relative storage path</param>
    /// <returns>File binary data</returns>
    Task<byte[]> GetFileAsync(string storagePath);

    /// <summary>
    /// Deletes a file from storage
    /// </summary>
    /// <param name="storagePath">Relative storage path</param>
    Task DeleteFileAsync(string storagePath);

    /// <summary>
    /// Checks if a file exists in storage
    /// </summary>
    /// <param name="storagePath">Relative storage path</param>
    /// <returns>True if file exists</returns>
    bool FileExists(string storagePath);
}
