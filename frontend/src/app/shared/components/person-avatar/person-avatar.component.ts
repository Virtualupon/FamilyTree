import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PersonService } from '../../../core/services/person.service';
import { PersonMediaService } from '../../../core/services/person-media.service';
import type { Person, PersonListItem } from '../../../core/models/person.models';
import type { SearchPersonItem } from '../../../core/models/search.models';

// Avatar upload constraints
const MAX_AVATAR_SIZE_MB = 2; // 2MB max upload size
const ALLOWED_AVATAR_TYPES = ['image/webp', 'image/jpeg', 'image/png'];
const MAX_AVATAR_DIMENSION = 512; // Store at 512x512 for high-DPI displays
const OUTPUT_QUALITY = 0.85; // WebP/JPEG quality (0-1)

// Lazy-evaluated WebP support detection (SSR-safe)
let webpSupported: boolean | null = null;
function supportsWebP(): boolean {
  if (webpSupported === null) {
    if (typeof document === 'undefined') {
      webpSupported = false;
    } else {
      webpSupported = document.createElement('canvas')
        .toDataURL('image/webp')
        .startsWith('data:image/webp');
    }
  }
  return webpSupported;
}

@Component({
  selector: 'app-person-avatar',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule
  ],
  templateUrl: './person-avatar.component.html',
  styleUrls: ['./person-avatar.component.scss']
})
export class PersonAvatarComponent implements OnChanges, OnDestroy {
  private personService = inject(PersonService);
  private mediaService = inject(PersonMediaService);
  private snackBar = inject(MatSnackBar);

  @Input() person: Person | PersonListItem | SearchPersonItem | null = null;
  @Input() size: 'small' | 'medium' | 'large' | 'xlarge' = 'medium';
  @Input() editable = false;

  @Output() avatarChanged = new EventEmitter<void>();

  uploading = false;
  displayUrl = signal<string | null>(null);
  isLoading = signal(false);

  private lastLoadedMediaId: string | null = null;

  readonly acceptTypes = ALLOWED_AVATAR_TYPES.join(',');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['person']) {
      this.loadAvatar();
    }
  }

  ngOnDestroy(): void {
    // No cleanup needed - browser manages signed URL cache
  }

  private loadAvatar(): void {
    const person = this.person as any;
    if (!person) {
      this.displayUrl.set(null);
      return;
    }

    const mediaId = person.avatarMediaId;

    // No avatar
    if (!mediaId) {
      this.displayUrl.set(null);
      this.lastLoadedMediaId = null;
      return;
    }

    // Already loaded this avatar
    if (mediaId === this.lastLoadedMediaId && this.displayUrl()) {
      return;
    }

    // Fetch signed URL for avatar - browser will cache the image
    this.isLoading.set(true);
    this.mediaService.getSignedUrl(mediaId).subscribe({
      next: (signedUrl) => {
        this.isLoading.set(false);
        this.lastLoadedMediaId = mediaId;
        // Use signed URL directly - browser handles caching via HTTP headers
        this.displayUrl.set(signedUrl.url);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.lastLoadedMediaId = mediaId;
        console.error('Failed to load avatar:', err);
      }
    });
  }

  get displayName(): string {
    if (!this.person) return '';
    return this.person.primaryName ||
           ('nameEnglish' in this.person ? this.person.nameEnglish : null) ||
           '';
  }

  get initials(): string {
    const name = this.displayName;
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2);
    return (parts[0][0] + parts[parts.length - 1][0]);
  }

  get spinnerSize(): number {
    const sizes: Record<string, number> = { small: 16, medium: 24, large: 32, xlarge: 40 };
    return sizes[this.size] || 24;
  }

  onImageError(): void {
    this.displayUrl.set(null);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.person) return;

    const file = input.files[0];

    // Validate file type
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      this.snackBar.open('Please select an image file (WebP, JPEG, PNG, or GIF)', 'Close', { duration: 4000 });
      input.value = '';
      return;
    }

    // Validate file size
    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      this.snackBar.open(`Image must be less than ${MAX_AVATAR_SIZE_MB}MB`, 'Close', { duration: 4000 });
      input.value = '';
      return;
    }

    this.uploading = true;

    try {
      // Resize and convert to WebP (with JPEG fallback)
      const { blob, base64, mimeType } = await this.resizeImage(file);
      const extension = mimeType === 'image/webp' ? '.webp' : '.jpg';
      const resizedFile = new File([blob], file.name.replace(/\.[^.]+$/, extension), { type: mimeType });

      // Prepare upload using existing Media system
      const payload = await this.mediaService.validateAndPrepareUpload(
        resizedFile,
        [this.person.id],
        'Avatar',
        undefined
      );

      // Upload media
      this.mediaService.uploadMedia(payload).subscribe({
        next: (media) => {
          // Update person's avatarMediaId
          this.personService.updatePerson(this.person!.id, {
            avatarMediaId: media.id
          }).subscribe({
            next: () => {
              this.uploading = false;
              (this.person as any).avatarMediaId = media.id;
              // Update display with resized base64 for immediate feedback
              this.displayUrl.set(base64);
              this.lastLoadedMediaId = media.id;
              this.avatarChanged.emit();
              this.snackBar.open('Avatar updated', 'Close', { duration: 2000 });
            },
            error: (err) => {
              this.uploading = false;
              console.error('Failed to set avatar:', err);
              this.snackBar.open('Failed to set avatar', 'Close', { duration: 4000 });
            }
          });
        },
        error: (err) => {
          this.uploading = false;
          console.error('Avatar upload failed:', err);
          this.snackBar.open('Failed to upload avatar', 'Close', { duration: 4000 });
        }
      });
    } catch (err) {
      this.uploading = false;
      console.error('Image resize/upload failed:', err);
      this.snackBar.open('Failed to process image', 'Close', { duration: 4000 });
    }

    input.value = '';
  }

  /**
   * Resize image to fit within MAX_AVATAR_DIMENSION while maintaining aspect ratio.
   * Outputs WebP format when browser supports it, otherwise falls back to JPEG.
   * Returns blob (for upload), base64 (for display), and mimeType.
   */
  private resizeImage(file: File): Promise<{ blob: Blob; base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_AVATAR_DIMENSION) / width);
            width = MAX_AVATAR_DIMENSION;
          } else {
            width = Math.round((width * MAX_AVATAR_DIMENSION) / height);
            height = MAX_AVATAR_DIMENSION;
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Use WebP if supported, otherwise JPEG
        const mimeType = supportsWebP() ? 'image/webp' : 'image/jpeg';

        // Convert to blob and base64
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }

            const base64 = canvas.toDataURL(mimeType, OUTPUT_QUALITY);
            resolve({ blob, base64, mimeType });
          },
          mimeType,
          OUTPUT_QUALITY
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));

      // Load image from file
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  removeAvatar(): void {
    if (!this.person) return;
    const oldMediaId = (this.person as any).avatarMediaId;

    this.uploading = true;

    // Clear avatarMediaId on person
    this.personService.updatePerson(this.person.id, {
      avatarMediaId: null
    }).subscribe({
      next: () => {
        // Optionally delete the media file
        if (oldMediaId) {
          this.mediaService.deleteMedia(oldMediaId).subscribe();
        }

        this.uploading = false;
        (this.person as any).avatarMediaId = null;
        this.displayUrl.set(null);
        this.lastLoadedMediaId = null;
        this.avatarChanged.emit();
        this.snackBar.open('Avatar removed', 'Close', { duration: 2000 });
      },
      error: (err) => {
        this.uploading = false;
        console.error('Avatar delete failed:', err);
        this.snackBar.open('Failed to remove avatar', 'Close', { duration: 4000 });
      }
    });
  }
}
