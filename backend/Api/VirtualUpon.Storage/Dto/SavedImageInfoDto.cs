using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VirtualUpon.Storage.Dto
{
    public class SavedImageInfoDto
    {
        public int StorageType { get; set; } // Represents the storage type (e.g., 1 for local)
        public required string ImagePath { get; set; } // Path or URL of the saved image
        public bool Success { get; set; } // Indicates if the operation was successful
        public string ErrorMessage { get; set; } // Contains error details, if any
        public string ErrorCode { get; set; } // Optional field for more specific error codes (if needed)
    }

}
