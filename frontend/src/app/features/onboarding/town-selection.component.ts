import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { TownImageService } from '../../core/services/town-image.service';
import { CarouselImageDto } from '../../core/models/town-image.models';

interface DisplayCarouselImage extends CarouselImageDto {
  displayUrl: string | null;
  isLoading: boolean;
}
import { I18nService } from '../../core/i18n';
import { TownInfo } from '../../core/models/auth.models';

@Component({
  selector: 'app-town-selection',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslateModule
  ],
  templateUrl: './town-selection.component.html',
  styleUrl: './town-selection.component.scss'
})
export class TownSelectionComponent implements OnInit, OnDestroy {
  readonly i18n = inject(I18nService);
  private authService = inject(AuthService);
  private townImageService = inject(TownImageService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  loading = false;
  loadingTowns = true;
  selectedTown: TownInfo | null = null;
  towns: TownInfo[] = [];
  isAdmin = false;

  // Carousel state
  currentSlide = signal(0);
  private carouselInterval: ReturnType<typeof setInterval> | null = null;

  // Background images - loaded from API, with fallback defaults
  carouselImages: DisplayCarouselImage[] = [];
  private defaultImages = [
    'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1920&q=80',
    'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=1920&q=80',
    'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1920&q=80',
    'https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=1920&q=80',
    'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1920&q=80',
  ];

  // Cache for signed URLs (browser also caches the actual images via HTTP headers)
  private signedUrlCache = new Map<string, string>();

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.systemRole === 'Admin';
    this.loadCarouselImages();
    this.loadTowns();
  }

  ngOnDestroy(): void {
    this.stopCarousel();
  }

  private loadCarouselImages(): void {
    this.townImageService.getAvailableTownImages().subscribe({
      next: (images) => {
        if (images && images.length > 0) {
          // Convert to display images with loading state
          this.carouselImages = images.map(img => ({
            ...img,
            displayUrl: null,
            isLoading: true
          }));
          // Load signed URL for each image
          this.carouselImages.forEach(img => {
            if (!img.id.startsWith('default-')) {
              this.loadImageSignedUrl(img.id);
            }
          });
        } else {
          // Use default images as fallback (external URLs work directly)
          this.carouselImages = this.defaultImages.map((url, index) => ({
            id: `default-${index}`,
            townId: '',
            townName: '',
            imageUrl: url,
            displayUrl: url, // External URLs work directly
            isLoading: false
          }));
        }
        this.startCarousel();
      },
      error: () => {
        // Use default images on error (external URLs work directly)
        this.carouselImages = this.defaultImages.map((url, index) => ({
          id: `default-${index}`,
          townId: '',
          townName: '',
          imageUrl: url,
          displayUrl: url, // External URLs work directly
          isLoading: false
        }));
        this.startCarousel();
      }
    });
  }

  /**
   * Load signed URL for image display.
   * Browser will cache the actual image via HTTP headers.
   */
  private loadImageSignedUrl(imageId: string): void {
    // Check cache first
    if (this.signedUrlCache.has(imageId)) {
      this.updateImageDisplayUrl(imageId, this.signedUrlCache.get(imageId)!);
      return;
    }

    this.townImageService.getSignedUrl(imageId).subscribe({
      next: (signedUrl) => {
        // Use signed URL directly - browser handles caching
        this.signedUrlCache.set(imageId, signedUrl.url);
        this.updateImageDisplayUrl(imageId, signedUrl.url);
      },
      error: (err) => {
        console.error(`Failed to load carousel image ${imageId}:`, err);
        // Mark as failed - use a placeholder or hide
        this.updateImageDisplayUrl(imageId, null);
      }
    });
  }

  private updateImageDisplayUrl(imageId: string, displayUrl: string | null): void {
    const index = this.carouselImages.findIndex(img => img.id === imageId);
    if (index !== -1) {
      this.carouselImages[index] = {
        ...this.carouselImages[index],
        displayUrl,
        isLoading: false
      };
    }
  }

  private startCarousel(): void {
    if (this.carouselImages.length === 0) return;

    this.carouselInterval = setInterval(() => {
      this.nextSlide();
    }, 5000);
  }

  private stopCarousel(): void {
    if (this.carouselInterval) {
      clearInterval(this.carouselInterval);
      this.carouselInterval = null;
    }
  }

  nextSlide(): void {
    if (this.carouselImages.length === 0) return;
    const next = (this.currentSlide() + 1) % this.carouselImages.length;
    this.currentSlide.set(next);
  }

  goToSlide(index: number): void {
    this.currentSlide.set(index);
    this.stopCarousel();
    this.startCarousel();
  }

  private loadTowns(): void {
    this.loadingTowns = true;

    if (this.isAdmin) {
      this.authService.getMyTowns().subscribe({
        next: (response) => {
          this.towns = response.assignedTowns;
          this.loadingTowns = false;
          if (this.towns.length === 1) {
            this.selectedTown = this.towns[0];
          }
        },
        error: (error) => {
          this.loadingTowns = false;
          this.snackBar.open(
            error.error?.message || 'Failed to load towns',
            'Close',
            { duration: 3000, panelClass: ['error-snackbar'] }
          );
        }
      });
    } else {
      this.authService.getAvailableTowns().subscribe({
        next: (towns) => {
          this.towns = towns;
          this.loadingTowns = false;
          if (this.towns.length === 1) {
            this.selectedTown = this.towns[0];
          }
        },
        error: (error) => {
          this.loadingTowns = false;
          this.snackBar.open(
            error.error?.message || 'Failed to load towns',
            'Close',
            { duration: 3000, panelClass: ['error-snackbar'] }
          );
        }
      });
    }
  }

  getTownName(town: TownInfo): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    return town.name;
  }

  confirmSelection(): void {
    if (!this.selectedTown) return;
    this.loading = true;

    const selectMethod = this.isAdmin
      ? this.authService.selectTownForAdmin(this.selectedTown.id)
      : this.authService.selectTownForUser(this.selectedTown.id);

    selectMethod.subscribe({
      next: () => {
        this.authService.completeOnboarding().subscribe({
          next: () => this.router.navigate(['/dashboard']),
          error: () => this.router.navigate(['/dashboard'])
        });
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(
          error.error?.message || 'Failed to select town',
          'Close',
          { duration: 3000, panelClass: ['error-snackbar'] }
        );
      }
    });
  }

  getCurrentImageUrl(): string {
    const currentImage = this.carouselImages[this.currentSlide()];
    return currentImage?.displayUrl || '';
  }

  getCarouselImageTitle(image: DisplayCarouselImage): string | undefined {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && image.titleAr) return image.titleAr;
    if (lang === 'en' && image.titleEn) return image.titleEn;
    return image.title;
  }
}
