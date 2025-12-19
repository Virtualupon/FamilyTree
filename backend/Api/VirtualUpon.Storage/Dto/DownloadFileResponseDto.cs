using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VirtualUpon.Storage.Dto
{
    public class DownloadFileResponseDto
    {
        public bool IsSuccessful { get; set; }
        public byte[]? FileData { get; set; }
        public string? ErrorMessage { get; set; }
        public string? StatusCode { get; set; }
        public string? AdditionalInfo { get; set; } // Optional field for any extra information
    }

}
