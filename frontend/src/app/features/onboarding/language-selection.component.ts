import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, Language } from '../../core/i18n';

interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

@Component({
  selector: 'app-language-selection',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslateModule
  ],
  template: `
    <div class="language-selection-container">
      <mat-card class="selection-card">
        <mat-card-header>
          <mat-card-title class="text-center">
            {{ 'onboarding.selectLanguage' | translate }}
          </mat-card-title>
          <mat-card-subtitle class="text-center">
            {{ 'onboarding.languageSubtitle' | translate }}
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <div class="language-options">
            @for (lang of languages; track lang.code) {
              <button
                mat-stroked-button
                class="language-option"
                [class.selected]="selectedLanguage === lang.code"
                [class.rtl]="lang.direction === 'rtl'"
                (click)="selectLanguage(lang.code)"
                [disabled]="loading"
              >
                <img class="flag" [src]="'assets/flags/' + lang.flag + '.svg'" [alt]="lang.name + ' flag'">
                <div class="language-names">
                  <span class="native-name">{{ lang.nativeName }}</span>
                  <span class="english-name">{{ lang.name }}</span>
                </div>
                @if (selectedLanguage === lang.code) {
                  <mat-icon class="check-icon">check_circle</mat-icon>
                }
              </button>
            }
          </div>
        </mat-card-content>

        <mat-card-actions align="end">
          <button
            mat-raised-button
            color="primary"
            [disabled]="!selectedLanguage || loading"
            (click)="confirmSelection()"
          >
            @if (loading) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              {{ 'common.continue' | translate }}
            }
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .language-selection-container {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: linear-gradient(135deg, #FFF9F5 0%, #FFF5EB 50%, #F4E4D7 100%);
      position: relative;
      overflow: hidden;
    }

    .language-selection-container::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.06;
      background-image:
        repeating-linear-gradient(45deg, transparent, transparent 35px, #C17E3E 35px, #C17E3E 37px),
        repeating-linear-gradient(-45deg, transparent, transparent 35px, #187573 35px, #187573 37px);
      background-size: 80px 80px;
      z-index: 0;
    }

    .selection-card {
      max-width: 500px;
      width: 100%;
      position: relative;
      z-index: 1;
      border-radius: 24px;
      box-shadow: 0 20px 40px rgba(45, 45, 45, 0.15);
    }

    .text-center {
      text-align: center;
      width: 100%;
    }

    mat-card-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
    }

    .language-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .language-option {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 24px;
      height: auto;
      justify-content: flex-start;
      border-radius: 12px;
      transition: all 0.2s ease;

      &:hover {
        background-color: rgba(24, 117, 115, 0.06);
      }

      &.selected {
        border-color: #187573;
        background-color: rgba(24, 117, 115, 0.1);
      }

      &.rtl {
        flex-direction: row-reverse;
        text-align: right;

        .language-names {
          align-items: flex-end;
        }
      }
    }

    .flag {
      width: 40px;
      height: 28px;
      object-fit: cover;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      flex-shrink: 0;
    }

    .language-names {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      flex-grow: 1;
    }

    .native-name {
      font-size: 18px;
      font-weight: 500;
    }

    .english-name {
      font-size: 14px;
      color: #666;
    }

    .check-icon {
      color: #187573;
    }

    mat-card-actions {
      padding: 16px 24px;
    }

    button[mat-raised-button] {
      min-width: 120px;
      background: linear-gradient(135deg, #187573, #2B9A97) !important;
      color: white !important;
      border-radius: 12px !important;
      font-weight: 600;
    }

    button[mat-raised-button]:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(24, 117, 115, 0.35);
    }

    mat-spinner {
      display: inline-block;
    }
  `]
})
export class LanguageSelectionComponent {
  readonly i18n = inject(I18nService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  loading = false;
  selectedLanguage: Language | null = null;

  languages: LanguageOption[] = [
    {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      flag: 'gb',
      direction: 'ltr'
    },
    {
      code: 'ar',
      name: 'Arabic',
      nativeName: 'العربية',
      flag: 'sa',
      direction: 'rtl'
    },
    {
      code: 'nob',
      name: 'Nobiin',
      nativeName: 'نوبين',
      flag: 'sd',
      direction: 'rtl'
    }
  ];

  selectLanguage(code: Language): void {
    this.selectedLanguage = code;
    // Preview the language change
    this.i18n.setLanguage(code);
  }

  confirmSelection(): void {
    if (!this.selectedLanguage) return;

    this.loading = true;
    this.authService.setLanguage(this.selectedLanguage).subscribe({
      next: (response) => {
        // Language is now persisted in the database
        // Check if user needs town selection next
        const user = this.authService.getCurrentUser();

        if (user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin') {
          // SuperAdmin goes directly to dashboard
          this.authService.completeOnboarding().subscribe({
            next: () => {
              this.router.navigate(['/dashboard']);
            },
            error: () => {
              this.router.navigate(['/dashboard']);
            }
          });
        } else {
          // User/Admin needs to select a town
          this.router.navigate(['/onboarding/town']);
        }
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(
          error.error?.message || 'Failed to save language preference',
          'Close',
          { duration: 3000, panelClass: ['error-snackbar'] }
        );
      }
    });
  }
}
