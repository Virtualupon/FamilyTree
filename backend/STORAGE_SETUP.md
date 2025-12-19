# VirtualUpon.Storage Setup Instructions

## Overview
The Family Tree API uses the **VirtualUpon.Storage** library from your Nobiin Dictionary baseline for multi-provider media storage (photos, documents, videos).

## ⚠️ Important: LSP Errors in Replit
The LSP errors you see in `Program.cs` are **expected** because the VirtualUpon.Storage library is not available in the Replit environment. These errors will disappear when you:

1. Open the project in **Visual Studio 2022**
2. Add the VirtualUpon.Storage library (see instructions below)
3. Restore NuGet packages

## Adding VirtualUpon.Storage in Visual Studio 2022

### Option 1: Project Reference (if you have the source)
1. Right-click on the `FamilyTreeApi` project in Solution Explorer
2. Select **Add** → **Project Reference**
3. Browse to your `VirtualUpon.Storage` project
4. Click **OK**

### Option 2: NuGet Package Reference (if you've packaged it)
1. Right-click on the `FamilyTreeApi` project
2. Select **Manage NuGet Packages**
3. Search for `VirtualUpon.Storage`
4. Click **Install**

### Option 3: Manual .csproj Edit
Add this to your `FamilyTreeApi.csproj`:

```xml
<!-- If using project reference -->
<ItemGroup>
  <ProjectReference Include="..\VirtualUpon.Storage\VirtualUpon.Storage.csproj" />
</ItemGroup>

<!-- OR if using NuGet package -->
<ItemGroup>
  <PackageReference Include="VirtualUpon.Storage" Version="1.0.0" />
</ItemGroup>
```

## Storage Providers Configured

The Family Tree API is configured to use these storage providers (matching your baseline):

| Provider | Storage Type Int | Configuration Section |
|----------|------------------|----------------------|
| LocalStorage | 1 | StorageConfiguration.LocalStorage |
| Linode | 2 | StorageConfiguration.Linode |
| AWS | 3 | StorageConfiguration.AWS |
| Nextcloud | 4 | StorageConfiguration.Nextcloud |
| Cloudflare | 5 | StorageConfiguration.Cloudflare |

## Configuration in appsettings.json

```json
{
  "StorageConfiguration": {
    "StorageType": "LocalStorage",
    "LocalStorage": {
      "BasePath": "/var/www/familytree/media/"
    },
    "AWS": {
      "AccessKey": "",
      "SecretKey": "",
      "Region": "us-east-1",
      "BucketName": "familytree-media"
    },
    "Linode": {
      "AccessKey": "",
      "SecretKey": "",
      "S3Endpoint": "us-east-1.linodeobjects.com",
      "BucketName": "familytree-media"
    },
    "Nextcloud": {
      "Username": "",
      "Password": "",
      "BaseUrl": "https://nextcloud.example.com"
    },
    "Cloudflare": {
      "AccountId": "",
      "AccessKey": "",
      "SecretKey": "",
      "BucketName": "familytree-media"
    }
  }
}
```

## Storage Service Factory (Program.cs)

The storage service is registered exactly like your Nobiin Dictionary baseline:

```csharp
services.AddScoped<IStorageService>(provider =>
{
    var config = provider.GetRequiredService<IConfiguration>()
        .GetSection("StorageConfiguration").Get<StorageConfiguration>()
        ?? throw new InvalidOperationException("Storage configuration missing.");

    int storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(config.StorageType);
    var cache = provider.GetService<IDistributedCache>();

    return storageTypeInt switch
    {
        1 => StorageServiceFactory.CreateLocalStorageService(config, cache),
        2 => ValidateLinodeConfig(config) ? StorageServiceFactory.CreateLinodeStorageService(config, cache) : throw new InvalidOperationException("Invalid Linode config"),
        3 => ValidateAwsConfig(config) ? StorageServiceFactory.CreateAwsStorageService(config, cache) : throw new InvalidOperationException("Invalid AWS config"),
        4 => ValidateNextcloudConfig(config) ? StorageServiceFactory.CreateNextCloudStorageService(config, new WebDavClient(), new HttpClient(), cache) : throw new InvalidOperationException("Invalid Nextcloud config"),
        5 => ValidateCloudflareConfig(config) ? StorageServiceFactory.CreateCloudflareStorageService(config, cache) : throw new InvalidOperationException("Invalid Cloudflare config"),
        _ => throw new ArgumentException($"Unsupported storage type: {config.StorageType}")
    };
});
```

## Usage in Controllers

After adding the library, you can use `IStorageService` in your controllers:

```csharp
public class MediaController : ControllerBase
{
    private readonly IStorageService _storageService;
    
    public MediaController(IStorageService storageService)
    {
        _storageService = storageService;
    }
    
    [HttpPost("upload")]
    public async Task<IActionResult> UploadPhoto([FromBody] UploadRequest request)
    {
        // Convert Base64 to bytes
        var bytes = Convert.FromBase64String(request.Base64Data);
        
        // Define storage path
        string[] pathSegments = new[] { "family-tree", "people", request.PersonId.ToString() };
        
        // Upload to configured storage provider
        var result = await _storageService.UploadFileAsync(
            pathSegments,
            request.FileName,
            bytes
        );
        
        return Ok(new { url = result.ImagePath });
    }
    
    [HttpGet("download/{mediaId}")]
    public async Task<IActionResult> DownloadPhoto(Guid mediaId)
    {
        var media = await _context.Media.FindAsync(mediaId);
        if (media == null) return NotFound();
        
        var response = await _storageService.DownloadFileAsync(media.FilePath);
        
        return File(response.FileData, media.MimeType ?? "application/octet-stream");
    }
}
```

## Verification Steps in Visual Studio 2022

1. ✅ Open `FamilyTreeApi.sln` in Visual Studio 2022
2. ✅ Add VirtualUpon.Storage reference (see options above)
3. ✅ Build the solution (Ctrl+Shift+B)
4. ✅ Verify no build errors
5. ✅ Update connection string in appsettings.json
6. ✅ Run the application (F5)

## Troubleshooting

### "The type or namespace name 'VirtualUpon' could not be found"
- Add the VirtualUpon.Storage library reference (see instructions above)
- Restore NuGet packages: Tools → NuGet Package Manager → Restore

### "StorageTypeHelper not found"
- The `StorageTypeHelper.ConvertStorageTypeToInt()` method is part of VirtualUpon.Storage.Utilities
- Make sure the library reference is added correctly

### "IStorageService interface not found"
- Make sure you're using `IStorageService` from `VirtualUpon.Storage.Factories`
- The placeholder `Services/IStorageService.cs` has been removed - use VirtualUpon.Storage's interface instead

## Files Modified/Created

- ✅ `Models/Configuration/StorageConfiguration.cs` - Storage configuration models (CREATED)
- ✅ `appsettings.json` - Storage configuration section (UPDATED)
- ✅ `Program.cs` - Storage service factory registration (UPDATED)
- ✅ `Services/IStorageService.cs` - Placeholder removed (use VirtualUpon.Storage instead)

## Next Steps

After adding VirtualUpon.Storage:
1. Configure your preferred storage provider in appsettings.json
2. Implement Media upload/download endpoints
3. Test with sample photos and documents
4. Deploy to production with cloud storage (AWS/Linode/Cloudflare)
