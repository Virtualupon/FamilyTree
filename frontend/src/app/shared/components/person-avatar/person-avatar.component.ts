import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PersonService } from '../../../core/services/person.service';
import type { Person, PersonListItem } from '../../../core/models/person.models';

const MAX_AVATAR_SIZE_MB = 5;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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
  template: `
    <div class="avatar-container" [class]="size">
      <!-- Avatar Image or Initials -->
      <div class="avatar" [class.has-image]="avatarUrl">
        @if (avatarUrl) {
          <img [src]="avatarUrl" [alt]="displayName" (error)="onImageError()">
        } @else {
          <span class="initials">{{ initials }}</span>
        }

        <!-- Loading Overlay -->
        @if (uploading) {
          <div class="loading-overlay">
            <mat-spinner [diameter]="spinnerSize"></mat-spinner>
          </div>
        }
      </div>

      <!-- Edit Controls -->
      @if (editable && !uploading) {
        <div class="avatar-controls">
          <input
            type="file"
            #fileInput
            [accept]="acceptTypes"
            (change)="onFileSelected($event)"
            hidden>

          <button
            mat-icon-button
            (click)="fileInput.click()"
            [matTooltip]="avatarUrl ? 'Change photo' : 'Add photo'"
            class="control-btn">
            <mat-icon>{{ avatarUrl ? 'edit' : 'add_a_photo' }}</mat-icon>
          </button>

          @if (avatarUrl) {
            <button
              mat-icon-button
              (click)="removeAvatar()"
              matTooltip="Remove photo"
              class="control-btn control-btn--delete">
              <mat-icon>delete</mat-icon>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .avatar-container {
      position: relative;
      display: inline-block;

      &.small .avatar {
        width: 32px;
        height: 32px;
        font-size: 12px;
      }

      &.medium .avatar {
        width: 64px;
        height: 64px;
        font-size: 20px;
      }

      &.large .avatar {
        width: 120px;
        height: 120px;
        font-size: 36px;
      }

      &.xlarge .avatar {
        width: 160px;
        height: 160px;
        font-size: 48px;
      }
    }

    .avatar {
      border-radius: 50%;
      background-color: var(--ft-surface-variant, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      border: 2px solid var(--ft-outline-variant, #ccc);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .initials {
        color: var(--ft-on-surface-variant, #666);
        font-weight: 500;
        text-transform: uppercase;
      }

      .loading-overlay {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
      }
    }

    .avatar-controls {
      position: absolute;
      bottom: -4px;
      right: -4px;
      display: flex;
      gap: 2px;

      .control-btn {
        width: 28px;
        height: 28px;
        line-height: 28px;
        background: var(--ft-surface, white);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          line-height: 16px;
        }

        &--delete {
          color: var(--ft-error, #d32f2f);
        }
      }
    }
  `]
})
export class PersonAvatarComponent {
  private personService = inject(PersonService);
  private snackBar = inject(MatSnackBar);

  @Input() person: Person | PersonListItem | null = null;
  @Input() size: 'small' | 'medium' | 'large' | 'xlarge' = 'medium';
  @Input() editable = false;

  @Output() avatarChanged = new EventEmitter<void>();

  uploading = false;
  imageError = false;

  readonly acceptTypes = ALLOWED_AVATAR_TYPES.join(',');

  get avatarUrl(): string | null {
    if (this.imageError) return null;
    return this.person?.avatarUrl || null;
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
    if (parts.length === 1) {
      return parts[0].substring(0, 2);
    }
    return (parts[0][0] + parts[parts.length - 1][0]);
  }

  get spinnerSize(): number {
    switch (this.size) {
      case 'small': return 16;
      case 'medium': return 24;
      case 'large': return 32;
      case 'xlarge': return 40;
      default: return 24;
    }
  }

  onImageError(): void {
    this.imageError = true;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.person) return;

    const file = input.files[0];

    // Validate file type
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      this.snackBar.open('Please select an image file (JPEG, PNG, GIF, or WebP)', 'Close', {
        duration: 4000
      });
      input.value = '';
      return;
    }

    // Validate file size
    const maxBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      this.snackBar.open(`Image must be less than ${MAX_AVATAR_SIZE_MB}MB`, 'Close', {
        duration: 4000
      });
      input.value = '';
      return;
    }

    this.uploading = true;
    this.personService.uploadAvatar(this.person.id, file).subscribe({
      next: (avatar) => {
        this.uploading = false;
        this.imageError = false;
        // Update person object with new avatar URL
        if (this.person) {
          (this.person as any).avatarUrl = avatar.url || avatar.thumbnailPath;
          (this.person as any).avatarMediaId = avatar.mediaId;
        }
        this.avatarChanged.emit();
        this.snackBar.open('Avatar updated', 'Close', { duration: 2000 });
      },
      error: (err) => {
        this.uploading = false;
        console.error('Avatar upload failed:', err);
        this.snackBar.open('Failed to upload avatar', 'Close', { duration: 4000 });
      }
    });

    // Clear input for re-selection of same file
    input.value = '';
  }

  removeAvatar(): void {
    if (!this.person) return;

    this.uploading = true;
    this.personService.deleteAvatar(this.person.id).subscribe({
      next: () => {
        this.uploading = false;
        // Clear avatar from person object
        if (this.person) {
          (this.person as any).avatarUrl = null;
          (this.person as any).avatarMediaId = null;
        }
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
