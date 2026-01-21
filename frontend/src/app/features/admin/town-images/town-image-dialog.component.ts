import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { TranslatePipe, I18nService } from '../../../core/i18n';
import { TownImageService } from '../../../core/services/town-image.service';
import { TownImageDto, UploadTownImageRequest, UpdateTownImageRequest } from '../../../core/models/town-image.models';

interface TownOption {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

export interface TownImageDialogData {
  mode: 'create' | 'edit';
  image?: TownImageDto;
  towns: TownOption[];
  preselectedTownId?: string | null;
}

export type TownImageDialogResult = UploadTownImageRequest | UpdateTownImageRequest;

@Component({
  selector: 'app-town-image-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatTabsModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    TranslatePipe
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.mode === 'create' ? ('admin.townImages.addTitle' | translate) : ('admin.townImages.editTitle' | translate) }}
    </h2>

    <mat-dialog-content>
      <!-- Town Selection (only for create) -->
      @if (data.mode === 'create') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'admin.townImages.selectTown' | translate }}</mat-label>
          <mat-select [(ngModel)]="formData.townId" required>
            @for (town of data.towns; track town.id) {
              <mat-option [value]="town.id">{{ getTownName(town) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <!-- File Upload (only for create) -->
      @if (data.mode === 'create') {
        <div class="file-upload-section">
          <input
            type="file"
            #fileInput
            (change)="onFileSelected($event)"
            accept="image/webp,image/jpeg,image/png"
            style="display: none"
          />

          @if (!selectedFile() && !imagePreview()) {
            <button mat-stroked-button type="button" (click)="fileInput.click()" class="upload-button">
              <mat-icon>cloud_upload</mat-icon>
              {{ 'admin.townImages.selectImage' | translate }}
            </button>
            <p class="upload-hint">{{ 'admin.townImages.uploadHint' | translate }}</p>
          }

          @if (imagePreview()) {
            <div class="image-preview">
              <img [src]="imagePreview()" alt="Preview" />
              <button mat-icon-button class="remove-btn" (click)="clearFile()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="file-info">
              <span class="file-name">{{ selectedFile()?.name }}</span>
              <span class="file-size">{{ formatFileSize(selectedFile()?.size || 0) }}</span>
            </div>
          }

          @if (uploadError()) {
            <div class="error-message">
              <mat-icon>error</mat-icon>
              {{ uploadError() }}
            </div>
          }
        </div>
      }

      <!-- Image Preview/Replace for edit mode -->
      @if (data.mode === 'edit' && data.image) {
        <div class="file-upload-section">
          <input
            type="file"
            #editFileInput
            (change)="onFileSelected($event)"
            accept="image/webp,image/jpeg,image/png"
            style="display: none"
          />

          <!-- Show new image preview if user selected a replacement -->
          @if (imagePreview()) {
            <div class="image-preview edit-preview state-success">
              <img [src]="imagePreview()" alt="New image preview" />
              <button mat-icon-button class="remove-btn" (click)="clearFile()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="file-info">
              <span class="file-name">{{ selectedFile()?.name }}</span>
              <span class="file-size">{{ formatFileSize(selectedFile()?.size || 0) }}</span>
            </div>
          } @else {
            <!-- Show current image or loading/error state -->
            <div class="image-preview edit-preview"
                 [class.state-loading]="loadingEditImage()"
                 [class.state-success]="!loadingEditImage() && editImageUrl()"
                 [class.state-error]="!loadingEditImage() && !editImageUrl()">
              @if (loadingEditImage()) {
                <div class="image-loading">
                  <mat-spinner diameter="32"></mat-spinner>
                  <span>Loading image...</span>
                </div>
              } @else if (editImageUrl()) {
                <img [src]="editImageUrl()" alt="Current image" />
                <button mat-mini-fab class="replace-btn" (click)="editFileInput.click()" color="primary">
                  <mat-icon>edit</mat-icon>
                </button>
              } @else {
                <div class="image-placeholder">
                  <mat-icon>broken_image</mat-icon>
                  <span>Failed to load image</span>
                </div>
              }
            </div>
          }

          <!-- Replace button when showing current image -->
          @if (!imagePreview() && !loadingEditImage()) {
            <button mat-stroked-button type="button" (click)="editFileInput.click()" class="replace-image-btn">
              <mat-icon>swap_horiz</mat-icon>
              {{ editImageUrl() ? 'Replace Image' : 'Upload New Image' }}
            </button>
          }

          @if (uploadError()) {
            <div class="error-message">
              <mat-icon>error</mat-icon>
              {{ uploadError() }}
            </div>
          }
        </div>
      }

      <!-- Multilingual Fields -->
      <mat-tab-group class="lang-tabs">
        <mat-tab [label]="'admin.townImages.defaultLang' | translate">
          <div class="tab-content">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'admin.townImages.imageTitle' | translate }}</mat-label>
              <input matInput [(ngModel)]="formData.title" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'admin.townImages.description' | translate }}</mat-label>
              <textarea matInput [(ngModel)]="formData.description" rows="2"></textarea>
            </mat-form-field>
          </div>
        </mat-tab>

        <mat-tab label="Nobiin">
          <div class="tab-content">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Title (Nobiin)</mat-label>
              <input matInput [(ngModel)]="formData.titleNb" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description (Nobiin)</mat-label>
              <textarea matInput [(ngModel)]="formData.descriptionNb" rows="2"></textarea>
            </mat-form-field>
          </div>
        </mat-tab>

        <mat-tab label="English">
          <div class="tab-content">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Title (English)</mat-label>
              <input matInput [(ngModel)]="formData.titleEn" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description (English)</mat-label>
              <textarea matInput [(ngModel)]="formData.descriptionEn" rows="2"></textarea>
            </mat-form-field>
          </div>
        </mat-tab>

        <mat-tab label="العربية">
          <div class="tab-content">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>العنوان (بالعربية)</mat-label>
              <input matInput [(ngModel)]="formData.titleAr" dir="rtl" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>الوصف (بالعربية)</mat-label>
              <textarea matInput [(ngModel)]="formData.descriptionAr" rows="2" dir="rtl"></textarea>
            </mat-form-field>
          </div>
        </mat-tab>
      </mat-tab-group>

      <!-- Active Status (only for edit) -->
      @if (data.mode === 'edit') {
        <div class="toggle-row">
          <mat-slide-toggle [(ngModel)]="formData.isActive">
            {{ 'admin.townImages.activeStatus' | translate }}
          </mat-slide-toggle>
          <span class="hint">{{ 'admin.townImages.activeHint' | translate }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!isValid() || isUploading()"
        (click)="submit()"
      >
        @if (isUploading()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          {{ data.mode === 'create' ? ('common.add' | translate) : ('common.save' | translate) }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    @use 'nubian-variables' as *;

    mat-dialog-content {
      min-width: 500px;
    }

    .full-width {
      width: 100%;
      margin-bottom: $spacing-sm;
    }

    .file-upload-section {
      margin-bottom: $spacing-lg;
    }

    .upload-button {
      width: 100%;
      height: 100px;
      border: 2px dashed $color-border;
      border-radius: $radius-md;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: $spacing-sm;
      color: $nubian-gray;
      transition: all $transition-base;

      &:hover {
        border-color: $nubian-teal;
        background: $nubian-teal-50;
        color: $nubian-teal;
      }

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }

    .upload-hint {
      font-size: $font-size-sm;
      color: $nubian-gray;
      text-align: center;
      margin-top: $spacing-sm;
    }

    .image-preview {
      width: 100%;
      height: 200px;
      border-radius: $radius-md;
      overflow: hidden;
      background: $nubian-beige;
      position: relative;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .remove-btn {
        position: absolute;
        top: $spacing-sm;
        right: $spacing-sm;
        background: rgba(0, 0, 0, 0.5);
        color: white;

        &:hover {
          background: rgba(0, 0, 0, 0.7);
        }
      }

      &.edit-preview {
        margin-bottom: $spacing-md;
        border: 3px solid transparent;
        transition: border-color $transition-base;
      }

      // Color-coded state borders
      &.state-loading {
        border-color: $nubian-orange;
        background: rgba($nubian-orange, 0.05);
      }

      &.state-success {
        border-color: $nubian-teal;
        background: $nubian-beige;
      }

      &.state-error {
        border-color: #dc3545;
        background: rgba(#dc3545, 0.05);
      }

      .image-loading,
      .image-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: $spacing-sm;
        color: $nubian-gray;

        span {
          font-size: $font-size-sm;
        }
      }

      .image-loading {
        color: $nubian-orange;
      }

      .image-placeholder {
        color: #dc3545;

        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
          opacity: 0.7;
        }
      }

      .replace-btn {
        position: absolute;
        bottom: $spacing-sm;
        right: $spacing-sm;
        opacity: 0.9;

        &:hover {
          opacity: 1;
        }
      }
    }

    .replace-image-btn {
      width: 100%;
      margin-top: $spacing-sm;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $spacing-xs;
    }

    .file-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: $spacing-sm;
      padding: $spacing-sm;
      background: $nubian-cream;
      border-radius: $radius-sm;
      font-size: $font-size-sm;

      .file-name {
        color: $nubian-charcoal;
        font-weight: $font-weight-medium;
      }

      .file-size {
        color: $nubian-gray;
      }
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
      margin-top: $spacing-sm;
      padding: $spacing-sm;
      background: $nubian-orange-50;
      color: $nubian-orange;
      border-radius: $radius-sm;
      font-size: $font-size-sm;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .lang-tabs {
      margin-bottom: $spacing-md;
    }

    .tab-content {
      padding-top: $spacing-md;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: $spacing-md;
      margin-top: $spacing-md;
      padding: $spacing-md;
      background: $nubian-cream;
      border-radius: $radius-md;

      .hint {
        font-size: $font-size-sm;
        color: $nubian-gray;
      }
    }

    mat-dialog-actions {
      button {
        min-width: 100px;

        mat-spinner {
          margin: 0 auto;
        }
      }
    }

    @media (max-width: $breakpoint-sm) {
      mat-dialog-content {
        min-width: auto;
      }
    }
  `]
})
export class TownImageDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<TownImageDialogComponent>);
  data = inject<TownImageDialogData>(MAT_DIALOG_DATA);
  private i18n = inject(I18nService);
  private townImageService = inject(TownImageService);

  selectedFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  uploadError = signal<string | null>(null);
  isUploading = signal(false);

  // Edit mode: load image as base64
  editImageUrl = signal<string | null>(null);
  loadingEditImage = signal(false);

  ngOnInit(): void {
    // Load base64 for edit mode
    if (this.data.mode === 'edit' && this.data.image) {
      this.loadEditImage(this.data.image.id);
    }
  }

  private loadEditImage(imageId: string): void {
    this.loadingEditImage.set(true);
    this.townImageService.getImageAsBase64(imageId).subscribe({
      next: (response) => {
        const base64Url = response.base64Data.startsWith('data:')
          ? response.base64Data
          : `data:image/webp;base64,${response.base64Data}`;
        this.editImageUrl.set(base64Url);
        this.loadingEditImage.set(false);
      },
      error: (err) => {
        console.error('Failed to load image for edit:', err);
        this.loadingEditImage.set(false);
      }
    });
  }

  formData = {
    townId: this.data.image?.townId || this.data.preselectedTownId || '',
    title: this.data.image?.title || '',
    titleNb: this.data.image?.titleNb || '',
    titleAr: this.data.image?.titleAr || '',
    titleEn: this.data.image?.titleEn || '',
    description: this.data.image?.description || '',
    descriptionNb: this.data.image?.descriptionNb || '',
    descriptionAr: this.data.image?.descriptionAr || '',
    descriptionEn: this.data.image?.descriptionEn || '',
    isActive: this.data.image?.isActive ?? true
  };

  getTownName(town: TownOption): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    return town.name;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Clear previous error
    this.uploadError.set(null);

    // Validate file type
    const allowedTypes = ['image/webp', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.uploadError.set('Invalid file type. Allowed: WebP, JPEG, PNG');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.uploadError.set('File size must be under 2MB');
      return;
    }

    this.selectedFile.set(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.imagePreview.set(null);
    this.uploadError.set(null);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  isValid(): boolean {
    if (this.data.mode === 'create') {
      return !!this.formData.townId && !!this.selectedFile();
    }
    return true; // For edit, metadata can be updated without new file
  }

  submit(): void {
    if (!this.isValid()) return;

    if (this.data.mode === 'create') {
      const file = this.selectedFile();
      const preview = this.imagePreview();

      if (!file || !preview) return;

      const result: UploadTownImageRequest = {
        townId: this.formData.townId,
        base64Data: preview,
        fileName: file.name,
        mimeType: file.type,
        title: this.formData.title || undefined,
        titleNb: this.formData.titleNb || undefined,
        titleAr: this.formData.titleAr || undefined,
        titleEn: this.formData.titleEn || undefined,
        description: this.formData.description || undefined,
        descriptionNb: this.formData.descriptionNb || undefined,
        descriptionAr: this.formData.descriptionAr || undefined,
        descriptionEn: this.formData.descriptionEn || undefined,
        displayOrder: 0
      };
      this.dialogRef.close(result);
    } else {
      const result: UpdateTownImageRequest = {
        title: this.formData.title || undefined,
        titleNb: this.formData.titleNb || undefined,
        titleAr: this.formData.titleAr || undefined,
        titleEn: this.formData.titleEn || undefined,
        description: this.formData.description || undefined,
        descriptionNb: this.formData.descriptionNb || undefined,
        descriptionAr: this.formData.descriptionAr || undefined,
        descriptionEn: this.formData.descriptionEn || undefined,
        isActive: this.formData.isActive
      };
      this.dialogRef.close(result);
    }
  }
}
