using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VirtualUpon.Storage.Dto
{
    public class ResponseDto<T>
    {
        public bool Success { get; set; } // Indicates if the operation was successful
        public T Data { get; set; } // Holds the successful result data
        public string ErrorMessage { get; set; } // Contains error details, if any
        public string ErrorCode { get; set; } // Optional error code for classification
    }

}
