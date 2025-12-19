namespace VirtualUpon.Storage.Utilities
{
    public static class StorageFilePath
    {
        public static string BuildImagePath(string serviceURL, string bucketName, string key)
        {
            return $"{serviceURL}/{bucketName}/{key}";
        }

        public static string ExtractKeyFromFileName(string fileName, string serviceURL, string bucketName)
        {
            if (string.IsNullOrEmpty(fileName))
                throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

            // Remove the service URL prefix if present
            string key = fileName.StartsWith(serviceURL, StringComparison.OrdinalIgnoreCase)
                ? fileName.Substring(serviceURL.Length).TrimStart('/')
                : fileName;

            // Remove the bucket name prefix if present
            key = key.StartsWith(bucketName, StringComparison.OrdinalIgnoreCase)
                ? key.Substring(bucketName.Length).TrimStart('/')
                : key;

            return key;
        }

        public static string BuildKey(string[] pathSegments, string fileName)
        {
            var combinedSegments = pathSegments ?? Array.Empty<string>();
            var path = string.Join("/", combinedSegments.Where(segment => !string.IsNullOrWhiteSpace(segment)));
            return string.IsNullOrWhiteSpace(path) ? fileName : $"{path}/{fileName}".Trim('/');
        }

        //public static string BuildLocalStoragePath(string basePath, string[] pathSegments, string storageType)
        //{
        //    string formattedPath;

        //    // Normalize the storageType to lowercase for comparisons
        //    string lowerStorageType = storageType.ToLower();

        //    // For local storage, use Path.Combine to handle OS-specific separators
        //    if (lowerStorageType == "localstorage")
        //    {
        //        formattedPath = Path.Combine(basePath, Path.Combine(pathSegments));

        //        // Optionally handle Unix-specific slashes (if needed)
        //        if (Environment.OSVersion.Platform == PlatformID.Unix)
        //        {
        //            formattedPath = formattedPath.Replace("\\", "/");
        //        }
        //    }
        //    else if (lowerStorageType == "aws" || lowerStorageType == "linode" || lowerStorageType == "nextcloud")
        //    {
        //        // For cloud storage, ensure consistent forward slashes
        //        formattedPath = Path.Combine(basePath, Path.Combine(pathSegments)).Replace("\\", "/");
        //    }
        //    else
        //    {
        //        // Fallback case (if needed)
        //        formattedPath = Path.Combine(basePath, Path.Combine(pathSegments));
        //    }

        //    return formattedPath;
        //}


        public static string BuildLocalStoragePath(string basePath, string[] pathSegments, string storageType)
        {
            string formattedPath;

            // Ensure basePath is properly formatted
            if (!Path.IsPathRooted(basePath))
            {
                throw new ArgumentException("BasePath must be an absolute path.", nameof(basePath));
            }

            // Normalize the storageType to lowercase for comparisons
            string lowerStorageType = storageType.ToLower();

            if (lowerStorageType == "localstorage")
            {
                formattedPath = Path.Combine(basePath, Path.Combine(pathSegments));

                // Convert Windows paths to Unix format if needed
                if (Environment.OSVersion.Platform == PlatformID.Unix)
                {
                    formattedPath = formattedPath.Replace("\\", "/");
                }
            }
            else if (lowerStorageType == "aws" || lowerStorageType == "linode" || lowerStorageType == "nextcloud")
            {
                // Ensure consistent forward slashes for cloud storage
                formattedPath = $"{basePath}/{string.Join("/", pathSegments)}".Replace("//", "/");
            }
            else
            {
                formattedPath = Path.Combine(basePath, Path.Combine(pathSegments));
            }

            return formattedPath;
        }





        /// <summary>
        /// Normalizes a file path to ensure compatibility across platforms.
        /// </summary>
        /// <param name="filePath">The file path to normalize.</param>
        /// <returns>The normalized file path.</returns>
        public static string NormalizeFilePath(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("File path cannot be null or empty.", nameof(filePath));

            // Normalize slashes based on the OS
            string normalizedPath = Path.GetFullPath(filePath);
            if (Environment.OSVersion.Platform == PlatformID.Unix)
            {
                normalizedPath = normalizedPath.Replace("\\", "/");
            }
            else
            {
                normalizedPath = normalizedPath.Replace("/", "\\");
            }

            return normalizedPath;
        }
    }
}
