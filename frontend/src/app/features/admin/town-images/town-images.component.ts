import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { TranslatePipe, I18nService } from '../../../core/i18n';
import { TownImageService } from '../../../core/services/town-image.service';
import { TownService } from '../../../core/services/town.service';
import { TownImageDto, UploadTownImageRequest, UpdateTownImageRequest } from '../../../core/models/town-image.models';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { TownImageDialogComponent, TownImageDialogData, TownImageDialogResult } from './town-image-dialog.component';

interface TownOption {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface ImageDisplayData extends TownImageDto {
  displayUrl: string | null;
  loadingBase64: boolean;
}

@Component({
  selector: 'app-town-images',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatSelectModule,
    MatFormFieldModule,
    DragDropModule,
    TranslatePipe
  ],
  template: `
    <div class="town-images-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/admin" class="back-link">
            <mat-icon>arrow_back</mat-icon>
            {{ 'admin.title' | translate }}
          </a>
          <h1>
            <mat-icon>photo_library</mat-icon>
            {{ 'admin.townImages.title' | translate }}
          </h1>
          <p class="subtitle">{{ 'admin.townImages.subtitle' | translate }}</p>
        </div>
        <div class="header-actions">
          <button mat-flat-button color="primary" (click)="openAddDialog()">
            <mat-icon>add</mat-icon>
            {{ 'admin.townImages.add' | translate }}
          </button>
        </div>
      </div>

      <!-- Filters -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline" class="town-filter">
          <mat-label>{{ 'admin.townImages.filterByTown' | translate }}</mat-label>
          <mat-select [(ngModel)]="selectedTownId" (selectionChange)="onTownFilterChange()">
            <mat-option [value]="null">{{ 'admin.townImages.allTowns' | translate }}</mat-option>
            @for (town of towns(); track town.id) {
              <mat-option [value]="town.id">{{ getTownName(town) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-card>

      <!-- Content -->
      <mat-card class="content-card">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else if (images().length === 0) {
          <div class="empty-state">
            <mat-icon>photo_library</mat-icon>
            <h3>{{ 'admin.townImages.noImages' | translate }}</h3>
            <p>{{ 'admin.townImages.noImagesDesc' | translate }}</p>
            <button mat-flat-button color="primary" (click)="openAddDialog()">
              <mat-icon>add</mat-icon>
              {{ 'admin.townImages.addFirst' | translate }}
            </button>
          </div>
        } @else {
          <div class="images-info">
            <span>{{ images().length }} {{ 'admin.townImages.imagesCount' | translate }}</span>
            <span class="hint">{{ 'admin.townImages.dragHint' | translate }}</span>
          </div>

          <div class="images-list" cdkDropList (cdkDropListDropped)="onDrop($event)">
            @for (image of images(); track image.id; let i = $index) {
              <div class="image-item" cdkDrag [cdkDragDisabled]="selectedTownId === null">
                <div class="drag-handle" cdkDragHandle [class.disabled]="selectedTownId === null">
                  <mat-icon>drag_indicator</mat-icon>
                </div>

                <div class="image-preview">
                  @if (image.loadingBase64) {
                    <div class="image-loading">
                      <mat-spinner diameter="24"></mat-spinner>
                    </div>
                  } @else if (image.displayUrl) {
                    <img [src]="image.displayUrl" [alt]="getImageTitle(image) || 'Town image'" />
                  } @else {
                    <div class="image-placeholder">
                      <mat-icon>broken_image</mat-icon>
                    </div>
                  }
                </div>

                <div class="image-info">
                  <div class="image-title">{{ getImageTitle(image) || ('admin.townImages.untitled' | translate) }}</div>
                  <div class="town-name">
                    <mat-icon>location_on</mat-icon>
                    {{ getTownNameFromImage(image) }}
                  </div>
                  @if (getImageDescription(image)) {
                    <div class="image-description">{{ getImageDescription(image) }}</div>
                  }
                  <div class="image-meta">
                    <span class="order-badge">#{{ image.displayOrder + 1 }}</span>
                    @if (!image.isActive) {
                      <span class="inactive-badge">{{ 'admin.townImages.inactive' | translate }}</span>
                    }
                  </div>
                </div>

                <div class="image-actions">
                  <mat-slide-toggle
                    [checked]="image.isActive"
                    (change)="toggleActive(image)"
                    [matTooltip]="image.isActive ? ('admin.townImages.deactivate' | translate) : ('admin.townImages.activate' | translate)"
                  ></mat-slide-toggle>

                  <button mat-icon-button (click)="openEditDialog(image)" [matTooltip]="'common.edit' | translate">
                    <mat-icon>edit</mat-icon>
                  </button>

                  <button mat-icon-button color="warn" (click)="confirmDelete(image)" [matTooltip]="'common.delete' | translate">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>

                <!-- Drag placeholder -->
                <div class="drag-placeholder" *cdkDragPlaceholder></div>
              </div>
            }
          </div>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    @use 'nubian-variables' as *;

    .town-images-page {
      padding: $spacing-lg;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: $spacing-lg;
      flex-wrap: wrap;
      gap: $spacing-md;
    }

    .header-left {
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: $spacing-xs;
        color: $nubian-teal;
        text-decoration: none;
        font-size: $font-size-sm;
        margin-bottom: $spacing-sm;

        &:hover {
          text-decoration: underline;
        }

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      h1 {
        display: flex;
        align-items: center;
        gap: $spacing-sm;
        margin: 0 0 $spacing-xs;
        font-size: $font-size-2xl;
        color: $nubian-charcoal;

        mat-icon {
          color: $nubian-teal;
        }
      }

      .subtitle {
        margin: 0;
        color: $nubian-gray;
        font-size: $font-size-sm;
      }
    }

    .filter-card {
      padding: $spacing-md;
      margin-bottom: $spacing-md;
    }

    .town-filter {
      min-width: 250px;
    }

    .content-card {
      padding: $spacing-lg;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: $spacing-3xl;
    }

    .empty-state {
      text-align: center;
      padding: $spacing-3xl;
      color: $nubian-gray;

      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: $spacing-md;
        opacity: 0.4;
      }

      h3 {
        margin: 0 0 $spacing-sm;
        color: $nubian-charcoal;
      }

      p {
        margin: 0 0 $spacing-lg;
      }
    }

    .images-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: $spacing-md;
      padding-bottom: $spacing-md;
      border-bottom: 1px solid $color-border;

      .hint {
        font-size: $font-size-sm;
        color: $nubian-gray;
      }
    }

    .images-list {
      display: flex;
      flex-direction: column;
      gap: $spacing-sm;
    }

    .image-item {
      display: flex;
      align-items: center;
      gap: $spacing-md;
      padding: $spacing-md;
      background: $nubian-cream;
      border-radius: $radius-lg;
      border: 1px solid $color-border;
      transition: all $transition-base;

      &:hover {
        border-color: $nubian-teal-300;
        box-shadow: $shadow-sm;
      }

      &.cdk-drag-preview {
        box-shadow: $shadow-xl;
        background: white;
      }

      &.cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
      }
    }

    .drag-handle {
      cursor: grab;
      color: $nubian-gray;
      display: flex;
      align-items: center;

      &:active {
        cursor: grabbing;
      }

      &.disabled {
        cursor: not-allowed;
        opacity: 0.3;
      }
    }

    .drag-placeholder {
      background: $nubian-teal-50;
      border: 2px dashed $nubian-teal;
      border-radius: $radius-lg;
      min-height: 80px;
    }

    .cdk-drag-placeholder {
      opacity: 0;
    }

    .image-preview {
      width: 120px;
      height: 80px;
      flex-shrink: 0;
      border-radius: $radius-md;
      overflow: hidden;
      background: $nubian-beige;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .image-loading,
      .image-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $nubian-gray;
      }

      .image-placeholder mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        opacity: 0.5;
      }
    }

    .image-info {
      flex: 1;
      min-width: 0;

      .image-title {
        font-weight: $font-weight-medium;
        color: $nubian-charcoal;
        margin-bottom: 2px;
      }

      .town-name {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: $font-size-sm;
        color: $nubian-teal;
        margin-bottom: 4px;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .image-description {
        font-size: $font-size-sm;
        color: $nubian-gray;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 400px;
      }

      .image-meta {
        display: flex;
        align-items: center;
        gap: $spacing-sm;
        margin-top: $spacing-xs;
      }

      .order-badge {
        font-size: $font-size-xs;
        font-weight: $font-weight-medium;
        color: $nubian-teal;
        background: $nubian-teal-50;
        padding: 2px 8px;
        border-radius: $radius-full;
      }

      .inactive-badge {
        font-size: $font-size-xs;
        font-weight: $font-weight-medium;
        color: $nubian-orange;
        background: $nubian-orange-50;
        padding: 2px 8px;
        border-radius: $radius-full;
      }
    }

    .image-actions {
      display: flex;
      align-items: center;
      gap: $spacing-xs;
      flex-shrink: 0;
    }

    @media (max-width: $breakpoint-sm) {
      .town-images-page {
        padding: $spacing-md;
      }

      .image-item {
        flex-wrap: wrap;
      }

      .image-preview {
        width: 100%;
        height: 120px;
      }

      .image-info {
        width: 100%;
      }
    }
  `]
})
export class TownImagesComponent implements OnInit {
  private townImageService = inject(TownImageService);
  private townService = inject(TownService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private i18n = inject(I18nService);

  loading = signal(true);
  images = signal<ImageDisplayData[]>([]);
  towns = signal<TownOption[]>([]);
  selectedTownId: string | null = null;

  // Cache loaded base64 data to avoid re-fetching
  private base64Cache = new Map<string, string>();

  ngOnInit(): void {
    this.loadTowns();
    this.loadImages();
  }

  private loadTowns(): void {
    this.townService.getTowns({ page: 1, pageSize: 500 }).subscribe({
      next: (response) => {
        this.towns.set(response.items.map(t => ({
          id: t.id,
          name: t.name,
          nameAr: t.nameAr,
          nameEn: t.nameEn
        })));
      },
      error: () => {
        // Silent fail for towns, will show empty dropdown
      }
    });
  }

  private loadImages(): void {
    this.loading.set(true);
    this.townImageService.getAllImages(this.selectedTownId || undefined).subscribe({
      next: (images) => {
        // Convert to ImageDisplayData with loading state
        const displayImages: ImageDisplayData[] = images.map(img => ({
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
      error: (error) => {
        this.loading.set(false);
        this.snackBar.open(
          error.error?.message || 'Failed to load town images',
          'Close',
          { duration: 3000 }
        );
      }
    });
  }

  private loadImageBase64(imageId: string): void {
    this.townImageService.getImageAsBase64(imageId).subscribe({
      next: (response) => {
        // Cache the base64 data
        const base64Url = response.base64Data.startsWith('data:')
          ? response.base64Data
          : `data:image/webp;base64,${response.base64Data}`;
        this.base64Cache.set(imageId, base64Url);

        // Update the specific image in the list
        const currentImages = this.images();
        const updatedImages = currentImages.map(img =>
          img.id === imageId
            ? { ...img, displayUrl: base64Url, loadingBase64: false }
            : img
        );
        this.images.set(updatedImages);
      },
      error: (err) => {
        console.error(`Failed to load base64 for image ${imageId}:`, err);
        // Mark as failed (no displayUrl, not loading)
        const currentImages = this.images();
        const updatedImages = currentImages.map(img =>
          img.id === imageId
            ? { ...img, displayUrl: null, loadingBase64: false }
            : img
        );
        this.images.set(updatedImages);
      }
    });
  }

  onTownFilterChange(): void {
    this.loadImages();
  }

  getTownName(town: TownOption): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    return town.name;
  }

  getTownNameFromImage(image: TownImageDto): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && image.townNameAr) return image.townNameAr;
    if (lang === 'en' && image.townNameEn) return image.townNameEn;
    return image.townName;
  }

  getImageTitle(image: TownImageDto): string | undefined {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && image.titleAr) return image.titleAr;
    if (lang === 'en' && image.titleEn) return image.titleEn;
    return image.title;
  }

  getImageDescription(image: TownImageDto): string | undefined {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && image.descriptionAr) return image.descriptionAr;
    if (lang === 'en' && image.descriptionEn) return image.descriptionEn;
    return image.description;
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(TownImageDialogComponent, {
      width: '600px',
      data: {
        mode: 'create',
        towns: this.towns(),
        preselectedTownId: this.selectedTownId
      } as TownImageDialogData
    });

    dialogRef.afterClosed().subscribe((result: TownImageDialogResult | undefined) => {
      if (result && 'townId' in result && 'base64Data' in result) {
        this.townImageService.uploadImage(result as UploadTownImageRequest).subscribe({
          next: () => {
            this.snackBar.open('Image uploaded successfully', 'Close', { duration: 3000 });
            this.loadImages();
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to upload image', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  openEditDialog(image: TownImageDto): void {
    const dialogRef = this.dialog.open(TownImageDialogComponent, {
      width: '600px',
      data: {
        mode: 'edit',
        image,
        towns: this.towns()
      } as TownImageDialogData
    });

    dialogRef.afterClosed().subscribe((result: TownImageDialogResult | undefined) => {
      if (result) {
        this.townImageService.updateImage(image.id, result).subscribe({
          next: () => {
            this.snackBar.open('Image updated successfully', 'Close', { duration: 3000 });
            this.loadImages();
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to update image', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  toggleActive(image: TownImageDto): void {
    this.townImageService.toggleActive(image.id).subscribe({
      next: (updated) => {
        const action = updated.isActive ? 'activated' : 'deactivated';
        this.snackBar.open(`Image ${action}`, 'Close', { duration: 3000 });
        this.loadImages();
      },
      error: (error) => {
        this.snackBar.open(error.error?.message || 'Failed to update status', 'Close', { duration: 3000 });
      }
    });
  }

  confirmDelete(image: TownImageDto): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Town Image',
        message: `Are you sure you want to delete "${this.getImageTitle(image) || 'this image'}"?`,
        confirmText: 'Delete',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.townImageService.deleteImage(image.id).subscribe({
          next: () => {
            this.snackBar.open('Image deleted', 'Close', { duration: 3000 });
            this.loadImages();
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to delete image', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  onDrop(event: CdkDragDrop<ImageDisplayData[]>): void {
    if (!this.selectedTownId) {
      this.snackBar.open('Please select a town to reorder images', 'Close', { duration: 3000 });
      return;
    }

    const images = [...this.images()];
    moveItemInArray(images, event.previousIndex, event.currentIndex);
    this.images.set(images);

    // Save the new order
    const orderItems = images.map((img, index) => ({
      imageId: img.id,
      displayOrder: index
    }));

    this.townImageService.reorderImages(this.selectedTownId, { images: orderItems }).subscribe({
      next: () => {
        this.snackBar.open('Order saved', 'Close', { duration: 2000 });
      },
      error: (error) => {
        this.snackBar.open(error.error?.message || 'Failed to save order', 'Close', { duration: 3000 });
        this.loadImages();
      }
    });
  }
}
