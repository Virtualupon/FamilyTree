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

  // Retry tracking for signed URLs (max 3 retries per media item)
  private readonly MAX_RETRY_COUNT = 3;
  private signedUrlRetryCount = new Map<string, number>();

  // Lightbox state
  lightboxMedia = signal<MediaItem | null>(null);
  lightboxSignedUrl = signal<string | null>(null);

  // Computed
  totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));
  hasMedia = computed(() => this.media().length > 0);

  // Page size options
  readonly pageSizeOptions = [12, 24, 48, 96];

  // Media kind options for filter
  readonly kindOptions: (MediaKind | null)[] = [null, 'Image', 'Audio', 'Video', 'Document'];

  // Hover preload throttling
  private hoverPreloadQueue = new Set<string>();
  private hoverPreloadTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.setupSearch();
    this.loadMedia();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Clean up signed URL cache
    this.mediaService.clearCache();
    // Clear hover timeout
    if (this.hoverPreloadTimeout) {
      clearTimeout(this.hoverPreloadTimeout);
    }
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
   * Load signed URL for a media item with error handling and retry limits
   */
  loadSignedUrl(mediaId: string): void {
    // Skip if already loading
    if (this.signedUrlLoading().get(mediaId)) return;

    // Check retry limit
    const retryCount = this.signedUrlRetryCount.get(mediaId) ?? 0;
    if (retryCount >= this.MAX_RETRY_COUNT) {
      console.warn(`Max retry count reached for media ${mediaId}`);
      return;
    }

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

        // Clear loading state and reset retry count on success
        const loadingMap = new Map(this.signedUrlLoading());
        loadingMap.delete(mediaId);
        this.signedUrlLoading.set(loadingMap);
        this.signedUrlRetryCount.delete(mediaId);
      },
      error: (err) => {
        console.error(`Failed to load signed URL for ${mediaId}:`, err);

        // Increment retry count
        this.signedUrlRetryCount.set(mediaId, retryCount + 1);

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
   * Retry loading signed URL after error (respects retry limits)
   */
  retrySignedUrl(mediaId: string): void {
    const retryCount = this.signedUrlRetryCount.get(mediaId) ?? 0;
    if (retryCount >= this.MAX_RETRY_COUNT) {
      // Max retries reached, show feedback
      this.snackBar.open(
        this.i18n.t('media.failedLoadMedia'),
        this.i18n.t('common.close'),
        { duration: 3000 }
      );
      return;
    }
    this.mediaService.invalidateCache(mediaId);
    this.loadSignedUrl(mediaId);
  }

  /**
   * Check if max retries reached for a media item
   */
  hasMaxRetriesReached(mediaId: string): boolean {
    return (this.signedUrlRetryCount.get(mediaId) ?? 0) >= this.MAX_RETRY_COUNT;
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
      case 'Document': return this.i18n.t('media.documents');
      default: return kind;
    }
  }

  /**
   * Check if media item is a document (PDF, etc.)
   */
  isDocument(item: MediaItem): boolean {
    return item.kind === 'Document';
  }

  /**
   * Open document in new tab for viewing/download
   */
  openDocument(item: MediaItem, url: string): void {
    window.open(url, '_blank');
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString();
  }
}
