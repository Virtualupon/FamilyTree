using System;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;

namespace VirtualUpon.Storage.Utilities
{
    public static class FileCompressionUtility
    {
        /// <summary>
        /// Compresses a byte array to a GZip format.
        /// </summary>
        /// <param name="inputData">The data to compress.</param>
        /// <returns>Compressed data as a byte array.</returns>
        public static byte[] Compress(byte[] inputData)
        {
            if (inputData == null || inputData.Length == 0)
            {
                throw new ArgumentException("Input data cannot be null or empty.", nameof(inputData));
            }

            using (var outputStream = new MemoryStream())
            {
                using (var gzipStream = new GZipStream(outputStream, CompressionMode.Compress))
                {
                    gzipStream.Write(inputData, 0, inputData.Length);
                }
                return outputStream.ToArray();
            }
        }

        /// <summary>
        /// Decompresses a GZip-compressed byte array.
        /// </summary>
        /// <param name="compressedData">The compressed data to decompress.</param>
        /// <returns>Decompressed data as a byte array.</returns>
        public static byte[] Decompress(byte[] data)
        {
            if (data == null || data.Length == 0)
            {
                throw new ArgumentException("Data cannot be null or empty.", nameof(data));
            }

            if (!IsCompressed(data))
            {
                throw new InvalidOperationException("Data is not compressed or is in an unsupported format.");
            }

            using (var inputStream = new MemoryStream(data))
            using (var gzipStream = new GZipStream(inputStream, CompressionMode.Decompress))
            using (var outputStream = new MemoryStream())
            {
                gzipStream.CopyTo(outputStream);
                return outputStream.ToArray();
            }
        }

        public static bool IsCompressed(byte[] data)
        {
            // Check for GZip magic number
            return data.Length >= 2 && data[0] == 0x1F && data[1] == 0x8B;
        }



        /// <summary>
        /// Asynchronously compresses a file.
        /// </summary>
        /// <param name="inputFilePath">The file to compress.</param>
        /// <param name="outputFilePath">The destination of the compressed file.</param>
        public static async Task CompressFileAsync(string inputFilePath, string outputFilePath)
        {
            if (string.IsNullOrEmpty(inputFilePath) || string.IsNullOrEmpty(outputFilePath))
            {
                throw new ArgumentException("File paths cannot be null or empty.");
            }

            using (var inputFileStream = new FileStream(inputFilePath, FileMode.Open, FileAccess.Read))
            using (var outputFileStream = new FileStream(outputFilePath, FileMode.Create, FileAccess.Write))
            using (var gzipStream = new GZipStream(outputFileStream, CompressionMode.Compress))
            {
                await inputFileStream.CopyToAsync(gzipStream);
            }
        }

        /// <summary>
        /// Asynchronously decompresses a file.
        /// </summary>
        /// <param name="compressedFilePath">The compressed file to decompress.</param>
        /// <param name="outputFilePath">The destination of the decompressed file.</param>
        public static async Task DecompressFileAsync(string compressedFilePath, string outputFilePath)
        {
            if (string.IsNullOrEmpty(compressedFilePath) || string.IsNullOrEmpty(outputFilePath))
            {
                throw new ArgumentException("File paths cannot be null or empty.");
            }

            using (var inputFileStream = new FileStream(compressedFilePath, FileMode.Open, FileAccess.Read))
            using (var outputFileStream = new FileStream(outputFilePath, FileMode.Create, FileAccess.Write))
            using (var gzipStream = new GZipStream(inputFileStream, CompressionMode.Decompress))
            {
                await gzipStream.CopyToAsync(outputFileStream);
            }
        }
    }
}
