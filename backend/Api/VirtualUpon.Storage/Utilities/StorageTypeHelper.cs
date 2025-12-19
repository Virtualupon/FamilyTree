using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using VirtualUpon.Storage.Dto;

namespace VirtualUpon.Storage.Utilities
{
    public static class StorageTypeHelper
    {
        public static int ConvertStorageTypeToInt(string storageType)
        {
            if (Enum.TryParse(typeof(StorageTypeEnum), storageType, true, out var result))
            {
                return (int)result;
            }
            throw new ArgumentException($"Invalid or unsupported storage type '{storageType}'");
        }
    }
}
