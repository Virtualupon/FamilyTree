import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { MediaSearchParams, MediaSearchResult, CachedSignedUrl } from '../models/media.models';
import { SignedMediaUrl } from '../models/person-media.models';

/**
 * Organization-wide media service with signed URL caching and expiry tracking.
 * Used by the Media Gallery component.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);

  // Signed URL cache with expiry tracking
  private readonly urlCache = new Map<string, CachedSignedUrl>();

  // Buffer time before expiry to trigger refresh (5 minutes)
  private readonly EXPIRY_BUFFER_MS = 5 * 60 * 1000;

  /**
   * Search media within the current organization
   */
  searchMedia(params: MediaSearchParams): Observable<MediaSearchResult> {
    let httpParams = new HttpParams();

    if (params.kind) httpParams = httpParams.set('kind', params.kind);
    if (params.personId) httpParams = httpParams.set('personId', params.personId);
    if (params.captureDateFrom) httpParams = httpParams.set('captureDateFrom', params.captureDateFrom);
    if (params.captureDateTo) httpParams = httpParams.set('captureDateTo', params.captureDateTo);
    if (params.capturePlaceId) httpParams = httpParams.set('capturePlaceId', params.capturePlaceId);
    if (params.searchTerm) httpParams = httpParams.set('searchTerm', params.searchTerm);
    if (params.excludeAvatars !== undefined) httpParams = httpParams.set('excludeAvatars', params.excludeAvatars.toString());
    if (params.page) httpParams = httpParams.set('page', params.page.toString());
    if (params.pageSize) httpParams = httpParams.set('pageSize', params.pageSize.toString());

    return this.http.get<MediaSearchResult>('/api/media', { params: httpParams });
  }

  /**
   * Get signed URL with caching and automatic refresh on expiry.
   * Returns cached URL if valid, otherwise fetches new one.
   */
  getSignedUrl(mediaId: string, expiresInSeconds = 3600): Observable<CachedSignedUrl> {
    const cached = this.urlCache.get(mediaId);

    // Check if cached URL is still valid (with buffer time)
    if (cached && this.isUrlValid(cached)) {
      return of(cached);
    }

    // Fetch new signed URL
    return this.http.get<SignedMediaUrl>(`/api/media/${mediaId}/signed-url`, {
      params: { expiresInSeconds: expiresInSeconds.toString() }
    }).pipe(
      map(response => {
        const cachedUrl: CachedSignedUrl = {
          url: response.url,
          expiresAt: new Date(response.expiresAt),
          contentType: response.contentType,
          mediaId
        };
        this.urlCache.set(mediaId, cachedUrl);
        return cachedUrl;
      }),
      catchError(err => {
        // Remove invalid cache entry on error
        this.urlCache.delete(mediaId);
        return throwError(() => err);
      })
    );
  }

  /**
   * Check if a cached URL is still valid (not expired or about to expire)
   */
  private isUrlValid(cached: CachedSignedUrl): boolean {
    const now = Date.now();
    const expiresAt = cached.expiresAt.getTime();
    return (expiresAt - now) > this.EXPIRY_BUFFER_MS;
  }

  /**
   * Invalidate cached URL for a media item
   */
  invalidateCache(mediaId: string): void {
    this.urlCache.delete(mediaId);
  }

  /**
   * Clear all cached URLs
   */
  clearCache(): void {
    this.urlCache.clear();
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
