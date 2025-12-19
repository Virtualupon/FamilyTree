# Media Service Guide - VirtualUpon.Storage Integration

## Overview
The Family Tree API uses **MediaService** to handle image, video, audio, and document uploads using **VirtualUpon.Storage** (exactly like your Nobiin Dictionary baseline). Media is transferred via Base64 encoding for seamless frontend integration.

## Architecture

```
Frontend (Angular) 
    ↓ (Base64 + metadata)
MediaUploadController 
    ↓
MediaService 
    ↓ (Base64 → bytes)
VirtualUpon.Storage 
    ↓
Storage Provider (Local/AWS/Linode/Cloudflare)
```

## Files Created

### Backend Services
- ✅ **`Services/IMediaService.cs`** - Media service interface
- ✅ **`Services/MediaService.cs`** - VirtualUpon.Storage wrapper (like Nobiin Dictionary)
- ✅ **`Controllers/MediaUploadController.cs`** - Base64 upload/download endpoints
- ✅ **`DTOs/MediaDTOs.cs`** - Request/response models
- ✅ **`Program.cs`** - MediaService registered

### Service Registration (Program.cs)
```csharp
services.AddScoped<IMediaService, MediaService>();
```

## API Endpoints

### 1. Upload Media (Base64)
**`POST /api/media/upload/base64`**

Upload images, videos, audio, or documents as Base64.

**Request:**
```json
{
  "personId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "base64Data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "caption": "Family reunion 2024",
  "copyright": "© Smith Family"
}
```

**Response:**
```json
{
  "id": "8b3e7f12-a4c5-4d89-9f23-1a2b3c4d5e6f",
  "personId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 245632,
  "mediaType": "Image",
  "caption": "Family reunion 2024",
  "copyright": "© Smith Family",
  "uploadedAt": "2025-11-15T10:30:00Z",
  "thumbnailUrl": null
}
```

### 2. Download Media as Base64
**`GET /api/media/{mediaId}/base64`**

Get media as Base64 for display in frontend.

**Response:**
```json
{
  "id": "8b3e7f12-a4c5-4d89-9f23-1a2b3c4d5e6f",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "base64Data": "/9j/4AAQSkZJRgABAQAA..."
}
```

### 3. Download Media as File
**`GET /api/media/{mediaId}/download`**

Direct binary download (returns file stream).

### 4. Get Person's Media
**`GET /api/media/person/{personId}`**

Get all media files for a person.

**Response:**
```json
[
  {
    "id": "8b3e7f12-a4c5-4d89-9f23-1a2b3c4d5e6f",
    "personId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "photo.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 245632,
    "mediaType": "Image",
    "caption": "Family reunion 2024",
    "uploadedAt": "2025-11-15T10:30:00Z"
  }
]
```

### 5. Delete Media
**`DELETE /api/media/{mediaId}`**

Delete media from storage and database.

## Frontend Integration (Angular)

### Upload Service

```typescript
// media.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UploadMediaRequest {
  personId: string;
  base64Data: string;
  fileName: string;
  mimeType?: string;
  caption?: string;
  copyright?: string;
}

export interface MediaResponse {
  id: string;
  personId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  mediaType: string;
  caption?: string;
  copyright?: string;
  uploadedAt: string;
  thumbnailUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MediaService {
  private apiUrl = 'http://localhost:8080/api/media';

  constructor(private http: HttpClient) {}

  uploadMedia(request: UploadMediaRequest): Observable<MediaResponse> {
    return this.http.post<MediaResponse>(`${this.apiUrl}/upload/base64`, request);
  }

  getMediaAsBase64(mediaId: string): Observable<{ base64Data: string; mimeType: string }> {
    return this.http.get<{ base64Data: string; mimeType: string }>(
      `${this.apiUrl}/${mediaId}/base64`
    );
  }

  getPersonMedia(personId: string): Observable<MediaResponse[]> {
    return this.http.get<MediaResponse[]>(`${this.apiUrl}/person/${personId}`);
  }

  deleteMedia(mediaId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${mediaId}`);
  }

  getDownloadUrl(mediaId: string): string {
    return `${this.apiUrl}/${mediaId}/download`;
  }
}
```

### Upload Component

```typescript
// media-upload.component.ts
import { Component } from '@angular/core';
import { MediaService } from './media.service';

@Component({
  selector: 'app-media-upload',
  template: `
    <div class="upload-container">
      <h3>Upload Photo</h3>
      
      <input 
        type="file" 
        (change)="onFileSelected($event)" 
        accept="image/*,video/*,audio/*"
        #fileInput>
      
      <input 
        type="text" 
        [(ngModel)]="caption" 
        placeholder="Caption (optional)">
      
      <button 
        (click)="uploadFile()" 
        [disabled]="!selectedFile || uploading">
        {{ uploading ? 'Uploading...' : 'Upload' }}
      </button>

      <div *ngIf="uploadedMedia">
        <p>✅ Uploaded successfully!</p>
        <img [src]="'data:' + uploadedMedia.mimeType + ';base64,' + uploadedMedia.base64Data" 
             alt="Uploaded image"
             style="max-width: 300px;">
      </div>
    </div>
  `
})
export class MediaUploadComponent {
  selectedFile: File | null = null;
  caption = '';
  uploading = false;
  uploadedMedia: any = null;
  personId = '3fa85f64-5717-4562-b3fc-2c963f66afa6'; // Replace with actual person ID

  constructor(private mediaService: MediaService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  uploadFile(): void {
    if (!this.selectedFile) return;

    this.uploading = true;

    // Convert file to Base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;

      const request = {
        personId: this.personId,
        base64Data: base64Data,
        fileName: this.selectedFile!.name,
        mimeType: this.selectedFile!.type,
        caption: this.caption || undefined
      };

      this.mediaService.uploadMedia(request).subscribe({
        next: (response) => {
          console.log('Upload successful:', response);
          
          // Load the uploaded image for preview
          this.mediaService.getMediaAsBase64(response.id).subscribe({
            next: (data) => {
              this.uploadedMedia = data;
              this.uploading = false;
              this.selectedFile = null;
              this.caption = '';
            }
          });
        },
        error: (error) => {
          console.error('Upload failed:', error);
          this.uploading = false;
        }
      });
    };

    reader.readAsDataURL(this.selectedFile);
  }
}
```

### Display Media Gallery

```typescript
// person-media-gallery.component.ts
import { Component, Input, OnInit } from '@angular/core';
import { MediaService, MediaResponse } from './media.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-person-media-gallery',
  template: `
    <div class="media-gallery">
      <h3>Photos & Videos</h3>
      
      <div class="grid">
        <div *ngFor="let media of mediaList" class="media-item">
          <img *ngIf="media.mediaType === 'Image'" 
               [src]="media.previewUrl" 
               [alt]="media.caption || media.fileName"
               (click)="viewFullSize(media)">
          
          <video *ngIf="media.mediaType === 'Video'" 
                 [src]="media.previewUrl" 
                 controls>
          </video>
          
          <audio *ngIf="media.mediaType === 'Audio'" 
                 [src]="media.previewUrl" 
                 controls>
          </audio>
          
          <div class="media-info">
            <p>{{ media.caption || media.fileName }}</p>
            <small>{{ media.uploadedAt | date }}</small>
            <button (click)="deleteMedia(media.id)">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    
    .media-item img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      cursor: pointer;
    }
  `]
})
export class PersonMediaGalleryComponent implements OnInit {
  @Input() personId!: string;
  mediaList: (MediaResponse & { previewUrl?: SafeUrl })[] = [];

  constructor(
    private mediaService: MediaService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadMedia();
  }

  loadMedia(): void {
    this.mediaService.getPersonMedia(this.personId).subscribe({
      next: (media) => {
        this.mediaList = media;
        
        // Load Base64 previews for each media item
        media.forEach((item, index) => {
          this.mediaService.getMediaAsBase64(item.id).subscribe({
            next: (data) => {
              const base64Url = `data:${data.mimeType};base64,${data.base64Data}`;
              this.mediaList[index].previewUrl = 
                this.sanitizer.bypassSecurityTrustUrl(base64Url);
            }
          });
        });
      }
    });
  }

  viewFullSize(media: MediaResponse): void {
    // Open in modal or new window
    console.log('View full size:', media);
  }

  deleteMedia(mediaId: string): void {
    if (confirm('Delete this media?')) {
      this.mediaService.deleteMedia(mediaId).subscribe({
        next: () => {
          this.mediaList = this.mediaList.filter(m => m.id !== mediaId);
        }
      });
    }
  }
}
```

## MediaService Implementation Details

### Base64 Conversion
```csharp
// Handles both raw Base64 and data URI format
private static byte[] Base64ToBytes(string base64)
{
    // Remove data URI prefix if present (data:image/jpeg;base64,...)
    if (base64.Contains(','))
    {
        base64 = base64.Split(',')[1];
    }
    return Convert.FromBase64String(base64);
}

private static string BytesToBase64(byte[] bytes)
{
    return Convert.ToBase64String(bytes);
}
```

### File Type Detection
```csharp
private static MediaType DetermineMediaType(string mimeType)
{
    if (mimeType.StartsWith("image/")) return MediaType.Image;
    if (mimeType.StartsWith("video/")) return MediaType.Video;
    if (mimeType.StartsWith("audio/")) return MediaType.Audio;
    return MediaType.Document;
}
```

### Storage Path Structure
```
family-tree/
  └── people/
      └── {personId}/
          ├── image/
          │   └── Image_{guid}.jpg
          ├── video/
          │   └── Video_{guid}.mp4
          ├── audio/
          │   └── Audio_{guid}.mp3
          └── document/
              └── Document_{guid}.pdf
```

## Supported File Types

### Images
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- GIF (`.gif`)
- WebP (`.webp`)

### Videos
- MP4 (`.mp4`)
- WebM (`.webm`)
- QuickTime (`.mov`)

### Audio
- MP3 (`.mp3`)
- WAV (`.wav`)
- WebM Audio (`.webm`)
- Ogg (`.ogg`)

### Documents
- PDF (`.pdf`)

## Database Schema

```sql
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id),
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT NOT NULL,
    media_type VARCHAR(20) NOT NULL, -- Image, Video, Audio, Document
    storage_type INTEGER NOT NULL,   -- 1=Local, 2=Linode, 3=AWS, 4=Nextcloud, 5=Cloudflare
    caption TEXT,
    copyright VARCHAR(255),
    thumbnail_path VARCHAR(500),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Usage Flow

### Upload Flow
1. **Frontend**: User selects file → Convert to Base64
2. **Frontend**: Send Base64 + metadata to `/api/media/upload/base64`
3. **MediaService**: Convert Base64 → bytes
4. **MediaService**: Upload to VirtualUpon.Storage
5. **MediaService**: Save Media record to database
6. **Frontend**: Receive media metadata

### Display Flow
1. **Frontend**: Request `/api/media/{mediaId}/base64`
2. **MediaService**: Load Media record from database
3. **MediaService**: Download from VirtualUpon.Storage
4. **MediaService**: Convert bytes → Base64
5. **Frontend**: Display as `<img src="data:image/jpeg;base64,...">`

## Benefits

✅ **Baseline Compatibility** - Uses VirtualUpon.Storage exactly like Nobiin Dictionary  
✅ **Multi-Provider Support** - Local, AWS, Linode, Cloudflare, Nextcloud  
✅ **Base64 Encoding** - Simple frontend integration  
✅ **Type Safety** - Full TypeScript/C# types  
✅ **Metadata Tracking** - Captions, copyright, timestamps  
✅ **Storage Migration** - Switch providers without code changes  

## Next Steps

1. ✅ MediaService and MediaUploadController implemented
2. Create Angular media upload component
3. Add thumbnail generation for images
4. Implement lazy loading for large media galleries
5. Add image compression before upload

## Testing

### Test Upload (curl)
```bash
curl -X POST http://localhost:8080/api/media/upload/base64 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "personId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "base64Data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "fileName": "test.jpg",
    "mimeType": "image/jpeg",
    "caption": "Test upload"
  }'
```

### Test Download (curl)
```bash
curl http://localhost:8080/api/media/{mediaId}/base64 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
