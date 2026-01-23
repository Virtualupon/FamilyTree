using System;
using System.Collections.Generic;
using System.IO;

namespace VirtualUpon.Storage.Utilities
{
    /// <summary>
    /// Utility class for handling media types, MIME types, and smart compression decisions.
    /// </summary>
    public static class MediaTypeHelper
    {
        private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            // Video
            { ".mp4", "video/mp4" },
            { ".webm", "video/webm" },
            { ".mov", "video/quicktime" },
            { ".avi", "video/x-msvideo" },
            { ".mkv", "video/x-matroska" },
            { ".wmv", "video/x-ms-wmv" },
            { ".flv", "video/x-flv" },
            { ".m4v", "video/x-m4v" },
            { ".mpeg", "video/mpeg" },
            { ".mpg", "video/mpeg" },
            { ".3gp", "video/3gpp" },

            // Audio
            { ".mp3", "audio/mpeg" },
            { ".wav", "audio/wav" },
            { ".ogg", "audio/ogg" },
            { ".m4a", "audio/mp4" },
            { ".aac", "audio/aac" },
            { ".flac", "audio/flac" },
            { ".wma", "audio/x-ms-wma" },
            { ".opus", "audio/opus" },

            // Images
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".png", "image/png" },
            { ".gif", "image/gif" },
            { ".webp", "image/webp" },
            { ".svg", "image/svg+xml" },
            { ".bmp", "image/bmp" },
            { ".ico", "image/x-icon" },
            { ".tiff", "image/tiff" },
            { ".tif", "image/tiff" },
            { ".heic", "image/heic" },
            { ".heif", "image/heif" },
            { ".avif", "image/avif" },

            // Documents
            { ".pdf", "application/pdf" },
            { ".doc", "application/msword" },
            { ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
            { ".xls", "application/vnd.ms-excel" },
            { ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
            { ".ppt", "application/vnd.ms-powerpoint" },
            { ".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation" },

            // Text/Code
            { ".txt", "text/plain" },
            { ".csv", "text/csv" },
            { ".md", "text/markdown" },
            { ".json", "application/json" },
            { ".xml", "application/xml" },
            { ".html", "text/html" },
            { ".htm", "text/html" },
            { ".css", "text/css" },
            { ".js", "application/javascript" },

            // Archives (already compressed)
            { ".zip", "application/zip" },
            { ".rar", "application/vnd.rar" },
            { ".7z", "application/x-7z-compressed" },
            { ".tar", "application/x-tar" },
            { ".gz", "application/gzip" }
        };

        private static readonly HashSet<string> StreamableMediaExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            // Video
            ".mp4", ".webm", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".m4v", ".mpeg", ".mpg", ".3gp",
            // Audio
            ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".wma", ".opus"
        };

        private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff", ".tif", ".heic", ".heif", ".avif"
        };

        private static readonly HashSet<string> AlreadyCompressedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            // Video (compressed formats)
            ".mp4", ".webm", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".m4v", ".mpeg", ".mpg", ".3gp",
            // Audio (compressed formats)
            ".mp3", ".ogg", ".m4a", ".aac", ".flac", ".wma", ".opus",
            // Images (compressed formats)
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif",
            // Archives
            ".zip", ".rar", ".7z", ".gz", ".tar.gz", ".tgz",
            // PDF (already compressed)
            ".pdf"
        };

        /// <summary>
        /// Gets the MIME content type for a file based on its extension.
        /// </summary>
        /// <param name="fileName">The file name or path.</param>
        /// <returns>The MIME type, or "application/octet-stream" if unknown.</returns>
        public static string GetContentType(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return "application/octet-stream";

            var extension = Path.GetExtension(fileName);
            if (string.IsNullOrEmpty(extension))
                return "application/octet-stream";

            return MimeTypes.TryGetValue(extension, out var mimeType)
                ? mimeType
                : "application/octet-stream";
        }

        /// <summary>
        /// Checks if the file is a streamable media type (video or audio).
        /// </summary>
        /// <param name="fileName">The file name or path.</param>
        /// <returns>True if the file is video or audio.</returns>
        public static bool IsStreamableMedia(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return false;

            var extension = Path.GetExtension(fileName);
            return !string.IsNullOrEmpty(extension) && StreamableMediaExtensions.Contains(extension);
        }

        /// <summary>
        /// Checks if the file is an image type.
        /// </summary>
        /// <param name="fileName">The file name or path.</param>
        /// <returns>True if the file is an image.</returns>
        public static bool IsImage(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return false;

            var extension = Path.GetExtension(fileName);
            return !string.IsNullOrEmpty(extension) && ImageExtensions.Contains(extension);
        }

        /// <summary>
        /// Determines if a file should be compressed based on smart compression logic.
        /// Already-compressed formats (media, images, archives) should NOT be compressed.
        /// </summary>
        /// <param name="fileName">The file name or path.</param>
        /// <returns>True if the file should be compressed, false if it's already compressed.</returns>
        public static bool ShouldCompress(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return true; // Default to compress for unknown

            var extension = Path.GetExtension(fileName);
            if (string.IsNullOrEmpty(extension))
                return true; // Default to compress for no extension

            // Don't compress already-compressed formats
            return !AlreadyCompressedExtensions.Contains(extension);
        }

        /// <summary>
        /// Checks if the file is a video type.
        /// </summary>
        /// <param name="fileName">The file name or path.</param>
        /// <returns>True if the file is a video.</returns>
        public static bool IsVideo(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return false;

            var contentType = GetContentType(fileName);
            return contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Checks if the file is an audio type.
        /// </summary>
        /// <param name="fileName">The file name or path.</param>
        /// <returns>True if the file is audio.</returns>
        public static bool IsAudio(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return false;

            var contentType = GetContentType(fileName);
            return contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase);
        }
    }
}
