import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TownImageDto,
  CarouselImageDto,
  UploadTownImageRequest,
  UpdateTownImageRequest,
  ReorderTownImagesRequest,
  LandingPageImagesResponse,
  SignedMediaUrl
} from '../models/town-image.models';

@Injectable({ providedIn: 'root' })
export class TownImageService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/town-images`;

  // ========================================
  // PUBLIC ENDPOINTS
  // ========================================

  /** Get all images for landing page carousel (public) */
  getLandingPageImages(): Observable<LandingPageImagesResponse> {
    return this.http.get<LandingPageImagesResponse>(`${this.apiUrl}/landing`);
  }

  /** Get images for a specific town (public) */
  getTownImages(townId: string): Observable<CarouselImageDto[]> {
    return this.http.get<CarouselImageDto[]>(`${this.apiUrl}/town/${townId}`);
  }

  /** Get image as Base64 (for display) */
  getImageAsBase64(imageId: string): Observable<{ base64Data: string }> {
    return this.http.get<{ base64Data: string }>(`${this.apiUrl}/${imageId}/base64`);
  }

  /** Get download URL for image */
  getImageDownloadUrl(imageId: string): string {
    return `${this.apiUrl}/${imageId}/download`;
  }

  /**
   * Get a signed URL for secure image streaming
   * GET /town-images/{imageId}/signed-url
   *
   * Use this for displaying images in carousels and galleries.
   * The URL can be used directly in <img src>.
   * Browser will cache the image via HTTP headers.
   *
   * @param imageId The image ID
   * @param expiresInSeconds URL validity (default 1 hour, max 24 hours)
   */
  getSignedUrl(imageId: string, expiresInSeconds = 3600): Observable<SignedMediaUrl> {
    return this.http.get<SignedMediaUrl>(
      `${this.apiUrl}/${imageId}/signed-url`,
      { params: { expiresInSeconds: expiresInSeconds.toString() } }
    );
  }

  // ========================================
  // AUTHENTICATED ENDPOINTS
  // ========================================

  /** Get images for user's available towns (town selection) */
  getAvailableTownImages(): Observable<CarouselImageDto[]> {
    return this.http.get<CarouselImageDto[]>(`${this.apiUrl}/available`);
  }

  // ========================================
  // SUPERADMIN CRUD ENDPOINTS (Base64 Upload)
  // ========================================

  /** 
   * Upload new image using Base64 (SuperAdmin)
   * Same pattern as avatar/media upload
   */
  uploadImage(request: UploadTownImageRequest): Observable<TownImageDto> {
    return this.http.post<TownImageDto>(`${this.apiUrl}/upload/base64`, request);
  }

  /** 
   * Helper: Convert File to Base64 and upload
   */
  uploadImageFile(
    townId: string,
    file: File,
    metadata?: {
      title?: string;
      titleNb?: string;
      titleAr?: string;
      titleEn?: string;
      description?: string;
      descriptionNb?: string;
      descriptionAr?: string;
      descriptionEn?: string;
      displayOrder?: number;
    }
  ): Observable<TownImageDto> {
    return new Observable(observer => {
      const reader = new FileReader();
      
      reader.onload = () => {
        const base64Data = reader.result as string;
        
        const request: UploadTownImageRequest = {
          townId,
          base64Data,
          fileName: file.name,
          mimeType: file.type,
          ...metadata
        };
        
        this.uploadImage(request).subscribe({
          next: (result) => {
            observer.next(result);
            observer.complete();
          },
          error: (err) => observer.error(err)
        });
      };
      
      reader.onerror = () => observer.error(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /** Get all images (SuperAdmin) */
  getAllImages(townId?: string, includeInactive = true): Observable<TownImageDto[]> {
    let url = this.apiUrl;
    const params: string[] = [];
    if (townId) params.push(`townId=${townId}`);
    if (includeInactive) params.push(`includeInactive=true`);
    if (params.length) url += `?${params.join('&')}`;
    return this.http.get<TownImageDto[]>(url);
  }

  /** Update image metadata (SuperAdmin) */
  updateImage(id: string, request: UpdateTownImageRequest): Observable<TownImageDto> {
    return this.http.put<TownImageDto>(`${this.apiUrl}/${id}`, request);
  }

  /** Delete image (SuperAdmin) */
  deleteImage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /** Reorder images for a town (SuperAdmin) */
  reorderImages(townId: string, request: ReorderTownImagesRequest): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/town/${townId}/reorder`, request);
  }

  /** Toggle image active status (SuperAdmin) */
  toggleActive(id: string): Observable<TownImageDto> {
    return this.http.patch<TownImageDto>(`${this.apiUrl}/${id}/toggle-active`, {});
  }
}