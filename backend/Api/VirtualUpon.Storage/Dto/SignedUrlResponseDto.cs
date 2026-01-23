using System;

namespace VirtualUpon.Storage.Dto
{
    /// <summary>
    /// Response DTO for signed URL generation operations.
    /// </summary>
    public class SignedUrlResponseDto
    {
        /// <summary>
        /// Indicates whether the signed URL was generated successfully.
        /// </summary>
        public bool IsSuccessful { get; set; }

        /// <summary>
        /// The generated signed URL for accessing the file.
        /// </summary>
        public string? Url { get; set; }

        /// <summary>
        /// The UTC datetime when the signed URL expires.
        /// </summary>
        public DateTime? ExpiresAt { get; set; }

        /// <summary>
        /// The MIME content type of the file.
        /// </summary>
        public string? ContentType { get; set; }

        /// <summary>
        /// Error message if the operation failed.
        /// </summary>
        public string? ErrorMessage { get; set; }
    }
}
