import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { TranslatePipe } from '../../../core/i18n';
import { CarouselImage } from '../../../core/services/carousel-image.service';

export interface CarouselImageDialogData {
  mode: 'create' | 'edit';
  image?: CarouselImage;
}

export interface CarouselImageDialogResult {
  imageUrl: string;
  title?: string;
  description?: string;
  isActive: boolean;
}

@Component({
  selector: 'app-carousel-image-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslatePipe
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ data.mode === 'create' ? 'add_photo_alternate' : 'edit' }}</mat-icon>
      {{ data.mode === 'create'
        ? ('admin.carouselImages.addTitle' | translate)
        : ('admin.carouselImages.editTitle' | translate)
      }}
    </h2>

    <mat-dialog-content>
      <!-- Image URL -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'admin.carouselImages.imageUrl' | translate }}</mat-label>
        <input matInput [(ngModel)]="formData.imageUrl" required placeholder="https://..." />
        <mat-icon matPrefix>link</mat-icon>
        <mat-hint>{{ 'admin.carouselImages.imageUrlHint' | translate }}</mat-hint>
      </mat-form-field>

      <!-- Preview -->
      @if (formData.imageUrl && isValidUrl()) {
        <div class="image-preview">
          <img [src]="formData.imageUrl" alt="Preview" (error)="onImageError()" />
          @if (imageError()) {
            <div class="preview-error">
              <mat-icon>broken_image</mat-icon>
              <span>{{ 'admin.carouselImages.invalidImage' | translate }}</span>
            </div>
          }
        </div>
      }

      <!-- Title -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'admin.carouselImages.imageTitle' | translate }}</mat-label>
        <input matInput [(ngModel)]="formData.title" maxlength="200" />
        <mat-icon matPrefix>title</mat-icon>
        <mat-hint>{{ 'admin.carouselImages.titleHint' | translate }}</mat-hint>
      </mat-form-field>

      <!-- Description -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'admin.carouselImages.description' | translate }}</mat-label>
        <textarea matInput [(ngModel)]="formData.description" maxlength="500" rows="2"></textarea>
        <mat-icon matPrefix>description</mat-icon>
        <mat-hint>{{ 'admin.carouselImages.descriptionHint' | translate }}</mat-hint>
      </mat-form-field>

      <!-- Active Toggle -->
      <div class="toggle-row">
        <mat-slide-toggle [(ngModel)]="formData.isActive">
          {{ 'admin.carouselImages.isActive' | translate }}
        </mat-slide-toggle>
        <span class="toggle-hint">{{ 'admin.carouselImages.isActiveHint' | translate }}</span>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!isValid()"
        (click)="save()"
      >
        {{ data.mode === 'create' ? ('common.add' | translate) : ('common.save' | translate) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    @use 'nubian-variables' as *;

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: $spacing-sm;

      mat-icon {
        color: $nubian-teal;
      }
    }

    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: $spacing-md;
      min-width: 400px;
    }

    .full-width {
      width: 100%;
    }

    .image-preview {
      width: 100%;
      height: 150px;
      border-radius: $radius-md;
      overflow: hidden;
      background: $nubian-beige;
      position: relative;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .preview-error {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba($nubian-charcoal, 0.8);
        color: white;

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          margin-bottom: $spacing-xs;
        }
      }
    }

    .toggle-row {
      display: flex;
      flex-direction: column;
      gap: $spacing-xs;
      padding: $spacing-sm 0;

      .toggle-hint {
        font-size: $font-size-xs;
        color: $nubian-gray;
        margin-left: 52px;
      }
    }

    mat-dialog-actions {
      padding: $spacing-md $spacing-lg;
    }
  `]
})
export class CarouselImageDialogComponent {
  formData = {
    imageUrl: '',
    title: '',
    description: '',
    isActive: true
  };

  imageError = signal(false);

  constructor(
    public dialogRef: MatDialogRef<CarouselImageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CarouselImageDialogData
  ) {
    if (data.mode === 'edit' && data.image) {
      this.formData = {
        imageUrl: data.image.imageUrl,
        title: data.image.title || '',
        description: data.image.description || '',
        isActive: data.image.isActive
      };
    }
  }

  isValidUrl(): boolean {
    try {
      new URL(this.formData.imageUrl);
      return true;
    } catch {
      return false;
    }
  }

  isValid(): boolean {
    return this.formData.imageUrl.trim().length > 0 && this.isValidUrl() && !this.imageError();
  }

  onImageError(): void {
    this.imageError.set(true);
  }

  save(): void {
    if (!this.isValid()) return;

    const result: CarouselImageDialogResult = {
      imageUrl: this.formData.imageUrl.trim(),
      title: this.formData.title.trim() || undefined,
      description: this.formData.description.trim() || undefined,
      isActive: this.formData.isActive
    };

    this.dialogRef.close(result);
  }
}
