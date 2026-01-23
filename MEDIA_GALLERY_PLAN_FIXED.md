# Media Gallery Component Implementation Plan (FIXED)

## Overview
Build a full-featured media gallery component for `/media` route in the dashboard. This will display all media (images, audio, video) with filtering, pagination, linked persons, and responsive design following existing app patterns.

**Working Directories:**
- Frontend: `C:\Dev\Repo\FamilyTree\frontend`
- Backend: `C:\Dev\Repo\FamilyTree\backend`

---

## Current State

### Existing Backend API
- `GET /api/media` - MediaSearchRequest → MediaSearchResponse (paginated)
- `GET /api/media/{id}/signed-url` - SignedMediaUrlDto
- `GET /api/media/{id}/persons` - LinkedPersonDto[] (via PersonMediaController)

### Existing Authorization (VERIFIED)
The `GET /api/media` endpoint enforces tenant isolation:
1. Controller: `[Authorize]` attribute requires authentication
2. Service: `SearchMediaAsync` checks `userContext.OrgId == null` and returns error
3. Query: `Where(m => m.OrgId == orgId)` filters to current organization only
4. UserContext built from JWT claims (`orgId`, `systemRole`, `TreeRole`)

**Authorization is enforced at database query level - no cross-tenant data leakage possible.**

### Missing in MediaResponse
- `LinkedPersons` field not included in search results (need to add via projection)

### Existing Frontend
- Empty placeholder: `media-gallery.component.ts/html`
- Models: `PersonMediaListItem`, `MediaWithData`, `LinkedPerson`, `SignedMediaUrl`
- Services: `PersonMediaService` (person-scoped, need org-wide service)

---

## Implementation Plan

### Phase 1: Backend Enhancement

#### 1.1 Update MediaResponse DTO
**File:** `backend/FamilyTreeApi/DTOs/MediaDTOs.cs`

Add LinkedPersons to MediaResponse:
```csharp
public class MediaResponse
{
    // ... existing fields ...

    /// <summary>Persons linked to this media (populated via projection)</summary>
    public List<LinkedPersonDto> LinkedPersons { get; set; } = new();
}
```

#### 1.2 Update MediaManagementService - CRITICAL FIX: Use Projection
**File:** `backend/FamilyTreeApi/Services/MediaManagementService.cs`

**IMPORTANT:** Do NOT use `.Include()` before pagination. Use projection in `.Select()` to:
1. Ensure pagination happens at database level BEFORE loading linked persons
2. Avoid N+1 queries by projecting linked persons inline
3. Limit linked persons data to only required fields

Replace the existing Select projection (lines 105-127) with:

```csharp
// In SearchMediaAsync method - PAGINATION FIRST, THEN PROJECT
var media = await query
    .OrderByDescending(m => m.CaptureDate)
    .ThenByDescending(m => m.CreatedAt)
    .Skip((request.Page - 1) * request.PageSize)
    .Take(request.PageSize)  // Pagination happens at DB level
    .Select(m => new MediaResponse
    {
        Id = m.Id,
        OrgId = m.OrgId,
        PersonId = m.PersonId,
        Kind = m.Kind,
        Url = m.Url,
        StorageKey = m.StorageKey,
        FileName = m.FileName,
        MimeType = m.MimeType,
        FileSize = m.FileSize,
        Title = m.Title,
        Description = m.Description,
        CaptureDate = m.CaptureDate,
        CapturePlaceId = m.CapturePlaceId,
        PlaceName = m.CapturePlace != null ? m.CapturePlace.Name : null,
        Visibility = m.Visibility,
        Copyright = m.Copyright,
        ThumbnailPath = m.ThumbnailPath,
        MetadataJson = m.MetadataJson,
        CreatedAt = m.CreatedAt,
        UpdatedAt = m.UpdatedAt,
        // Project linked persons inline - no separate query
        LinkedPersons = m.PersonLinks
            .Select(pl => new LinkedPersonDto(
                pl.PersonId,
                pl.Person != null
                    ? (pl.Person.PrimaryName ?? pl.Person.NameEnglish ?? pl.Person.NameArabic ?? "Unknown")
                    : "Unknown",
                pl.IsPrimary,
                pl.Notes,
                pl.LinkedAt
            ))
            .ToList()
    })
    .ToListAsync(cancellationToken);
```

**Why this is safe:**
- `.Skip()` and `.Take()` execute at database level before `.Select()`
- EF Core translates the nested `PersonLinks.Select()` into a single SQL query with JOIN
- No cartesian explosion - each media item gets only its linked persons
- Null-safe person name resolution with fallback chain

#### 1.3 Enforce Maximum Page Size
**File:** `backend/FamilyTreeApi/Services/MediaManagementService.cs`

Add validation at the start of `SearchMediaAsync`:

```csharp
public async Task<ServiceResult<MediaSearchResponse>> SearchMediaAsync(
    MediaSearchRequest request,
    UserContext userContext,
    CancellationToken cancellationToken = default)
{
    // Enforce maximum page size to prevent DoS
    const int MaxPageSize = 100;
    if (request.PageSize > MaxPageSize)
    {
        request.PageSize = MaxPageSize;
    }
    if (request.PageSize < 1)
    {
        request.PageSize = 20;
    }
    if (request.Page < 1)
    {
        request.Page = 1;
    }

    // ... existing code ...
}
```

---

### Phase 2: Frontend Service

#### 2.1 Add Media Models
**File:** `frontend/src/app/core/models/media.models.ts` (new)

```typescript
import { LinkedPerson } from './person-media.models';

export type MediaKind = 'Image' | 'Audio' | 'Video' | 'Document';

export interface MediaSearchParams {
  kind?: MediaKind;
  personId?: string;
  captureDateFrom?: string;
  captureDateTo?: string;
  capturePlaceId?: string;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

export interface MediaItem {
  id: string;
  orgId: string;
  personId?: string;
  kind: MediaKind;
  url: string;
  storageKey: string;
  fileName: string;
  mimeType?: string;
  fileSize: number;
  title?: string;
  description?: string;
  captureDate?: string;
  capturePlaceId?: string;
  placeName?: string;
  visibility: number;
  copyright?: string;
  thumbnailPath?: string;
  metadataJson?: string;
  createdAt: string;
  updatedAt: string;
  linkedPersons: LinkedPerson[];
}

export interface MediaSearchResult {
  media: MediaItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Cached signed URL with expiry tracking
 */
export interface CachedSignedUrl {
  url: string;
  expiresAt: Date;
  contentType: string;
  mediaId: string;
}
```

#### 2.2 Create MediaService with Signed URL Caching & Expiry Tracking
**File:** `frontend/src/app/core/services/media.service.ts` (new)

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { MediaSearchParams, MediaSearchResult, MediaItem, CachedSignedUrl } from '../models/media.models';
import { SignedMediaUrl } from '../models/person-media.models';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);

  // Signed URL cache with expiry tracking
  private readonly urlCache = new Map<string, CachedSignedUrl>();

  // Buffer time before expiry to trigger refresh (5 minutes)
  private readonly EXPIRY_BUFFER_MS = 5 * 60 * 1000;

  searchMedia(params: MediaSearchParams): Observable<MediaSearchResult> {
    let httpParams = new HttpParams();

    if (params.kind) httpParams = httpParams.set('kind', params.kind);
    if (params.personId) httpParams = httpParams.set('personId', params.personId);
    if (params.captureDateFrom) httpParams = httpParams.set('captureDateFrom', params.captureDateFrom);
    if (params.captureDateTo) httpParams = httpParams.set('captureDateTo', params.captureDateTo);
    if (params.capturePlaceId) httpParams = httpParams.set('capturePlaceId', params.capturePlaceId);
    if (params.searchTerm) httpParams = httpParams.set('searchTerm', params.searchTerm);
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
```

---

### Phase 3: Media Gallery Component

#### 3.1 Component Structure with Error Handling & Request Cancellation
**File:** `frontend/src/app/features/media/media-gallery.component.ts`

```typescript
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  takeUntil,
  finalize
} from 'rxjs/operators';

import { MediaService } from '../../core/services/media.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { MediaItem, MediaKind, MediaSearchParams, CachedSignedUrl } from '../../core/models/media.models';

type ViewMode = 'grid' | 'list';

interface LoadingState {
  search: boolean;
  signedUrls: Map<string, boolean>;
}

@Component({
  selector: 'app-media-gallery',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatSnackBarModule,
    TranslatePipe
  ],
  templateUrl: './media-gallery.component.html',
  styleUrls: ['./media-gallery.component.scss']
})
export class MediaGalleryComponent implements OnInit, OnDestroy {
  private readonly mediaService = inject(MediaService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  // Form controls
  searchControl = new FormControl('');
  kindFilter = signal<MediaKind | null>(null);

  // State signals
  media = signal<MediaItem[]>([]);
  totalCount = signal(0);
  page = signal(1);
  pageSize = signal(24);
  viewMode = signal<ViewMode>('grid');

  // Loading & error states
  isLoading = signal(false);
  error = signal<string | null>(null);
  signedUrlLoading = signal<Map<string, boolean>>(new Map());
  signedUrlErrors = signal<Map<string, string>>(new Map());

  // Signed URL cache (maps mediaId -> CachedSignedUrl)
  signedUrls = signal<Map<string, CachedSignedUrl>>(new Map());

  // Lightbox state
  lightboxMedia = signal<MediaItem | null>(null);
  lightboxSignedUrl = signal<string | null>(null);

  // Computed
  totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));
  hasMedia = computed(() => this.media().length > 0);

  // Page size options
  readonly pageSizeOptions = [12, 24, 48, 96];

  // Media kind options for filter
  readonly kindOptions: (MediaKind | null)[] = [null, 'Image', 'Audio', 'Video'];

  ngOnInit(): void {
    this.setupSearch();
    this.loadMedia();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Clean up signed URL cache
    this.mediaService.clearCache();
  }

  /**
   * Setup debounced search with request cancellation (switchMap)
   */
  private setupSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      // switchMap cancels previous in-flight request when new search term arrives
      switchMap(term => {
        this.isLoading.set(true);
        this.error.set(null);
        this.page.set(1); // Reset to first page on new search

        return this.fetchMedia(term).pipe(
          catchError(err => {
            console.error('Search error:', err);
            this.error.set(err.error?.message || this.i18n.t('media.failedLoadMedia'));
            return of({ media: [], totalCount: 0, page: 1, pageSize: this.pageSize(), totalPages: 0 });
          }),
          finalize(() => this.isLoading.set(false))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.media.set(result.media);
      this.totalCount.set(result.totalCount);
      this.preloadSignedUrls(result.media.slice(0, 12));
    });

    // Connect search input to subject
    this.searchControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (typeof value === 'string') {
          this.searchSubject.next(value);
        }
      });
  }

  /**
   * Build search params and fetch media
   */
  private fetchMedia(searchTerm?: string) {
    const params: MediaSearchParams = {
      page: this.page(),
      pageSize: this.pageSize(),
      kind: this.kindFilter() ?? undefined,
      searchTerm: searchTerm || this.searchControl.value || undefined
    };

    return this.mediaService.searchMedia(params);
  }

  /**
   * Load media with error handling
   */
  loadMedia(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.fetchMedia().pipe(
      catchError(err => {
        console.error('Load media error:', err);
        this.error.set(err.error?.message || this.i18n.t('media.failedLoadMedia'));
        return of({ media: [], totalCount: 0, page: 1, pageSize: this.pageSize(), totalPages: 0 });
      }),
      finalize(() => this.isLoading.set(false)),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.media.set(result.media);
      this.totalCount.set(result.totalCount);
      this.preloadSignedUrls(result.media.slice(0, 12));
    });
  }

  /**
   * Preload signed URLs for first N media items
   */
  private preloadSignedUrls(items: MediaItem[]): void {
    items.forEach(item => {
      if (!this.signedUrls().has(item.id)) {
        this.loadSignedUrl(item.id);
      }
    });
  }

  /**
   * Load signed URL for a media item with error handling and retry
   */
  loadSignedUrl(mediaId: string): void {
    // Skip if already loading
    if (this.signedUrlLoading().get(mediaId)) return;

    // Update loading state
    const loadingMap = new Map(this.signedUrlLoading());
    loadingMap.set(mediaId, true);
    this.signedUrlLoading.set(loadingMap);

    // Clear previous error
    const errorMap = new Map(this.signedUrlErrors());
    errorMap.delete(mediaId);
    this.signedUrlErrors.set(errorMap);

    this.mediaService.getSignedUrl(mediaId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (cached) => {
        const urlMap = new Map(this.signedUrls());
        urlMap.set(mediaId, cached);
        this.signedUrls.set(urlMap);

        // Clear loading state
        const loadingMap = new Map(this.signedUrlLoading());
        loadingMap.delete(mediaId);
        this.signedUrlLoading.set(loadingMap);
      },
      error: (err) => {
        console.error(`Failed to load signed URL for ${mediaId}:`, err);

        // Set error state
        const errorMap = new Map(this.signedUrlErrors());
        errorMap.set(mediaId, err.error?.message || this.i18n.t('media.failedLoadMedia'));
        this.signedUrlErrors.set(errorMap);

        // Clear loading state
        const loadingMap = new Map(this.signedUrlLoading());
        loadingMap.delete(mediaId);
        this.signedUrlLoading.set(loadingMap);
      }
    });
  }

  /**
   * Retry loading signed URL after error
   */
  retrySignedUrl(mediaId: string): void {
    this.mediaService.invalidateCache(mediaId);
    this.loadSignedUrl(mediaId);
  }

  /**
   * Get signed URL for display, with expiry check
   */
  getMediaUrl(mediaId: string): string | null {
    const cached = this.signedUrls().get(mediaId);
    if (!cached) return null;

    // Check if URL is expired or about to expire
    const now = Date.now();
    const expiresAt = cached.expiresAt.getTime();
    const bufferMs = 60 * 1000; // 1 minute buffer

    if ((expiresAt - now) < bufferMs) {
      // URL is expired or about to expire, trigger refresh
      this.retrySignedUrl(mediaId);
      return null;
    }

    return cached.url;
  }

  /**
   * Check if signed URL is loading for a media item
   */
  isSignedUrlLoading(mediaId: string): boolean {
    return this.signedUrlLoading().get(mediaId) ?? false;
  }

  /**
   * Check if signed URL has error for a media item
   */
  hasSignedUrlError(mediaId: string): boolean {
    return this.signedUrlErrors().has(mediaId);
  }

  // Event handlers
  onKindFilterChange(kind: MediaKind | null): void {
    this.kindFilter.set(kind);
    this.page.set(1);
    this.loadMedia();
  }

  onPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadMedia();
  }

  onViewModeChange(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.kindFilter.set(null);
    this.page.set(1);
    this.loadMedia();
  }

  // Lightbox
  openLightbox(item: MediaItem): void {
    this.lightboxMedia.set(item);

    // Get or load signed URL for lightbox
    const cached = this.signedUrls().get(item.id);
    if (cached && this.getMediaUrl(item.id)) {
      this.lightboxSignedUrl.set(cached.url);
    } else {
      this.lightboxSignedUrl.set(null);
      this.loadSignedUrlForLightbox(item.id);
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  private loadSignedUrlForLightbox(mediaId: string): void {
    this.mediaService.getSignedUrl(mediaId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (cached) => {
        // Only update if this is still the active lightbox media
        if (this.lightboxMedia()?.id === mediaId) {
          this.lightboxSignedUrl.set(cached.url);
        }

        // Also update the cache
        const urlMap = new Map(this.signedUrls());
        urlMap.set(mediaId, cached);
        this.signedUrls.set(urlMap);
      },
      error: (err) => {
        console.error(`Failed to load signed URL for lightbox:`, err);
        this.snackBar.open(
          this.i18n.t('media.failedLoadMedia'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  closeLightbox(): void {
    this.lightboxMedia.set(null);
    this.lightboxSignedUrl.set(null);
    document.body.style.overflow = '';
  }

  onLightboxBackdropClick(event: MouseEvent): void {
    // Close only if clicking the backdrop, not the content
    if ((event.target as HTMLElement).classList.contains('media-lightbox')) {
      this.closeLightbox();
    }
  }

  onLightboxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeLightbox();
    }
  }

  // Hover preload (throttled)
  private hoverPreloadQueue = new Set<string>();
  private hoverPreloadTimeout: any = null;

  onMediaHover(mediaId: string): void {
    // Skip if already loaded or loading
    if (this.signedUrls().has(mediaId) || this.signedUrlLoading().get(mediaId)) {
      return;
    }

    // Add to queue and process with throttling
    this.hoverPreloadQueue.add(mediaId);

    if (!this.hoverPreloadTimeout) {
      this.hoverPreloadTimeout = setTimeout(() => {
        // Process max 3 items from queue
        const items = Array.from(this.hoverPreloadQueue).slice(0, 3);
        items.forEach(id => {
          this.loadSignedUrl(id);
          this.hoverPreloadQueue.delete(id);
        });
        this.hoverPreloadTimeout = null;
      }, 100);
    }
  }

  // Display helpers
  formatFileSize(bytes: number): string {
    return this.mediaService.formatFileSize(bytes);
  }

  getKindIcon(kind: MediaKind): string {
    switch (kind) {
      case 'Image': return 'image';
      case 'Audio': return 'audiotrack';
      case 'Video': return 'videocam';
      case 'Document': return 'description';
      default: return 'insert_drive_file';
    }
  }

  getKindLabel(kind: MediaKind | null): string {
    if (!kind) return this.i18n.t('common.all');
    switch (kind) {
      case 'Image': return this.i18n.t('media.images');
      case 'Audio': return this.i18n.t('media.audio');
      case 'Video': return this.i18n.t('media.videos');
      default: return kind;
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString();
  }
}
```

#### 3.2 Component Template with Error States
**File:** `frontend/src/app/features/media/media-gallery.component.html`

```html
<div class="media-gallery">
  <!-- Header -->
  <div class="media-gallery__header">
    <div class="media-gallery__title">
      <h1>{{ 'media.gallery' | translate }}</h1>
      <span class="media-gallery__count" *ngIf="totalCount() > 0">
        {{ totalCount() }} {{ 'media.items' | translate }}
      </span>
    </div>

    <div class="media-gallery__actions">
      <mat-button-toggle-group [value]="viewMode()" (change)="onViewModeChange($event.value)">
        <mat-button-toggle value="grid">
          <mat-icon>grid_view</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="list">
          <mat-icon>view_list</mat-icon>
        </mat-button-toggle>
      </mat-button-toggle-group>
    </div>
  </div>

  <!-- Filters -->
  <div class="media-gallery__filters">
    <mat-form-field appearance="outline" class="media-gallery__search">
      <mat-label>{{ 'common.search' | translate }}</mat-label>
      <input matInput [formControl]="searchControl" />
      <mat-icon matSuffix>search</mat-icon>
    </mat-form-field>

    <mat-form-field appearance="outline" class="media-gallery__kind-filter">
      <mat-label>{{ 'media.type' | translate }}</mat-label>
      <mat-select [value]="kindFilter()" (selectionChange)="onKindFilterChange($event.value)">
        <mat-option [value]="null">{{ 'common.all' | translate }}</mat-option>
        <mat-option value="Image">{{ 'media.images' | translate }}</mat-option>
        <mat-option value="Audio">{{ 'media.audio' | translate }}</mat-option>
        <mat-option value="Video">{{ 'media.videos' | translate }}</mat-option>
      </mat-select>
    </mat-form-field>

    <button mat-stroked-button (click)="clearFilters()"
            *ngIf="searchControl.value || kindFilter()">
      <mat-icon>clear</mat-icon>
      {{ 'common.clear' | translate }}
    </button>
  </div>

  <!-- Loading State -->
  <div class="media-gallery__loading" *ngIf="isLoading()">
    <mat-spinner diameter="40"></mat-spinner>
    <span>{{ 'common.loading' | translate }}</span>
  </div>

  <!-- Error State -->
  <div class="media-gallery__error" *ngIf="error() && !isLoading()">
    <mat-icon color="warn">error_outline</mat-icon>
    <p>{{ error() }}</p>
    <button mat-raised-button color="primary" (click)="loadMedia()">
      <mat-icon>refresh</mat-icon>
      {{ 'common.retry' | translate }}
    </button>
  </div>

  <!-- Empty State -->
  <div class="media-gallery__empty" *ngIf="!isLoading() && !error() && !hasMedia()">
    <mat-icon>perm_media</mat-icon>
    <h3>{{ 'media.noMedia' | translate }}</h3>
    <p>{{ 'media.noMediaDesc' | translate }}</p>
  </div>

  <!-- Grid View -->
  <div class="media-gallery__grid" *ngIf="!isLoading() && !error() && hasMedia() && viewMode() === 'grid'">
    <div class="media-card"
         *ngFor="let item of media()"
         (click)="openLightbox(item)"
         (mouseenter)="onMediaHover(item.id)"
         tabindex="0"
         role="button"
         [attr.aria-label]="item.title || item.fileName">

      <!-- Image/Video Thumbnail -->
      <div class="media-card__preview" *ngIf="item.kind === 'Image' || item.kind === 'Video'">
        <!-- Loading spinner -->
        <mat-spinner diameter="24" *ngIf="isSignedUrlLoading(item.id)"></mat-spinner>

        <!-- Error state with retry -->
        <div class="media-card__error" *ngIf="hasSignedUrlError(item.id) && !isSignedUrlLoading(item.id)">
          <mat-icon>broken_image</mat-icon>
          <button mat-icon-button (click)="retrySignedUrl(item.id); $event.stopPropagation()">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>

        <!-- Image -->
        <img *ngIf="getMediaUrl(item.id) && item.kind === 'Image'"
             [src]="getMediaUrl(item.id)"
             [alt]="item.title || item.fileName"
             loading="lazy"
             (error)="retrySignedUrl(item.id)" />

        <!-- Video thumbnail -->
        <div class="media-card__video-thumb" *ngIf="getMediaUrl(item.id) && item.kind === 'Video'">
          <mat-icon>play_circle_outline</mat-icon>
        </div>
      </div>

      <!-- Audio/Document Icon -->
      <div class="media-card__icon" *ngIf="item.kind === 'Audio' || item.kind === 'Document'">
        <mat-icon>{{ getKindIcon(item.kind) }}</mat-icon>
      </div>

      <!-- Card Footer -->
      <div class="media-card__footer">
        <span class="media-card__title">{{ item.title || item.fileName }}</span>
        <div class="media-card__meta">
          <span class="media-card__size">{{ formatFileSize(item.fileSize) }}</span>
          <span class="media-card__kind">
            <mat-icon>{{ getKindIcon(item.kind) }}</mat-icon>
          </span>
        </div>
      </div>

      <!-- Linked Persons Badge -->
      <div class="media-card__persons" *ngIf="item.linkedPersons.length > 0">
        <mat-icon>people</mat-icon>
        <span>{{ item.linkedPersons.length }}</span>
      </div>
    </div>
  </div>

  <!-- List View -->
  <div class="media-gallery__list" *ngIf="!isLoading() && !error() && hasMedia() && viewMode() === 'list'">
    <div class="media-list-item"
         *ngFor="let item of media()"
         (click)="openLightbox(item)"
         (mouseenter)="onMediaHover(item.id)">

      <div class="media-list-item__icon">
        <mat-icon>{{ getKindIcon(item.kind) }}</mat-icon>
      </div>

      <div class="media-list-item__info">
        <span class="media-list-item__title">{{ item.title || item.fileName }}</span>
        <span class="media-list-item__meta">
          {{ formatFileSize(item.fileSize) }} &bull; {{ formatDate(item.createdAt) }}
        </span>
      </div>

      <div class="media-list-item__persons" *ngIf="item.linkedPersons.length > 0">
        <mat-icon>people</mat-icon>
        <span>{{ item.linkedPersons.length }}</span>
      </div>
    </div>
  </div>

  <!-- Paginator -->
  <mat-paginator *ngIf="totalCount() > 0"
                 [length]="totalCount()"
                 [pageIndex]="page() - 1"
                 [pageSize]="pageSize()"
                 [pageSizeOptions]="pageSizeOptions"
                 (page)="onPageChange($event)"
                 showFirstLastButtons>
  </mat-paginator>
</div>

<!-- Lightbox -->
<div class="media-lightbox"
     *ngIf="lightboxMedia()"
     (click)="onLightboxBackdropClick($event)"
     (keydown)="onLightboxKeydown($event)"
     tabindex="0"
     role="dialog"
     aria-modal="true">

  <button class="media-lightbox__close" mat-icon-button (click)="closeLightbox()">
    <mat-icon>close</mat-icon>
  </button>

  <div class="media-lightbox__content">
    <!-- Loading -->
    <mat-spinner *ngIf="!lightboxSignedUrl()" diameter="48"></mat-spinner>

    <!-- Image -->
    <img *ngIf="lightboxSignedUrl() && lightboxMedia()?.kind === 'Image'"
         [src]="lightboxSignedUrl()"
         [alt]="lightboxMedia()?.title || lightboxMedia()?.fileName" />

    <!-- Video -->
    <video *ngIf="lightboxSignedUrl() && lightboxMedia()?.kind === 'Video'"
           [src]="lightboxSignedUrl()"
           controls
           autoplay>
      {{ 'media.browserNoVideo' | translate }}
    </video>

    <!-- Audio -->
    <div class="media-lightbox__audio" *ngIf="lightboxSignedUrl() && lightboxMedia()?.kind === 'Audio'">
      <mat-icon>audiotrack</mat-icon>
      <audio [src]="lightboxSignedUrl()" controls autoplay>
        {{ 'media.browserNoAudio' | translate }}
      </audio>
    </div>
  </div>

  <!-- Details Panel -->
  <div class="media-lightbox__details" *ngIf="lightboxMedia()">
    <h3>{{ lightboxMedia()?.title || lightboxMedia()?.fileName }}</h3>

    <p *ngIf="lightboxMedia()?.description">{{ lightboxMedia()?.description }}</p>

    <div class="media-lightbox__meta">
      <div *ngIf="lightboxMedia()?.captureDate">
        <strong>{{ 'media.captureDate' | translate }}:</strong>
        {{ formatDate(lightboxMedia()?.captureDate) }}
      </div>
      <div *ngIf="lightboxMedia()?.placeName">
        <strong>{{ 'media.location' | translate }}:</strong>
        {{ lightboxMedia()?.placeName }}
      </div>
      <div>
        <strong>{{ 'media.size' | translate }}:</strong>
        {{ formatFileSize(lightboxMedia()?.fileSize || 0) }}
      </div>
    </div>

    <!-- Linked Persons -->
    <div class="media-lightbox__persons" *ngIf="lightboxMedia()?.linkedPersons?.length">
      <h4>{{ 'media.taggedPeople' | translate }}</h4>
      <div class="media-lightbox__person-list">
        <a *ngFor="let person of lightboxMedia()?.linkedPersons"
           [routerLink]="['/people', person.personId]"
           class="media-lightbox__person"
           (click)="closeLightbox()">
          {{ person.personName || 'Unknown' }}
          <span *ngIf="person.isPrimary" class="media-lightbox__primary-badge">
            {{ 'media.primary' | translate }}
          </span>
        </a>
      </div>
    </div>
  </div>
</div>
```

#### 3.3 Component Styles
**File:** `frontend/src/app/features/media/media-gallery.component.scss`

```scss
.media-gallery {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  &__title {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;

    h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 500;
    }
  }

  &__count {
    color: var(--text-secondary, #666);
    font-size: 0.875rem;
  }

  &__filters {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  &__search {
    flex: 1;
    min-width: 200px;
    max-width: 400px;
  }

  &__kind-filter {
    min-width: 150px;
  }

  &__loading,
  &__error,
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    color: var(--text-secondary, #666);

    mat-icon {
      font-size: 4rem;
      width: 4rem;
      height: 4rem;
      margin-bottom: 1rem;
    }

    h3 {
      margin: 0 0 0.5rem;
      font-weight: 500;
    }

    p {
      margin: 0 0 1rem;
    }
  }

  &__error {
    mat-icon {
      color: var(--warn-color, #f44336);
    }
  }

  // Grid View
  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  // List View
  &__list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
}

// Media Card (Grid)
.media-card {
  position: relative;
  background: var(--card-background, #fff);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover,
  &:focus {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    outline: none;
  }

  &__preview {
    aspect-ratio: 1;
    background: var(--background-secondary, #f5f5f5);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary, #999);

    mat-icon {
      font-size: 2rem;
      width: 2rem;
      height: 2rem;
    }
  }

  &__video-thumb {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-tertiary, #e0e0e0);

    mat-icon {
      font-size: 3rem;
      width: 3rem;
      height: 3rem;
      color: var(--text-secondary, #666);
    }
  }

  &__icon {
    aspect-ratio: 1;
    background: var(--background-secondary, #f5f5f5);
    display: flex;
    align-items: center;
    justify-content: center;

    mat-icon {
      font-size: 3rem;
      width: 3rem;
      height: 3rem;
      color: var(--text-secondary, #666);
    }
  }

  &__footer {
    padding: 0.75rem;
  }

  &__title {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 0.25rem;
  }

  &__meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--text-secondary, #666);

    mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
  }

  &__persons {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;

    mat-icon {
      font-size: 0.875rem;
      width: 0.875rem;
      height: 0.875rem;
    }
  }
}

// Media List Item
.media-list-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--card-background, #fff);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: var(--background-hover, #f5f5f5);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--background-secondary, #f0f0f0);
    border-radius: 8px;

    mat-icon {
      color: var(--text-secondary, #666);
    }
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__title {
    display: block;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__meta {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
  }

  &__persons {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-secondary, #666);
    font-size: 0.875rem;

    mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
  }
}

// Lightbox
.media-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;

  &__close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    color: #fff;
    z-index: 1001;
  }

  &__content {
    max-width: 80vw;
    max-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }

    video {
      max-width: 100%;
      max-height: 70vh;
    }
  }

  &__audio {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: #fff;

    mat-icon {
      font-size: 4rem;
      width: 4rem;
      height: 4rem;
    }

    audio {
      width: 300px;
    }
  }

  &__details {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 1.5rem;
    max-height: 30vh;
    overflow-y: auto;

    h3 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    p {
      margin: 0 0 1rem;
      color: rgba(255, 255, 255, 0.8);
    }
  }

  &__meta {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    font-size: 0.875rem;

    strong {
      color: rgba(255, 255, 255, 0.7);
    }
  }

  &__persons {
    h4 {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.7);
    }
  }

  &__person-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  &__person {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #fff;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background-color 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  &__primary-badge {
    background: var(--primary-color, #3f51b5);
    padding: 0.125rem 0.375rem;
    border-radius: 2px;
    font-size: 0.625rem;
    text-transform: uppercase;
  }
}

// Responsive
@media (max-width: 768px) {
  .media-gallery {
    padding: 1rem;

    &__header {
      flex-direction: column;
      align-items: flex-start;
    }

    &__filters {
      flex-direction: column;
    }

    &__search {
      max-width: none;
    }

    &__grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }

  .media-lightbox {
    padding: 1rem;

    &__content {
      max-width: 95vw;
      max-height: 60vh;
    }

    &__details {
      padding: 1rem;
    }

    &__meta {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
}
```

---

### Phase 4: Translations (All Languages)

#### 4.1 Update en.json
**File:** `frontend/src/assets/i18n/en.json`

Add/update under `"media"`:
```json
"media": {
  "title": "Media",
  "gallery": "Media Gallery",
  "items": "items",
  "type": "Type",
  "size": "Size",
  "images": "Images",
  "audio": "Audio",
  "videos": "Videos",
  "noMedia": "No Media Found",
  "noMediaDesc": "There are no media files matching your criteria.",
  "taggedPeople": "Tagged People",
  "captureDate": "Capture Date",
  "location": "Location",
  "primary": "Primary",
  "failedLoadMedia": "Failed to load media",
  "browserNoAudio": "Your browser does not support the audio element.",
  "browserNoVideo": "Your browser does not support the video element."
}
```

#### 4.2 Update ar.json
**File:** `frontend/src/assets/i18n/ar.json`

Add/update under `"media"`:
```json
"media": {
  "title": "الوسائط",
  "gallery": "معرض الوسائط",
  "items": "عناصر",
  "type": "النوع",
  "size": "الحجم",
  "images": "الصور",
  "audio": "الصوت",
  "videos": "الفيديو",
  "noMedia": "لا توجد وسائط",
  "noMediaDesc": "لا توجد ملفات وسائط تطابق معاييرك.",
  "taggedPeople": "الأشخاص المذكورين",
  "captureDate": "تاريخ الالتقاط",
  "location": "الموقع",
  "primary": "رئيسي",
  "failedLoadMedia": "فشل تحميل الوسائط",
  "browserNoAudio": "متصفحك لا يدعم عنصر الصوت.",
  "browserNoVideo": "متصفحك لا يدعم عنصر الفيديو."
}
```

#### 4.3 Update nob.json
**File:** `frontend/src/assets/i18n/nob.json`

Add/update under `"media"`:
```json
"media": {
  "title": "Medya",
  "gallery": "Medya Galeri",
  "items": "sunuddi",
  "type": "Noog",
  "size": "Kadda",
  "images": "Suwerri",
  "audio": "Dowi",
  "videos": "Vidyo",
  "noMedia": "Medya Yoki",
  "noMediaDesc": "Medya sunuddi in gawe yoki.",
  "taggedPeople": "Addemmi Taggedti",
  "captureDate": "Usbu Capture",
  "location": "Makan",
  "primary": "Essassi",
  "failedLoadMedia": "Medya load fayilti",
  "browserNoAudio": "Browser inka dowi yegbilki.",
  "browserNoVideo": "Browser inka vidyo yegbilki."
}
```

---

## Files Summary

### New Files (4)
| File | Description |
|------|-------------|
| `frontend/src/app/core/models/media.models.ts` | MediaItem, MediaSearchParams, MediaSearchResult, CachedSignedUrl |
| `frontend/src/app/core/services/media.service.ts` | Organization-wide media service with signed URL caching |
| `frontend/src/app/features/media/media-gallery.component.scss` | Gallery styles |
| `MEDIA_GALLERY_PLAN_FIXED.md` | This plan document |

### Modified Files (6)
| File | Changes |
|------|---------|
| `backend/FamilyTreeApi/DTOs/MediaDTOs.cs` | Add LinkedPersons to MediaResponse |
| `backend/FamilyTreeApi/Services/MediaManagementService.cs` | Use projection for LinkedPersons, add page size validation |
| `frontend/src/app/features/media/media-gallery.component.ts` | Full implementation with error handling |
| `frontend/src/app/features/media/media-gallery.component.html` | Full template with error states |
| `frontend/src/assets/i18n/en.json` | Add media gallery translations |
| `frontend/src/assets/i18n/ar.json` | Add Arabic translations |
| `frontend/src/assets/i18n/nob.json` | Add Nobiin translations |

---

## Audit Fixes Applied

### 1. N+1 Query Pattern (CRITICAL) ✅ FIXED
**Original Risk:** Using `.Include()` before pagination would load all linked persons into memory.

**Fix:** Use inline projection within `.Select()`:
- Pagination (`Skip/Take`) executes at database level FIRST
- LinkedPersons projected inline - EF Core generates efficient JOIN
- No cartesian explosion - only linked persons for the paginated results are loaded

### 2. Authorization Verification ✅ DOCUMENTED
**Original Risk:** Authorization on `GET /api/media` not verified.

**Verification:** Authorization is enforced at multiple levels:
1. `[Authorize]` attribute on controller
2. `userContext.OrgId == null` check in service
3. `Where(m => m.OrgId == orgId)` filter on all queries

**No cross-tenant data access is possible.**

### 3. Signed URL Expiry Handling ✅ FIXED
**Original Risk:** Cached signed URLs could expire, causing 403 errors with no recovery.

**Fix:**
- `CachedSignedUrl` interface includes `expiresAt` timestamp
- `isUrlValid()` checks expiry with 5-minute buffer
- `getMediaUrl()` returns null and triggers refresh if expired
- Image `onerror` handler triggers retry
- Manual retry button on error state

### 4. Request Cancellation ✅ FIXED
**Original Risk:** Race condition between search and pagination requests.

**Fix:**
- `switchMap` in search pipeline cancels previous in-flight requests
- New search term automatically cancels previous search
- Filter changes reset page and trigger new search

### 5. Error Handling ✅ FIXED
**Original Risk:** Missing error handling for HTTP failures.

**Fix:**
- `error` signal for search/load errors
- `signedUrlErrors` map for per-item URL errors
- `catchError` in all HTTP pipelines
- Error UI with retry button
- Per-image error state with retry

### 6. Page Size Validation ✅ FIXED
**Original Risk:** Client could request unlimited page size.

**Fix:** Backend validation in `SearchMediaAsync`:
- Max page size capped at 100
- Invalid values normalized to defaults

### 7. Arabic/Nobiin Translations ✅ FIXED
**Original Risk:** Only English translations planned.

**Fix:** Full translations added for:
- `en.json` (English)
- `ar.json` (Arabic)
- `nob.json` (Nobiin)

### 8. LinkedPersons Null Safety ✅ FIXED
**Original Risk:** Orphaned PersonMedia records could produce null names.

**Fix:** Null-safe projection with fallback chain:
```csharp
pl.Person != null
    ? (pl.Person.PrimaryName ?? pl.Person.NameEnglish ?? pl.Person.NameArabic ?? "Unknown")
    : "Unknown"
```

### 9. Hover Preload Throttling ✅ FIXED
**Original Risk:** Rapid hover could trigger unlimited concurrent requests.

**Fix:**
- `hoverPreloadQueue` buffers hover requests
- Timeout processes max 3 items per 100ms
- Prevents connection pool exhaustion

### 10. Lightbox Accessibility ✅ FIXED
**Original Risk:** Missing keyboard navigation and focus management.

**Fix:**
- `tabindex="0"` for keyboard focus
- `role="dialog"` and `aria-modal="true"`
- Escape key closes lightbox
- Click-outside-to-close
- Body scroll lock

---

## Implementation Order

1. **Backend:** Add LinkedPersons to MediaResponse DTO
2. **Backend:** Update SearchMediaAsync with projection and page size validation
3. **Frontend:** Create media.models.ts
4. **Frontend:** Create media.service.ts with caching
5. **Frontend:** Implement media-gallery component (ts, html, scss)
6. **Frontend:** Add all translations (en, ar, nob)
7. **Test:** Verify pagination, filtering, error handling, signed URL refresh

---

## Assumptions (Documented)

1. **Signed URL expiry default is 1 hour (3600 seconds)** - Configured in backend
2. **PersonMedia cascade delete is NOT guaranteed** - Code handles orphaned records with "Unknown" fallback
3. **Video/Audio files are browser-playable formats** - No server-side transcoding
4. **Visibility field values:** 0=Public, 1=FamilyOnly, 2=Private, 3=InitialsOnly - Not filtered client-side (backend enforces)
