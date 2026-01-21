# Claude Code Prompt: Town Selection Page Redesign

## Overview
Redesign the town selection page (`/onboarding/town`) with Nubian theme styling, a background image carousel, and a dropdown list for town selection.

## Project Location
- **Frontend:** `/home/claude/frontend` (Angular 18+)
- **Target File:** `src/app/features/onboarding/town-selection.component.ts`
- **Theme Variables:** `src/styles/_nubian-variables.scss`

---

## Requirements

### 1. Nubian Theme Styling
Use the existing Nubian theme colors from `_nubian-variables.scss`:
- **Primary:** Nubian Teal `#187573`
- **Secondary/Accent:** Nubian Gold `#C17E3E`
- **Background:** Cream `#FFF9F5`, Beige `#F4E4D7`
- **Text:** Charcoal `#2D2D2D`, Gray `#6B6B6B`
- **Success:** Nubian Green `#2D7A3E`

Apply gradient overlays using teal-to-gold transitions.

### 2. Background Image Carousel
Create a fullscreen background carousel that:
- Displays images in an infinite loop
- Auto-advances every 5 seconds
- Uses smooth fade transitions (1.5s duration)
- Shows clickable dot indicators at the bottom
- Has a semi-transparent gradient overlay (teal → charcoal → gold)

**Placeholder images (replace with actual Nubian heritage images):**
```typescript
carouselImages = [
  'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1920&q=80',
  'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=1920&q=80',
  'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1920&q=80',
  'https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=1920&q=80',
  'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1920&q=80',
];
```

### 3. Town Selection Dropdown
Replace the current button list with a `mat-select` dropdown:
- Show town name (localized based on current language)
- Display country and tree count in each option
- Show a preview card below the dropdown when a town is selected
- Include place icon prefix

### 4. UI Layout Structure
```
┌─────────────────────────────────────────────────────┐
│  [FULLSCREEN BACKGROUND CAROUSEL]                   │
│                                                     │
│           ┌─────────────────────┐                   │
│           │   [Logo/Tree Icon]  │                   │
│           │     App Name        │                   │
│           │    App Tagline      │                   │
│           └─────────────────────┘                   │
│                                                     │
│           ┌─────────────────────────────┐           │
│           │  CARD HEADER (Teal BG)      │           │
│           │  📍 Select Your Town        │           │
│           │  Subtitle text              │           │
│           ├─────────────────────────────┤           │
│           │  CARD CONTENT               │           │
│           │  [▼ Town Dropdown        ]  │           │
│           │                             │           │
│           │  ┌───────────────────────┐  │           │
│           │  │ Selected: Ginnis  ✓   │  │           │
│           │  └───────────────────────┘  │           │
│           ├─────────────────────────────┤           │
│           │  [ Continue →           ]   │           │
│           └─────────────────────────────┘           │
│                                                     │
│              ● ○ ○ ○ ○  (carousel indicators)       │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Update the Component File

Replace `src/app/features/onboarding/town-selection.component.ts` with the following:

```typescript
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
  
  // Background images - replace with actual Nubian heritage images
  carouselImages = [
    'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1920&q=80',
    'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=1920&q=80',
    'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1920&q=80',
    'https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=1920&q=80',
    'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1920&q=80',
  ];

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.systemRole === 'Admin';
    this.loadTowns();
    this.startCarousel();
  }

  ngOnDestroy(): void {
    this.stopCarousel();
  }

  private startCarousel(): void {
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
}
```

### Step 2: Create the Template File

Create `src/app/features/onboarding/town-selection.component.html`:

```html
<div class="town-selection-page">
  <!-- Background Image Carousel -->
  <div class="background-carousel">
    @for (img of carouselImages; track img; let i = $index) {
      <div 
        class="carousel-slide"
        [class.active]="i === currentSlide()"
        [style.background-image]="'url(' + img + ')'"
      ></div>
    }
    <div class="carousel-overlay"></div>
  </div>

  <!-- Content -->
  <div class="content-container">
    <!-- Logo/Branding -->
    <div class="branding">
      <div class="logo-icon">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
          <path d="M50 15 L50 85" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          <path d="M50 30 L30 45" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M50 30 L70 45" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M50 45 L25 60" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M50 45 L75 60" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M50 60 L20 75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M50 60 L80 75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="50" cy="20" r="4" fill="currentColor"/>
          <circle cx="30" cy="45" r="3" fill="currentColor"/>
          <circle cx="70" cy="45" r="3" fill="currentColor"/>
          <circle cx="25" cy="60" r="2.5" fill="currentColor"/>
          <circle cx="75" cy="60" r="2.5" fill="currentColor"/>
        </svg>
      </div>
      <h1 class="app-title">{{ 'app.name' | translate }}</h1>
      <p class="app-subtitle">{{ 'app.tagline' | translate }}</p>
    </div>

    <!-- Selection Card -->
    <mat-card class="selection-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon class="title-icon">location_city</mat-icon>
          {{ 'onboarding.selectTown' | translate }}
        </mat-card-title>
        <mat-card-subtitle>
          {{ isAdmin ? ('onboarding.townSubtitleAdmin' | translate) : ('onboarding.townSubtitleUser' | translate) }}
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        @if (loadingTowns) {
          <div class="loading-container">
            <mat-spinner diameter="40" color="primary"></mat-spinner>
            <p>{{ 'common.loading' | translate }}...</p>
          </div>
        } @else if (towns.length === 0) {
          <div class="empty-state">
            <mat-icon>location_off</mat-icon>
            <p>{{ 'onboarding.noTownsFound' | translate }}</p>
          </div>
        } @else {
          <!-- Town Dropdown -->
          <mat-form-field appearance="outline" class="town-select">
            <mat-label>{{ 'onboarding.chooseTown' | translate }}</mat-label>
            <mat-select 
              [(value)]="selectedTown" 
              [disabled]="loading"
            >
              @for (town of towns; track town.id) {
                <mat-option [value]="town">
                  <div class="town-option-content">
                    <span class="town-name">{{ getTownName(town) }}</span>
                    <span class="town-meta">
                      @if (town.country) {
                        <span class="town-country">{{ town.country }}</span>
                        <span class="separator">•</span>
                      }
                      <span class="tree-count">{{ town.treeCount }} {{ 'common.trees' | translate }}</span>
                    </span>
                  </div>
                </mat-option>
              }
            </mat-select>
            <mat-icon matPrefix class="select-icon">place</mat-icon>
            @if (selectedTown) {
              <mat-hint>{{ selectedTown.treeCount }} {{ 'common.familyTrees' | translate }}</mat-hint>
            }
          </mat-form-field>

          <!-- Selected Town Preview -->
          @if (selectedTown) {
            <div class="selected-preview">
              <div class="preview-icon">
                <mat-icon>account_tree</mat-icon>
              </div>
              <div class="preview-info">
                <span class="preview-label">{{ 'onboarding.selectedTown' | translate }}</span>
                <span class="preview-name">{{ getTownName(selectedTown) }}</span>
              </div>
              <mat-icon class="check-icon">check_circle</mat-icon>
            </div>
          }
        }
      </mat-card-content>

      <mat-card-actions>
        <button
          mat-raised-button
          class="continue-btn"
          [disabled]="!selectedTown || loading"
          (click)="confirmSelection()"
        >
          @if (loading) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <span>{{ 'common.continue' | translate }}</span>
            <mat-icon>arrow_forward</mat-icon>
          }
        </button>
      </mat-card-actions>
    </mat-card>
  </div>

  <!-- Carousel Indicators -->
  <div class="carousel-indicators">
    @for (img of carouselImages; track img; let i = $index) {
      <button 
        class="indicator"
        [class.active]="i === currentSlide()"
        (click)="goToSlide(i)"
        [attr.aria-label]="'Slide ' + (i + 1)"
      ></button>
    }
  </div>
</div>
```

### Step 3: Create the Styles File

Create `src/app/features/onboarding/town-selection.component.scss`:

```scss
@use 'nubian-variables' as *;

.town-selection-page {
  min-height: 100vh;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

// ============================================
// BACKGROUND CAROUSEL
// ============================================
.background-carousel {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.carousel-slide {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0;
  transition: opacity 1.5s ease-in-out;

  &.active {
    opacity: 1;
  }
}

.carousel-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba($nubian-teal, 0.85) 0%,
    rgba($nubian-charcoal, 0.9) 50%,
    rgba($nubian-gold, 0.85) 100%
  );
}

// ============================================
// CONTENT CONTAINER
// ============================================
.content-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  padding: $spacing-lg;
  display: flex;
  flex-direction: column;
  align-items: center;
}

// ============================================
// BRANDING
// ============================================
.branding {
  text-align: center;
  margin-bottom: $spacing-xl;
  color: white;
}

.logo-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto $spacing-md;
  color: $nubian-gold;
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
}

.app-title {
  font-family: $font-display;
  font-size: $font-size-3xl;
  font-weight: $font-weight-semibold;
  margin: 0 0 $spacing-sm;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.app-subtitle {
  font-size: $font-size-base;
  opacity: 0.9;
  margin: 0;
  color: $nubian-gold-200;
}

// ============================================
// SELECTION CARD
// ============================================
.selection-card {
  width: 100%;
  border-radius: $radius-xl;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(10px);
  box-shadow: $shadow-2xl;
  overflow: hidden;
}

mat-card-header {
  background: linear-gradient(135deg, $nubian-teal 0%, $nubian-teal-600 100%);
  padding: $spacing-lg !important;
  margin: 0 !important;

  mat-card-title {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    color: white;
    font-size: $font-size-xl;
    font-weight: $font-weight-semibold;
    margin: 0;

    .title-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
  }

  mat-card-subtitle {
    color: rgba(255, 255, 255, 0.85);
    margin-top: $spacing-sm;
    font-size: $font-size-sm;
  }
}

mat-card-content {
  padding: $spacing-lg !important;
}

// ============================================
// LOADING & EMPTY STATES
// ============================================
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $spacing-3xl $spacing-lg;
  gap: $spacing-md;

  p {
    color: $nubian-gray;
    margin: 0;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $spacing-3xl $spacing-lg;
  color: $nubian-gray;

  mat-icon {
    font-size: 56px;
    width: 56px;
    height: 56px;
    margin-bottom: $spacing-md;
    opacity: 0.4;
  }
}

// ============================================
// TOWN DROPDOWN
// ============================================
.town-select {
  width: 100%;

  .select-icon {
    color: $nubian-teal;
    margin-right: $spacing-sm;
  }
}

.town-option-content {
  display: flex;
  flex-direction: column;
  padding: $spacing-xs 0;

  .town-name {
    font-weight: $font-weight-medium;
    color: $nubian-charcoal;
  }

  .town-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: $font-size-sm;
    color: $nubian-gray;
    margin-top: 2px;

    .separator {
      opacity: 0.5;
    }
  }
}

// ============================================
// SELECTED PREVIEW
// ============================================
.selected-preview {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-md;
  margin-top: $spacing-md;
  background: linear-gradient(135deg, $nubian-gold-50 0%, $nubian-cream 100%);
  border-radius: $radius-lg;
  border: 1px solid $nubian-gold-200;

  .preview-icon {
    width: 44px;
    height: 44px;
    border-radius: $radius-md;
    background: $nubian-teal;
    display: flex;
    align-items: center;
    justify-content: center;

    mat-icon {
      color: white;
    }
  }

  .preview-info {
    flex: 1;
    display: flex;
    flex-direction: column;

    .preview-label {
      font-size: $font-size-xs;
      color: $nubian-gray;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    .preview-name {
      font-weight: $font-weight-semibold;
      color: $nubian-charcoal;
      font-size: $font-size-lg;
    }
  }

  .check-icon {
    color: $nubian-green;
    font-size: 28px;
    width: 28px;
    height: 28px;
  }
}

// ============================================
// ACTIONS
// ============================================
mat-card-actions {
  padding: $spacing-md $spacing-lg $spacing-lg !important;
  margin: 0 !important;
}

.continue-btn {
  width: 100%;
  height: 48px;
  font-size: $font-size-base;
  font-weight: $font-weight-semibold;
  border-radius: $radius-lg;
  background: linear-gradient(135deg, $nubian-gold 0%, $nubian-gold-600 100%) !important;
  color: white !important;
  box-shadow: $shadow-gold;
  transition: all $transition-base;

  &:hover:not([disabled]) {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba($nubian-gold, 0.5);
  }

  &[disabled] {
    background: $nubian-gray-light !important;
    box-shadow: none;
  }

  mat-icon {
    margin-left: $spacing-sm;
  }

  mat-spinner {
    display: inline-block;
  }
}

// ============================================
// CAROUSEL INDICATORS
// ============================================
.carousel-indicators {
  position: fixed;
  bottom: $spacing-lg;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: $spacing-sm;
  z-index: 10;
}

.indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  cursor: pointer;
  transition: all $transition-base;
  padding: 0;

  &:hover {
    border-color: white;
    background: rgba(255, 255, 255, 0.3);
  }

  &.active {
    background: $nubian-gold;
    border-color: $nubian-gold;
    transform: scale(1.2);
  }
}

// ============================================
// RESPONSIVE
// ============================================
@media (max-width: $breakpoint-sm) {
  .content-container {
    padding: $spacing-md;
  }

  .branding {
    margin-bottom: $spacing-lg;
  }

  .logo-icon {
    width: 64px;
    height: 64px;
  }

  .app-title {
    font-size: $font-size-2xl;
  }

  mat-card-header,
  mat-card-content {
    padding: $spacing-md !important;
  }
}
```

### Step 4: Add Missing Translation Keys

Add these keys to your translation files (`en.json`, `ar.json`):

```json
{
  "app": {
    "name": "Nubian Family Trees",
    "tagline": "Preserving Our Heritage"
  },
  "onboarding": {
    "selectTown": "Select Your Town",
    "chooseTown": "Choose a Town",
    "selectedTown": "Selected Town",
    "townSubtitleAdmin": "Select a town you manage",
    "townSubtitleUser": "Choose a town to browse family trees",
    "noTownsFound": "No towns available"
  },
  "common": {
    "trees": "trees",
    "familyTrees": "family trees",
    "continue": "Continue",
    "loading": "Loading"
  }
}
```

---

## Verification Steps

1. **Run `ng serve`** and navigate to `/onboarding/town`
2. **Verify carousel:** Images should fade in/out every 5 seconds
3. **Verify dropdown:** Should show all available towns with names and tree counts
4. **Verify selection:** Selecting a town should show the preview card
5. **Verify theming:** Gold and teal colors should be applied
6. **Verify responsive:** Should work on mobile screens

---

## Optional Enhancements

1. **Add local images:** Replace Unsplash URLs with local Nubian heritage images in `assets/images/`
2. **Add swipe gestures:** Implement touch swipe for mobile carousel navigation
3. **Preload images:** Add image preloading for smoother transitions
4. **Add RTL support:** Ensure layout works for Arabic (RTL) language

---

## Summary

| Feature | Implementation |
|---------|----------------|
| Nubian Theme | SCSS variables from `_nubian-variables.scss` |
| Image Carousel | Signal-based with 5s auto-advance, fade transition |
| Town Dropdown | `mat-select` with localized names and metadata |
| Selected Preview | Card showing selected town with check icon |
| Continue Button | Gold gradient with hover effects |
