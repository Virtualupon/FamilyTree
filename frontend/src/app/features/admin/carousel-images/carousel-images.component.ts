import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TownImageService } from '../../../core/services/town-image.service';
import { TownService } from '../../../core/services/town.service';
import { TownImageDto, UploadTownImageRequest } from '../../../core/models/town-image.models';
import { TownListItem } from '../../../core/models/town.models';
import { I18nService } from '../../../core/i18n';

interface DisplayTownImage extends TownImageDto {
  displayUrl: string | null;
  loadingBase64: boolean;
}

@Component({
  selector: 'app-carousel-images',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    DragDropModule,
    RouterLink,
    TranslateModule
  ],
  template: `
    <div class="carousel-images-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <a routerLink="/admin" class="back-link">
            <i class="fa-solid fa-arrow-left"></i>
            Admin Panel
          </a>
          <h1>
            <i class="fa-solid fa-images"></i>
            Carousel Images
          </h1>
          <p>Manage background images for the town selection page</p>
        </div>
        <button mat-flat-button color="primary" (click)="openAddDialog()">
          <i class="fa-solid fa-plus"></i>
          Add Image
        </button>
      </div>

      <!-- Town Filter -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline">
          <mat-label>Filter by Town</mat-label>
          <mat-select [(value)]="selectedTownId" (selectionChange)="loadImages()">
            <mat-option [value]="null">All Towns</mat-option>
            @for (town of towns(); track town.id) {
              <mat-option [value]="town.id">{{ getTownName(town) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-card>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading images...</p>
        </div>
      } @else if (images().length === 0) {
        <!-- Empty State -->
        <mat-card class="empty-state">
          <i class="fa-solid fa-images"></i>
          <h3>No carousel images yet</h3>
          <p>Add images to display in the town selection background</p>
          <button mat-flat-button color="primary" (click)="openAddDialog()">
            <i class="fa-solid fa-plus"></i>
            Add First Image
          </button>
        </mat-card>
      } @else {
        <!-- Images Grid (Drag & Drop) -->
        <div class="images-grid" cdkDropList (cdkDropListDropped)="onDrop($event)">
          @for (image of images(); track image.id) {
            <mat-card class="image-card" cdkDrag [cdkDragData]="image">
              <!-- Drag Handle -->
              <div class="drag-handle" cdkDragHandle>
                <i class="fa-solid fa-grip-vertical"></i>
              </div>

              <!-- Image Preview -->
              <div class="image-preview"
                   [class.loading]="image.loadingBase64"
                   [style.backgroundImage]="image.displayUrl ? 'url(' + image.displayUrl + ')' : 'none'">
                @if (image.loadingBase64) {
                  <div class="loading-overlay">
                    <mat-spinner diameter="24"></mat-spinner>
                  </div>
                }
                @if (!image.isActive) {
                  <div class="inactive-overlay">
                    <span>Inactive</span>
                  </div>
                }
              </div>

              <!-- Image Info -->
              <mat-card-content>
                <h4>{{ image.title || 'Untitled' }}</h4>
                <p class="town-name">{{ getImageTownName(image) }}</p>
                <p class="file-info">
                  {{ image.fileName }} • {{ formatFileSize(image.fileSize) }}
                </p>
              </mat-card-content>

              <!-- Actions -->
              <mat-card-actions>
                <button mat-icon-button 
                        [color]="image.isActive ? 'primary' : 'warn'"
                        (click)="toggleActive(image)"
                        [matTooltip]="image.isActive ? 'Deactivate' : 'Activate'">
                  <i class="fa-solid" [class.fa-eye]="image.isActive" [class.fa-eye-slash]="!image.isActive"></i>
                </button>
                <button mat-icon-button color="primary" (click)="editImage(image)" matTooltip="Edit">
                  <i class="fa-solid fa-edit"></i>
                </button>
                <button mat-icon-button color="warn" (click)="deleteImage(image)" matTooltip="Delete">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }

      <!-- Add/Edit Dialog -->
      @if (showDialog()) {
        <div class="dialog-backdrop" (click)="closeDialog()">
          <mat-card class="dialog-card" (click)="$event.stopPropagation()">
            <mat-card-header>
              <mat-card-title>
                {{ editingImage ? 'Edit' : 'Add' }} Carousel Image
              </mat-card-title>
            </mat-card-header>
            
            <mat-card-content>
              <form [formGroup]="imageForm">
                <!-- Town Selection -->
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Town *</mat-label>
                  <mat-select formControlName="townId" required>
                    @for (town of towns(); track town.id) {
                      <mat-option [value]="town.id">{{ getTownName(town) }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <!-- FILE UPLOAD -->
                <div class="file-upload-section">
                  <label class="file-upload-label">
                    <input
                      type="file"
                      accept="image/webp,image/jpeg,image/png"
                      (change)="onFileSelected($event)"
                      #fileInput
                      hidden>

                    @if (selectedFile) {
                      <!-- New file selected (for add or replace) -->
                      <div class="file-preview">
                        <img [src]="previewUrl" alt="Preview">
                        <div class="file-info">
                          <span class="file-name">{{ selectedFile.name }}</span>
                          <span class="file-size">{{ formatFileSize(selectedFile.size) }}</span>
                        </div>
                        <button mat-icon-button type="button" (click)="clearFile($event)">
                          <i class="fa-solid fa-times"></i>
                        </button>
                      </div>
                    } @else if (editingImage && loadingEditingImagePreview) {
                      <!-- Loading current image -->
                      <div class="file-preview current-image loading">
                        <div class="image-loading">
                          <mat-spinner diameter="32"></mat-spinner>
                        </div>
                        <div class="file-info">
                          <span class="file-name">{{ editingImage.fileName || 'Loading image...' }}</span>
                          <span class="file-size">{{ formatFileSize(editingImage.fileSize) }}</span>
                        </div>
                      </div>
                    } @else if (editingImage && editingImagePreviewUrl) {
                      <!-- Current image when editing -->
                      <div class="file-preview current-image">
                        <img [src]="editingImagePreviewUrl" alt="Current image">
                        <div class="file-info">
                          <span class="file-name">{{ editingImage.fileName || 'Current image' }}</span>
                          <span class="file-size">{{ formatFileSize(editingImage.fileSize) }}</span>
                        </div>
                        <button mat-flat-button type="button" color="primary" (click)="fileInput.click(); $event.stopPropagation()">
                          <i class="fa-solid fa-upload"></i>
                          Replace
                        </button>
                      </div>
                    } @else if (editingImage) {
                      <!-- Editing but image failed to load - allow replacement -->
                      <div class="file-preview current-image error">
                        <div class="image-error">
                          <i class="fa-solid fa-image"></i>
                        </div>
                        <div class="file-info">
                          <span class="file-name">{{ editingImage.fileName || 'Image unavailable' }}</span>
                          <span class="file-size">Failed to load preview</span>
                        </div>
                        <button mat-flat-button type="button" color="primary" (click)="fileInput.click(); $event.stopPropagation()">
                          <i class="fa-solid fa-upload"></i>
                          Replace
                        </button>
                      </div>
                    } @else {
                      <div class="upload-placeholder" (click)="fileInput.click()">
                        <i class="fa-solid fa-cloud-upload-alt"></i>
                        <span>Click to select an image</span>
                        <small>WebP, JPEG, or PNG (max 2MB)</small>
                      </div>
                    }
                  </label>
                  @if (fileError) {
                    <mat-error>{{ fileError }}</mat-error>
                  }
                </div>

                <!-- Title (Multilingual) -->
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Title (Default)</mat-label>
                  <input matInput formControlName="title" placeholder="Image title">
                </mat-form-field>

                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Title (Nobiin)</mat-label>
                    <input matInput formControlName="titleNb">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Title (Arabic)</mat-label>
                    <input matInput formControlName="titleAr" dir="rtl">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Title (English)</mat-label>
                    <input matInput formControlName="titleEn">
                  </mat-form-field>
                </div>

                <!-- Description -->
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Description (Default)</mat-label>
                  <textarea matInput formControlName="description" rows="2"></textarea>
                </mat-form-field>

                <!-- Active Checkbox -->
                <mat-checkbox formControlName="isActive" color="primary">
                  Active (visible in carousel)
                </mat-checkbox>
              </form>
            </mat-card-content>

            <mat-card-actions align="end">
              <button mat-button (click)="closeDialog()">Cancel</button>
              <button mat-flat-button color="primary" 
                      (click)="saveImage()"
                      [disabled]="saving() || (!editingImage && !selectedFile)">
                @if (saving()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  {{ editingImage ? 'Update' : 'Upload' }}
                }
              </button>
            </mat-card-actions>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [`
    .carousel-images-page {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #187573;
        text-decoration: none;
        font-size: 14px;
        margin-bottom: 8px;

        &:hover {
          text-decoration: underline;
        }
      }

      h1 {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0;
        color: #2D2D2D;
        font-size: 28px;

        i {
          color: #187573;
        }
      }

      p {
        margin: 8px 0 0;
        color: #666;
      }
    }

    .filter-card {
      padding: 16px;
      margin-bottom: 24px;

      mat-form-field {
        width: 300px;
      }
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      gap: 16px;
      color: #666;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      text-align: center;

      i {
        font-size: 64px;
        color: #ccc;
        margin-bottom: 16px;
      }

      h3 {
        margin: 0 0 8px;
        color: #2D2D2D;
      }

      p {
        margin: 0 0 24px;
        color: #666;
      }
    }

    .images-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }

    .image-card {
      position: relative;
      overflow: hidden;

      .drag-handle {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 10;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 4px;
        padding: 4px 8px;
        cursor: move;
        color: #666;

        &:hover {
          background: #fff;
          color: #187573;
        }
      }

      .image-preview {
        height: 180px;
        background-size: cover;
        background-position: center;
        background-color: #f5f5f5;
        position: relative;

        &.loading {
          background-color: #e0e0e0;
        }

        .loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.8);
        }

        .inactive-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;

          span {
            background: #f44336;
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            text-transform: uppercase;
          }
        }
      }

      mat-card-content {
        padding: 16px;

        h4 {
          margin: 0 0 4px;
          font-size: 16px;
        }

        .town-name {
          margin: 0 0 4px;
          color: #187573;
          font-size: 14px;
        }

        .file-info {
          margin: 0;
          color: #999;
          font-size: 12px;
        }
      }

      mat-card-actions {
        padding: 8px 16px;
        border-top: 1px solid #eee;
      }
    }

    .cdk-drag-preview {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }

    .cdk-drag-placeholder {
      opacity: 0.3;
    }

    /* Dialog Styles */
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog-card {
      width: 600px;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;

      mat-card-content {
        padding: 24px;
      }

      .full-width {
        width: 100%;
      }

      .form-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
      }
    }

    /* File Upload Styles */
    .file-upload-section {
      margin-bottom: 24px;

      .upload-placeholder {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 40px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          border-color: #187573;
          background: #f9f9f9;
        }

        i {
          font-size: 48px;
          color: #187573;
          margin-bottom: 12px;
        }

        span {
          display: block;
          color: #2D2D2D;
          margin-bottom: 4px;
        }

        small {
          color: #999;
        }
      }

      .file-preview {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: #f9f9f9;
        border-radius: 8px;
        border: 1px solid #eee;

        img {
          width: 80px;
          height: 60px;
          object-fit: cover;
          border-radius: 4px;
        }

        .file-info {
          flex: 1;

          .file-name {
            display: block;
            font-weight: 500;
          }

          .file-size {
            color: #666;
            font-size: 12px;
          }
        }

        &.current-image {
          background: #e8f5e9;
          border-color: #4caf50;

          img {
            width: 120px;
            height: 80px;
          }

          &.loading {
            background: #fff3e0;
            border-color: #ff9800;
          }

          &.error {
            background: #ffebee;
            border-color: #f44336;
          }

          .image-loading, .image-error {
            width: 120px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f5f5f5;
            border-radius: 4px;
          }

          .image-error i {
            font-size: 32px;
            color: #999;
          }
        }
      }
    }
  `]
})
export class CarouselImagesComponent implements OnInit {
  private townImageService = inject(TownImageService);
  private townService = inject(TownService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);

  // State
  loading = signal(false);
  saving = signal(false);
  showDialog = signal(false);
  images = signal<DisplayTownImage[]>([]);
  towns = signal<TownListItem[]>([]);

  // Cache for loaded base64 images
  private base64Cache = new Map<string, string>();
  
  selectedTownId: string | null = null;
  editingImage: TownImageDto | null = null;
  editingImagePreviewUrl: string | null = null;
  loadingEditingImagePreview = false;

  // File upload
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  fileError: string | null = null;

  // Form
  imageForm: FormGroup = this.fb.group({
    townId: ['', Validators.required],
    title: [''],
    titleNb: [''],
    titleAr: [''],
    titleEn: [''],
    description: [''],
    descriptionNb: [''],
    descriptionAr: [''],
    descriptionEn: [''],
    isActive: [true]
  });

  ngOnInit(): void {
    this.loadTowns();
    this.loadImages();
  }

  loadTowns(): void {
    this.townService.getAllTowns().subscribe({
      next: (towns) => this.towns.set(towns),
      error: (err) => console.error('Failed to load towns', err)
    });
  }

  loadImages(): void {
    this.loading.set(true);

    this.townImageService.getAllImages(this.selectedTownId || undefined, true).subscribe({
      next: (images) => {
        // Convert to display images with loading state
        const displayImages: DisplayTownImage[] = images.map(img => ({
          ...img,
          displayUrl: this.base64Cache.get(img.id) || null,
          loadingBase64: !this.base64Cache.has(img.id)
        }));
        this.images.set(displayImages);
        this.loading.set(false);

        // Load base64 for each image that's not cached
        displayImages.forEach(img => {
          if (!this.base64Cache.has(img.id)) {
            this.loadImageBase64(img.id);
          }
        });
      },
      error: (err) => {
        console.error('Failed to load images', err);
        this.loading.set(false);
        this.snackBar.open('Failed to load images', 'Close', { duration: 3000 });
      }
    });
  }

  private loadImageBase64(imageId: string): void {
    this.townImageService.getImageAsBase64(imageId).subscribe({
      next: (response) => {
        const base64Url = response.base64Data.startsWith('data:')
          ? response.base64Data
          : `data:image/webp;base64,${response.base64Data}`;
        this.base64Cache.set(imageId, base64Url);
        this.updateImageDisplayUrl(imageId, base64Url);
      },
      error: (err) => {
        console.error(`Failed to load image ${imageId}:`, err);
        this.updateImageDisplayUrl(imageId, null);
      }
    });
  }

  private updateImageDisplayUrl(imageId: string, displayUrl: string | null): void {
    const currentImages = this.images();
    const index = currentImages.findIndex(img => img.id === imageId);
    if (index !== -1) {
      const updatedImages = [...currentImages];
      updatedImages[index] = {
        ...updatedImages[index],
        displayUrl,
        loadingBase64: false
      };
      this.images.set(updatedImages);
    }
  }

  openAddDialog(): void {
    this.editingImage = null;
    this.editingImagePreviewUrl = null;
    this.loadingEditingImagePreview = false;
    this.selectedFile = null;
    this.previewUrl = null;
    this.fileError = null;
    this.imageForm.reset({ isActive: true });
    this.showDialog.set(true);
  }

  editImage(image: TownImageDto): void {
    this.editingImage = image;
    this.selectedFile = null;
    this.previewUrl = null;
    this.fileError = null;

    // Load the current image preview from cache or fetch it
    this.editingImagePreviewUrl = this.base64Cache.get(image.id) || null;
    if (!this.editingImagePreviewUrl) {
      this.loadingEditingImagePreview = true;
      this.townImageService.getImageAsBase64(image.id).subscribe({
        next: (response) => {
          const base64Url = response.base64Data.startsWith('data:')
            ? response.base64Data
            : `data:image/webp;base64,${response.base64Data}`;
          this.base64Cache.set(image.id, base64Url);
          this.editingImagePreviewUrl = base64Url;
          this.loadingEditingImagePreview = false;
        },
        error: (err) => {
          console.error('Failed to load image preview:', err);
          this.loadingEditingImagePreview = false;
        }
      });
    }

    this.imageForm.patchValue({
      townId: image.townId,
      title: image.title,
      titleNb: image.titleNb,
      titleAr: image.titleAr,
      titleEn: image.titleEn,
      description: image.description,
      descriptionNb: image.descriptionNb,
      descriptionAr: image.descriptionAr,
      descriptionEn: image.descriptionEn,
      isActive: image.isActive
    });
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
    this.editingImage = null;
    this.editingImagePreviewUrl = null;
    this.loadingEditingImagePreview = false;
    this.selectedFile = null;
    this.previewUrl = null;
  }

  // FILE SELECTION (key part!)
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/webp', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.fileError = 'Invalid file type. Please use WebP, JPEG, or PNG.';
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.fileError = 'File too large. Maximum size is 2MB.';
      return;
    }

    this.fileError = null;
    this.selectedFile = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  clearFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.previewUrl = null;
  }

  saveImage(): void {
    if (this.imageForm.invalid) return;

    this.saving.set(true);
    const formValue = this.imageForm.value;

    if (this.editingImage) {
      if (this.selectedFile) {
        // User selected a new file - delete old and upload new
        const oldImageId = this.editingImage.id;
        const metadata = {
          title: formValue.title,
          titleNb: formValue.titleNb,
          titleAr: formValue.titleAr,
          titleEn: formValue.titleEn,
          description: formValue.description,
          descriptionNb: formValue.descriptionNb,
          descriptionAr: formValue.descriptionAr,
          descriptionEn: formValue.descriptionEn
        };

        // First upload the new image
        this.townImageService.uploadImageFile(
          formValue.townId,
          this.selectedFile,
          metadata
        ).subscribe({
          next: () => {
            // Then delete the old image
            this.townImageService.deleteImage(oldImageId).subscribe({
              next: () => {
                // Clear from cache
                this.base64Cache.delete(oldImageId);
                this.snackBar.open('Image replaced successfully', 'Close', { duration: 3000 });
                this.closeDialog();
                this.loadImages();
                this.saving.set(false);
              },
              error: (err) => {
                console.error('Failed to delete old image', err);
                // Still consider it a success since new image was uploaded
                this.snackBar.open('Image replaced (old image cleanup may have failed)', 'Close', { duration: 3000 });
                this.closeDialog();
                this.loadImages();
                this.saving.set(false);
              }
            });
          },
          error: (err) => {
            console.error('Failed to upload replacement image', err);
            this.snackBar.open('Failed to replace image', 'Close', { duration: 3000 });
            this.saving.set(false);
          }
        });
      } else {
        // Update metadata only
        this.townImageService.updateImage(this.editingImage.id, {
          title: formValue.title,
          titleNb: formValue.titleNb,
          titleAr: formValue.titleAr,
          titleEn: formValue.titleEn,
          description: formValue.description,
          descriptionNb: formValue.descriptionNb,
          descriptionAr: formValue.descriptionAr,
          descriptionEn: formValue.descriptionEn,
          isActive: formValue.isActive
        }).subscribe({
          next: () => {
            this.snackBar.open('Image updated successfully', 'Close', { duration: 3000 });
            this.closeDialog();
            this.loadImages();
            this.saving.set(false);
          },
          error: (err) => {
            console.error('Failed to update image', err);
            this.snackBar.open('Failed to update image', 'Close', { duration: 3000 });
            this.saving.set(false);
          }
        });
      }
    } else {
      // Upload new image with Base64
      if (!this.selectedFile) return;

      this.townImageService.uploadImageFile(
        formValue.townId,
        this.selectedFile,
        {
          title: formValue.title,
          titleNb: formValue.titleNb,
          titleAr: formValue.titleAr,
          titleEn: formValue.titleEn,
          description: formValue.description,
          descriptionNb: formValue.descriptionNb,
          descriptionAr: formValue.descriptionAr,
          descriptionEn: formValue.descriptionEn
        }
      ).subscribe({
        next: () => {
          this.snackBar.open('Image uploaded successfully', 'Close', { duration: 3000 });
          this.closeDialog();
          this.loadImages();
          this.saving.set(false);
        },
        error: (err) => {
          console.error('Failed to upload image', err);
          this.snackBar.open('Failed to upload image', 'Close', { duration: 3000 });
          this.saving.set(false);
        }
      });
    }
  }

  toggleActive(image: DisplayTownImage): void {
    this.townImageService.toggleActive(image.id).subscribe({
      next: (updated) => {
        const currentImages = this.images();
        const index = currentImages.findIndex(i => i.id === image.id);
        if (index !== -1) {
          const updatedImages = [...currentImages];
          // Preserve display properties
          updatedImages[index] = {
            ...updated,
            displayUrl: currentImages[index].displayUrl,
            loadingBase64: currentImages[index].loadingBase64
          };
          this.images.set(updatedImages);
        }
        this.snackBar.open(
          updated.isActive ? 'Image activated' : 'Image deactivated',
          'Close',
          { duration: 2000 }
        );
      },
      error: (err) => {
        console.error('Failed to toggle active', err);
        this.snackBar.open('Failed to update status', 'Close', { duration: 3000 });
      }
    });
  }

  deleteImage(image: DisplayTownImage): void {
    if (!confirm(`Delete "${image.title || 'this image'}"? This cannot be undone.`)) {
      return;
    }

    this.townImageService.deleteImage(image.id).subscribe({
      next: () => {
        this.images.set(this.images().filter(i => i.id !== image.id));
        this.snackBar.open('Image deleted', 'Close', { duration: 2000 });
      },
      error: (err) => {
        console.error('Failed to delete image', err);
        this.snackBar.open('Failed to delete image', 'Close', { duration: 3000 });
      }
    });
  }

  // Drag & Drop reorder
  onDrop(event: CdkDragDrop<DisplayTownImage[]>): void {
    const currentImages = [...this.images()];
    moveItemInArray(currentImages, event.previousIndex, event.currentIndex);
    this.images.set(currentImages);

    // Save new order to backend
    const reorderRequest = {
      images: currentImages.map((img, index) => ({
        imageId: img.id,
        displayOrder: index
      }))
    };

    const townId = currentImages[0]?.townId;
    if (townId) {
      this.townImageService.reorderImages(townId, reorderRequest).subscribe({
        next: () => this.snackBar.open('Order saved', 'Close', { duration: 2000 }),
        error: (err) => console.error('Failed to save order', err)
      });
    }
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getTownName(town: TownListItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    if (lang === 'nob' && town.nameLocal) return town.nameLocal;
    return town.name;
  }

  getImageTownName(image: DisplayTownImage): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && image.townNameAr) return image.townNameAr;
    if (lang === 'en' && image.townNameEn) return image.townNameEn;
    if (lang === 'nob' && image.townNameNb) return image.townNameNb;
    return image.townName;
  }
}