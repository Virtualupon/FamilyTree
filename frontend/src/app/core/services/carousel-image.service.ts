import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface CarouselImage {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  storageType: number;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCarouselImage {
  imageUrl: string;
  title?: string;
  description?: string;
}

export interface CreateCarouselImageRequest {
  imageUrl: string;
  title?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateCarouselImageRequest {
  imageUrl?: string;
  title?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CarouselImageService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api`;

  /**
   * Get all carousel images (SuperAdmin only)
   */
  getAll(): Observable<CarouselImage[]> {
    return this.http.get<CarouselImage[]>(`${this.baseUrl}/admin/carousel-images`);
  }

  /**
   * Get active carousel images for public display (no auth required)
   */
  getActiveImages(): Observable<PublicCarouselImage[]> {
    return this.http.get<{ images: PublicCarouselImage[] }>(`${this.baseUrl}/carousel-images`)
      .pipe(map(response => response.images));
  }

  /**
   * Get a single carousel image by ID (SuperAdmin only)
   */
  getById(id: string): Observable<CarouselImage> {
    return this.http.get<CarouselImage>(`${this.baseUrl}/admin/carousel-images/${id}`);
  }

  /**
   * Create a new carousel image (SuperAdmin only)
   */
  create(request: CreateCarouselImageRequest): Observable<CarouselImage> {
    return this.http.post<CarouselImage>(`${this.baseUrl}/admin/carousel-images`, request);
  }

  /**
   * Update an existing carousel image (SuperAdmin only)
   */
  update(id: string, request: UpdateCarouselImageRequest): Observable<CarouselImage> {
    return this.http.put<CarouselImage>(`${this.baseUrl}/admin/carousel-images/${id}`, request);
  }

  /**
   * Delete a carousel image (SuperAdmin only)
   */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/admin/carousel-images/${id}`);
  }

  /**
   * Toggle active status (SuperAdmin only)
   */
  toggleActive(id: string): Observable<CarouselImage> {
    return this.http.patch<CarouselImage>(`${this.baseUrl}/admin/carousel-images/${id}/toggle-active`, {});
  }

  /**
   * Reorder carousel images (SuperAdmin only)
   */
  reorder(imageIds: string[]): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/admin/carousel-images/reorder`, { imageIds });
  }
}
