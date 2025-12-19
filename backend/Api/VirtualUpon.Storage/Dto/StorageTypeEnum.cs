using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VirtualUpon.Storage.Dto
{
    public enum StorageTypeEnum
    {
        LocalStorage = 1,
        Linode = 2,
        AWS = 3,
        Nextcloud = 4,
        Cloudflare = 5
    }
}
