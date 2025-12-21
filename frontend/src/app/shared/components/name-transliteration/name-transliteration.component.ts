import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';

import { TransliterationService } from '../../../core/services/transliteration.service';
import { TranslatePipe } from '../../../core/i18n';
import {
  TransliterationResult,
  TransliterationLanguage,
  getConfidenceColor
} from '../../../core/models/transliteration.models';

/**
 * Event emitted when user selects a transliterated name variant
 */
export interface NameVariantSelectedEvent {
  arabic: string | null;
  english: string;
  nobiin: string | null;
  selectedVariant: 'arabic' | 'english' | 'nobiin';
  selectedValue: string;
}

/**
 * Reusable component for transliterating names between Arabic, English, and Nobiin.
 * Shows the original name and provides transliteration with all language variants.
 */
@Component({
  selector: 'app-name-transliteration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    MatCardModule,
    TranslatePipe
  ],
  template: `
    <div class="name-transliteration">
      <!-- Input section -->
      <div class="name-transliteration__input">
        <mat-form-field appearance="outline" class="name-input">
          <mat-label>{{ 'transliteration.enterName' | translate }}</mat-label>
          <input
            matInput
            [(ngModel)]="inputName"
            [placeholder]="'transliteration.namePlaceholder' | translate"
            (keyup.enter)="onTransliterate()">
          <mat-icon matSuffix>translate</mat-icon>
        </mat-form-field>

        <button
          mat-flat-button
          color="primary"
          [disabled]="loading() || !inputName.trim()"
          (click)="onTransliterate()"
          class="transliterate-btn">
          @if (loading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <mat-icon>auto_fix_high</mat-icon>
            {{ 'transliteration.transliterate' | translate }}
          }
        </button>
      </div>

      <!-- Results section -->
      @if (result()) {
        <mat-card class="name-transliteration__results">
          <mat-card-content>
            <!-- Confidence indicator -->
            <div class="confidence-badge" [style.background-color]="getConfidenceBackground()">
              <mat-icon>{{ getConfidenceIcon() }}</mat-icon>
              <span>{{ (result()!.english.confidence * 100).toFixed(0) }}%</span>
            </div>

            <!-- Language variants -->
            <div class="variants">
              <!-- English -->
              <div
                class="variant"
                [class.variant--selected]="selectedVariant === 'english'"
                (click)="selectVariant('english', result()!.english.best)">
                <div class="variant__label">
                  <span class="variant__flag">EN</span>
                  {{ 'transliteration.english' | translate }}
                </div>
                <div class="variant__value">{{ result()!.english.best }}</div>
                @if (result()!.english.alternatives.length > 0) {
                  <div class="variant__alternatives">
                    <span class="variant__alternatives-label">{{ 'transliteration.alternatives' | translate }}:</span>
                    @for (alt of result()!.english.alternatives; track alt) {
                      <mat-chip (click)="selectVariant('english', alt); $event.stopPropagation()">
                        {{ alt }}
                      </mat-chip>
                    }
                  </div>
                }
              </div>

              <!-- Arabic -->
              @if (result()!.arabic) {
                <div
                  class="variant variant--rtl"
                  [class.variant--selected]="selectedVariant === 'arabic'"
                  (click)="selectVariant('arabic', result()!.arabic!)">
                  <div class="variant__label">
                    <span class="variant__flag">AR</span>
                    {{ 'transliteration.arabic' | translate }}
                  </div>
                  <div class="variant__value">{{ result()!.arabic }}</div>
                </div>
              }

              <!-- Nobiin -->
              @if (result()!.nobiin.value) {
                <div
                  class="variant"
                  [class.variant--selected]="selectedVariant === 'nobiin'"
                  (click)="selectVariant('nobiin', result()!.nobiin.value!)">
                  <div class="variant__label">
                    <span class="variant__flag">NOB</span>
                    {{ 'transliteration.nobiin' | translate }}
                  </div>
                  <div class="variant__value variant__value--nobiin">{{ result()!.nobiin.value }}</div>
                  @if (result()!.nobiin.ipa) {
                    <div class="variant__ipa">IPA: /{{ result()!.nobiin.ipa }}/</div>
                  }
                </div>
              }
            </div>

            <!-- Warnings -->
            @if (result()!.metadata.warnings.length > 0) {
              <div class="warnings">
                @for (warning of result()!.metadata.warnings; track warning) {
                  <div class="warning">
                    <mat-icon>warning</mat-icon>
                    {{ warning }}
                  </div>
                }
              </div>
            }

            <!-- Review indicator -->
            @if (result()!.metadata.needsReview) {
              <div class="review-needed">
                <mat-icon>rate_review</mat-icon>
                {{ 'transliteration.needsReview' | translate }}
              </div>
            }
          </mat-card-content>

          <!-- Actions -->
          <mat-card-actions align="end">
            <button mat-button (click)="clearResult()">
              {{ 'common.clear' | translate }}
            </button>
            <button
              mat-flat-button
              color="primary"
              [disabled]="!selectedVariant"
              (click)="confirmSelection()">
              <mat-icon>check</mat-icon>
              {{ 'transliteration.useSelected' | translate }}
            </button>
          </mat-card-actions>
        </mat-card>
      }

      <!-- Error message -->
      @if (error()) {
        <div class="error-message">
          <mat-icon>error</mat-icon>
          {{ error() }}
        </div>
      }
    </div>
  `,
  styles: [`
    .name-transliteration {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-md);

      &__input {
        display: flex;
        gap: var(--ft-spacing-sm);
        align-items: flex-start;

        .name-input {
          flex: 1;
        }

        .transliterate-btn {
          height: 56px;
          min-width: 140px;
        }
      }

      &__results {
        position: relative;

        .confidence-badge {
          position: absolute;
          top: var(--ft-spacing-sm);
          right: var(--ft-spacing-sm);
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;

          mat-icon {
            font-size: 14px;
            width: 14px;
            height: 14px;
          }
        }
      }
    }

    .variants {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-md);
      margin-top: var(--ft-spacing-sm);
    }

    .variant {
      padding: var(--ft-spacing-md);
      border: 2px solid var(--ft-divider);
      border-radius: var(--ft-radius-md);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--ft-primary);
        background: var(--ft-surface-hover);
      }

      &--selected {
        border-color: var(--ft-primary);
        background: var(--ft-primary-container);
      }

      &--rtl {
        direction: rtl;
        text-align: right;
      }

      &__label {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ft-on-surface-variant);
        margin-bottom: var(--ft-spacing-xs);
      }

      &__flag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 16px;
        background: var(--ft-primary);
        color: white;
        border-radius: 2px;
        font-size: 0.625rem;
        font-weight: 700;
      }

      &__value {
        font-size: 1.25rem;
        font-weight: 500;

        &--nobiin {
          font-family: 'Noto Sans Coptic', 'Antinoou', serif;
        }
      }

      &__alternatives {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ft-spacing-xs);
        margin-top: var(--ft-spacing-sm);

        &-label {
          font-size: 0.75rem;
          color: var(--ft-on-surface-variant);
        }

        mat-chip {
          font-size: 0.75rem;
        }
      }

      &__ipa {
        font-size: 0.75rem;
        color: var(--ft-on-surface-variant);
        font-style: italic;
        margin-top: var(--ft-spacing-xs);
      }
    }

    .warnings {
      margin-top: var(--ft-spacing-md);

      .warning {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-sm);
        background: var(--ft-warning-container);
        color: var(--ft-on-warning-container);
        border-radius: var(--ft-radius-sm);
        font-size: 0.875rem;

        mat-icon {
          color: var(--ft-warning);
        }
      }
    }

    .review-needed {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-sm);
      margin-top: var(--ft-spacing-md);
      padding: var(--ft-spacing-sm);
      background: var(--ft-info-container);
      color: var(--ft-on-info-container);
      border-radius: var(--ft-radius-sm);
      font-size: 0.875rem;

      mat-icon {
        color: var(--ft-info);
      }
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-sm);
      padding: var(--ft-spacing-md);
      background: var(--ft-error-container);
      color: var(--ft-on-error-container);
      border-radius: var(--ft-radius-md);

      mat-icon {
        color: var(--ft-error);
      }
    }

    mat-spinner {
      display: inline-block;
    }
  `]
})
export class NameTransliterationComponent {
  private readonly transliterationService = inject(TransliterationService);

  @Input() sourceLanguage: TransliterationLanguage = 'en';
  @Input() displayLanguage: TransliterationLanguage = 'en';
  @Input() initialName: string = '';

  @Output() variantSelected = new EventEmitter<NameVariantSelectedEvent>();
  @Output() resultChanged = new EventEmitter<TransliterationResult | null>();

  inputName = '';
  selectedVariant: 'arabic' | 'english' | 'nobiin' | null = null;
  selectedValue: string = '';

  readonly loading = this.transliterationService.loading;
  readonly error = this.transliterationService.error;
  readonly result = signal<TransliterationResult | null>(null);

  ngOnInit(): void {
    if (this.initialName) {
      this.inputName = this.initialName;
    }
  }

  onTransliterate(): void {
    if (!this.inputName.trim()) return;

    this.selectedVariant = null;
    this.selectedValue = '';

    this.transliterationService.transliterate({
      inputName: this.inputName.trim(),
      sourceLanguage: this.sourceLanguage,
      displayLanguage: this.displayLanguage
    }).subscribe({
      next: (result) => {
        this.result.set(result);
        this.resultChanged.emit(result);
        // Auto-select English by default
        this.selectVariant('english', result.english.best);
      },
      error: () => {
        this.result.set(null);
        this.resultChanged.emit(null);
      }
    });
  }

  selectVariant(variant: 'arabic' | 'english' | 'nobiin', value: string): void {
    this.selectedVariant = variant;
    this.selectedValue = value;
  }

  confirmSelection(): void {
    if (!this.selectedVariant || !this.result()) return;

    const r = this.result()!;
    this.variantSelected.emit({
      arabic: r.arabic,
      english: r.english.best,
      nobiin: r.nobiin.value,
      selectedVariant: this.selectedVariant,
      selectedValue: this.selectedValue
    });
  }

  clearResult(): void {
    this.result.set(null);
    this.selectedVariant = null;
    this.selectedValue = '';
    this.resultChanged.emit(null);
  }

  getConfidenceBackground(): string {
    const confidence = this.result()?.english.confidence ?? 0;
    if (confidence >= 0.9) return '#4caf50';
    if (confidence >= 0.7) return '#ff9800';
    return '#f44336';
  }

  getConfidenceIcon(): string {
    const confidence = this.result()?.english.confidence ?? 0;
    if (confidence >= 0.9) return 'verified';
    if (confidence >= 0.7) return 'help';
    return 'warning';
  }
}
