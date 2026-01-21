namespace FamilyTreeApi.Storage;

/// <summary>
/// Storage service interface for file operations.
/// This is a local implementation to replace VirtualUpon.Storage dependency.
/// </summary>
public interface IStorageService
{
    Task<SavedMediaInfo> UploadFileAsync(string[] pathSegments, string fileName, byte[] data);
    Task<DownloadResponse> DownloadFileAsync(string url);
    Task DeleteFileAsync(string url);
}

/// <summary>
/// Response from uploading a file
/// </summary>
public class SavedMediaInfo
{
    public string ImagePath { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
}

/// <summary>
/// Response from downloading a file
/// </summary>
public class DownloadResponse
{
    public byte[]? FileData { get; set; }
    public string? MimeType { get; set; }
}
