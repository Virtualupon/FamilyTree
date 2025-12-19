using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using WebDav;

namespace VirtualUpon.Storage.Factories
{
    public static class WebDavClientFactory
    {
        public static IWebDavClient CreateWebDavClient(IConfiguration configuration)
        {
            var serverUrl = configuration["IdentityOptions:Storage:NextCloud:BaseUri"];
            var username = configuration["IdentityOptions:Storage:NextCloud:Username"];
            var password = configuration["IdentityOptions:Storage:NextCloud:Password"];

            var clientParams = new WebDavClientParams
            {
                BaseAddress = new Uri(serverUrl),
                Credentials = new NetworkCredential(username, password)
            };
            return new WebDavClient(clientParams);
        }
    }
}
