import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    MatCardModule,
    TranslatePipe
  ],
  templateUrl: './name-transliteration.component.html',
  styleUrls: ['./name-transliteration.component.scss']
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
    if (confidence >= 0.9) return 'fa-circle-check';
    if (confidence >= 0.7) return 'fa-circle-question';
    return 'fa-triangle-exclamation';
  }
}
