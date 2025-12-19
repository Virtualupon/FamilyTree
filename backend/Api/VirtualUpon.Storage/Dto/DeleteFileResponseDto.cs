using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VirtualUpon.Storage.Dto
{
    public class DeleteFileResponseDto
    {
        public bool IsSuccessful { get; set; }
        public string? ErrorMessage { get; set; }
        public string? DeletedFilePath { get; set; }
        public string? AdditionalInfo { get; set; } // Optional field for any extra information
    }

}
