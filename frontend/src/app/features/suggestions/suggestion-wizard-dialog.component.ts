import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

import { I18nService, TranslatePipe } from '../../core/i18n';
import { SuggestionService } from '../../core/services/suggestion.service';
import { PersonSearchService } from '../../core/services/person-search.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import {
  SuggestionType,
  ConfidenceLevel,
  CreateSuggestionRequest,
  SuggestionDetail
} from '../../core/models/suggestion.models';
import { SearchPersonItem } from '../../core/models/search.models';
import { debounceTime, distinctUntilChanged, switchMap, of, Subject, Observable } from 'rxjs';

export interface SuggestionWizardData {
  targetPersonId?: string;
  preselectedType?: SuggestionType;
}

@Component({
  selector: 'app-suggestion-wizard-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatAutocompleteModule,
    TranslatePipe
  ],
  template: `
    <h2 mat-dialog-title>{{ 'suggestion.createTitle' | translate }}</h2>

    <mat-dialog-content>
      <mat-stepper [linear]="true" #stepper>
        <!-- Step 1: Select Type -->
        <mat-step [stepControl]="typeForm">
          <ng-template matStepLabel>{{ 'suggestion.selectType' | translate }}</ng-template>
          <form [formGroup]="typeForm">
            <div class="suggestion-type-grid">
              @for (type of suggestionTypes; track type.value) {
                <div
                  class="suggestion-type-card"
                  [class.suggestion-type-card--selected]="typeForm.get('type')?.value === type.value"
                  (click)="selectType(type.value)">
                  <div class="suggestion-type-card__icon">
                    <i class="fa-solid" [ngClass]="type.icon" aria-hidden="true"></i>
                  </div>
                  <div class="suggestion-type-card__content">
                    <span class="suggestion-type-card__title">{{ type.labelKey | translate }}</span>
                    <span class="suggestion-type-card__desc">{{ type.descKey | translate }}</span>
                  </div>
                </div>
              }
            </div>
          </form>
          <div class="stepper-actions">
            <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
            <button mat-flat-button color="primary" matStepperNext [disabled]="!typeForm.valid">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </mat-step>

        <!-- Step 2: Select People -->
        <mat-step [stepControl]="peopleForm">
          <ng-template matStepLabel>{{ 'suggestion.selectPeople' | translate }}</ng-template>
          <form [formGroup]="peopleForm">
            <!-- Target Person -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ getTargetPersonLabel() | translate }}</mat-label>
              <input
                matInput
                [matAutocomplete]="targetAuto"
                formControlName="targetPersonSearch"
                (input)="searchTargetPerson($event)">
              <mat-autocomplete #targetAuto="matAutocomplete" (optionSelected)="selectTargetPerson($event)">
                @for (person of targetSearchResults(); track person.id) {
                  <mat-option [value]="person">
                    {{ getPersonDisplayName(person) }}
                    @if (person.birthDate) {
                      <span class="person-meta">({{ formatYear(person.birthDate) }})</span>
                    }
                  </mat-option>
                }
              </mat-autocomplete>
              @if (selectedTargetPerson()) {
                <mat-chip-row class="selected-person-chip" (removed)="clearTargetPerson()">
                  {{ getPersonDisplayName(selectedTargetPerson()!) }}
                  <button matChipRemove>
                    <mat-icon>cancel</mat-icon>
                  </button>
                </mat-chip-row>
              }
            </mat-form-field>

            <!-- Secondary Person (for certain types) -->
            @if (requiresSecondaryPerson()) {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ getSecondaryPersonLabel() | translate }}</mat-label>
                <input
                  matInput
                  [matAutocomplete]="secondaryAuto"
                  formControlName="secondaryPersonSearch"
                  (input)="searchSecondaryPerson($event)">
                <mat-autocomplete #secondaryAuto="matAutocomplete" (optionSelected)="selectSecondaryPerson($event)">
                  @for (person of secondarySearchResults(); track person.id) {
                    <mat-option [value]="person">
                      {{ getPersonDisplayName(person) }}
                      @if (person.birthDate) {
                        <span class="person-meta">({{ formatYear(person.birthDate) }})</span>
                      }
                    </mat-option>
                  }
                </mat-autocomplete>
                @if (selectedSecondaryPerson()) {
                  <mat-chip-row class="selected-person-chip" (removed)="clearSecondaryPerson()">
                    {{ getPersonDisplayName(selectedSecondaryPerson()!) }}
                    <button matChipRemove>
                      <mat-icon>cancel</mat-icon>
                    </button>
                  </mat-chip-row>
                }
              </mat-form-field>
            }
          </form>
          <div class="stepper-actions">
            <button mat-button matStepperPrevious>{{ 'common.back' | translate }}</button>
            <button mat-flat-button color="primary" matStepperNext [disabled]="!peopleForm.valid">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </mat-step>

        <!-- Step 3: Details and Rationale -->
        <mat-step [stepControl]="detailsForm">
          <ng-template matStepLabel>{{ 'suggestion.addDetails' | translate }}</ng-template>
          <form [formGroup]="detailsForm">
            <!-- Confidence Level -->
            <div class="form-section">
              <label class="form-section__label">{{ 'suggestion.confidenceLevel' | translate }}</label>
              <mat-radio-group formControlName="confidence" class="confidence-group">
                @for (level of confidenceLevels; track level.value) {
                  <mat-radio-button [value]="level.value" class="confidence-option">
                    <span class="confidence-label">{{ level.labelKey | translate }}</span>
                    <span class="confidence-desc">{{ level.descKey | translate }}</span>
                  </mat-radio-button>
                }
              </mat-radio-group>
            </div>

            <!-- Submitter Notes -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'suggestion.submitterNotes' | translate }}</mat-label>
              <textarea
                matInput
                formControlName="submitterNotes"
                rows="4"
                [placeholder]="'suggestion.submitterNotesPlaceholder' | translate">
              </textarea>
              <mat-hint>{{ 'suggestion.submitterNotesHint' | translate }}</mat-hint>
            </mat-form-field>

            <!-- Source -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'suggestion.source' | translate }}</mat-label>
              <input matInput formControlName="source" [placeholder]="'suggestion.sourcePlaceholder' | translate">
              <mat-hint>{{ 'suggestion.sourceHint' | translate }}</mat-hint>
            </mat-form-field>
          </form>
          <div class="stepper-actions">
            <button mat-button matStepperPrevious>{{ 'common.back' | translate }}</button>
            <button mat-flat-button color="primary" matStepperNext [disabled]="!detailsForm.valid">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </mat-step>

        <!-- Step 4: Review and Submit -->
        <mat-step>
          <ng-template matStepLabel>{{ 'suggestion.review' | translate }}</ng-template>
          <div class="review-summary">
            <div class="review-item">
              <span class="review-item__label">{{ 'suggestion.type' | translate }}:</span>
              <span class="review-item__value">{{ getTypeLabel(typeForm.get('type')?.value) | translate }}</span>
            </div>
            <div class="review-item">
              <span class="review-item__label">{{ getTargetPersonLabel() | translate }}:</span>
              <span class="review-item__value">{{ getPersonDisplayName(selectedTargetPerson()!) }}</span>
            </div>
            @if (selectedSecondaryPerson()) {
              <div class="review-item">
                <span class="review-item__label">{{ getSecondaryPersonLabel() | translate }}:</span>
                <span class="review-item__value">{{ getPersonDisplayName(selectedSecondaryPerson()!) }}</span>
              </div>
            }
            <div class="review-item">
              <span class="review-item__label">{{ 'suggestion.confidenceLevel' | translate }}:</span>
              <span class="review-item__value">{{ getConfidenceLabel(detailsForm.get('confidence')?.value) | translate }}</span>
            </div>
            @if (detailsForm.get('submitterNotes')?.value) {
              <div class="review-item review-item--full">
                <span class="review-item__label">{{ 'suggestion.submitterNotes' | translate }}:</span>
                <span class="review-item__value">{{ detailsForm.get('submitterNotes')?.value }}</span>
              </div>
            }
          </div>

          @if (duplicateWarning()) {
            <div class="duplicate-warning">
              <i class="fa-solid fa-exclamation-triangle" aria-hidden="true"></i>
              <span>{{ 'suggestion.duplicateWarning' | translate }}</span>
            </div>
          }

          <div class="stepper-actions">
            <button mat-button matStepperPrevious>{{ 'common.back' | translate }}</button>
            <button
              mat-flat-button
              color="primary"
              [disabled]="submitting()"
              (click)="submitSuggestion()">
              @if (submitting()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'suggestion.submit' | translate }}
              }
            </button>
          </div>
        </mat-step>
      </mat-stepper>
    </mat-dialog-content>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 400px;
      max-width: 600px;
      padding-bottom: 0;

      @media (max-width: 600px) {
        min-width: unset;
        width: 100%;
      }
    }

    .suggestion-type-grid {
      display: grid;
      gap: var(--ft-spacing-md);
      margin-bottom: var(--ft-spacing-lg);
    }

    .suggestion-type-card {
      display: flex;
      align-items: flex-start;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      background: white;
      border: 2px solid #F4E4D7;
      border-radius: var(--ft-radius-lg);
      cursor: pointer;
      transition: all var(--ft-transition-fast);

      &:hover {
        border-color: #187573;
        background: #F8FAFA;
      }

      &--selected {
        border-color: #187573;
        background: #E6F5F5;
      }

      &__icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #E6F5F5;
        flex-shrink: 0;

        i {
          color: #187573;
          font-size: 18px;
        }
      }

      &__content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      &__title {
        font-weight: 600;
        color: #2D2D2D;
      }

      &__desc {
        font-size: 0.813rem;
        color: #6B6B6B;
      }
    }

    .full-width {
      width: 100%;
      margin-bottom: var(--ft-spacing-md);
    }

    .form-section {
      margin-bottom: var(--ft-spacing-lg);

      &__label {
        display: block;
        font-weight: 500;
        margin-bottom: var(--ft-spacing-sm);
        color: #2D2D2D;
      }
    }

    .confidence-group {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-sm);
    }

    .confidence-option {
      padding: var(--ft-spacing-sm);
      border: 1px solid #F4E4D7;
      border-radius: var(--ft-radius-md);
      margin-bottom: var(--ft-spacing-xs);

      &:hover {
        background: #FFF9F5;
      }

      ::ng-deep .mdc-form-field {
        width: 100%;
      }

      .confidence-label {
        font-weight: 500;
        display: block;
      }

      .confidence-desc {
        font-size: 0.75rem;
        color: #6B6B6B;
        display: block;
        margin-top: 2px;
      }
    }

    .selected-person-chip {
      margin-top: var(--ft-spacing-xs);
    }

    .person-meta {
      color: #6B6B6B;
      font-size: 0.813rem;
      margin-inline-start: var(--ft-spacing-xs);
    }

    .stepper-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ft-spacing-sm);
      padding: var(--ft-spacing-md) 0;
      border-top: 1px solid #F4E4D7;
      margin-top: var(--ft-spacing-lg);
    }

    .review-summary {
      background: #FFF9F5;
      border-radius: var(--ft-radius-lg);
      padding: var(--ft-spacing-lg);
      margin-bottom: var(--ft-spacing-md);
    }

    .review-item {
      display: flex;
      gap: var(--ft-spacing-sm);
      margin-bottom: var(--ft-spacing-sm);

      &:last-child {
        margin-bottom: 0;
      }

      &--full {
        flex-direction: column;
      }

      &__label {
        font-weight: 500;
        color: #6B6B6B;
        min-width: 120px;
      }

      &__value {
        color: #2D2D2D;
      }
    }

    .duplicate-warning {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-sm);
      padding: var(--ft-spacing-md);
      background: #FEF3C7;
      border: 1px solid #F59E0B;
      border-radius: var(--ft-radius-md);
      color: #92400E;

      i {
        color: #F59E0B;
      }
    }

    mat-spinner {
      display: inline-block;
    }
  `]
})
export class SuggestionWizardDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<SuggestionWizardDialogComponent>);
  private readonly data = inject<SuggestionWizardData>(MAT_DIALOG_DATA);
  private readonly suggestionService = inject(SuggestionService);
  private readonly searchService = inject(PersonSearchService);
  private readonly treeContext = inject(TreeContextService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);

  readonly SuggestionType = SuggestionType;

  // Form groups
  typeForm: FormGroup;
  peopleForm: FormGroup;
  detailsForm: FormGroup;

  // Signals
  selectedTargetPerson = signal<SearchPersonItem | null>(null);
  selectedSecondaryPerson = signal<SearchPersonItem | null>(null);
  targetSearchResults = signal<SearchPersonItem[]>([]);
  secondarySearchResults = signal<SearchPersonItem[]>([]);
  submitting = signal(false);
  duplicateWarning = signal(false);

  // Type options - using actual SuggestionType enum values
  suggestionTypes = [
    {
      value: SuggestionType.AddParent,
      icon: 'fa-arrow-up',
      labelKey: 'suggestion.types.addParent',
      descKey: 'suggestion.types.addParentDesc'
    },
    {
      value: SuggestionType.AddChild,
      icon: 'fa-arrow-down',
      labelKey: 'suggestion.types.addChild',
      descKey: 'suggestion.types.addChildDesc'
    },
    {
      value: SuggestionType.AddSpouse,
      icon: 'fa-heart',
      labelKey: 'suggestion.types.addSpouse',
      descKey: 'suggestion.types.addSpouseDesc'
    },
    {
      value: SuggestionType.AddPerson,
      icon: 'fa-user-plus',
      labelKey: 'suggestion.types.addPerson',
      descKey: 'suggestion.types.addPersonDesc'
    },
    {
      value: SuggestionType.MergePerson,
      icon: 'fa-code-merge',
      labelKey: 'suggestion.types.mergePerson',
      descKey: 'suggestion.types.mergePersonDesc'
    },
    {
      value: SuggestionType.UpdatePerson,
      icon: 'fa-pen',
      labelKey: 'suggestion.types.updatePerson',
      descKey: 'suggestion.types.updatePersonDesc'
    }
  ];

  // Confidence options - using actual ConfidenceLevel enum values
  confidenceLevels = [
    {
      value: ConfidenceLevel.Certain,
      labelKey: 'suggestion.confidence.certain',
      descKey: 'suggestion.confidence.certainDesc'
    },
    {
      value: ConfidenceLevel.Probable,
      labelKey: 'suggestion.confidence.probable',
      descKey: 'suggestion.confidence.probableDesc'
    },
    {
      value: ConfidenceLevel.Possible,
      labelKey: 'suggestion.confidence.possible',
      descKey: 'suggestion.confidence.possibleDesc'
    },
    {
      value: ConfidenceLevel.Uncertain,
      labelKey: 'suggestion.confidence.uncertain',
      descKey: 'suggestion.confidence.uncertainDesc'
    }
  ];

  constructor() {
    this.typeForm = this.fb.group({
      type: [null, Validators.required]
    });

    this.peopleForm = this.fb.group({
      targetPersonId: ['', Validators.required],
      targetPersonSearch: [''],
      secondaryPersonId: [''],
      secondaryPersonSearch: ['']
    });

    this.detailsForm = this.fb.group({
      confidence: [ConfidenceLevel.Probable, Validators.required],
      submitterNotes: ['', [Validators.required, Validators.minLength(20)]],
      source: ['']
    });
  }

  ngOnInit(): void {
    // Pre-populate if data provided
    if (this.data?.targetPersonId) {
      this.peopleForm.patchValue({ targetPersonId: this.data.targetPersonId });
      // Load the person details
      this.loadPersonById(this.data.targetPersonId, 'target');
    }

    if (this.data?.preselectedType !== undefined) {
      this.typeForm.patchValue({ type: this.data.preselectedType });
    }

    // Update secondary person requirement when type changes
    this.typeForm.get('type')?.valueChanges.subscribe(type => {
      this.updateSecondaryPersonValidation(type);
    });
  }

  selectType(type: SuggestionType): void {
    this.typeForm.patchValue({ type });
  }

  requiresSecondaryPerson(): boolean {
    const type = this.typeForm.get('type')?.value;
    return type === SuggestionType.AddParent ||
           type === SuggestionType.AddChild ||
           type === SuggestionType.AddSpouse ||
           type === SuggestionType.MergePerson;
  }

  getTargetPersonLabel(): string {
    const type = this.typeForm.get('type')?.value;
    switch (type) {
      case SuggestionType.AddParent:
        return 'suggestion.labels.child';
      case SuggestionType.AddChild:
        return 'suggestion.labels.parent';
      case SuggestionType.AddSpouse:
        return 'suggestion.labels.person';
      case SuggestionType.MergePerson:
        return 'suggestion.labels.keepPerson';
      case SuggestionType.UpdatePerson:
        return 'suggestion.labels.personToUpdate';
      case SuggestionType.AddPerson:
        return 'suggestion.labels.relatedPerson';
      default:
        return 'suggestion.labels.person';
    }
  }

  getSecondaryPersonLabel(): string {
    const type = this.typeForm.get('type')?.value;
    switch (type) {
      case SuggestionType.AddParent:
        return 'suggestion.labels.parentToAdd';
      case SuggestionType.AddChild:
        return 'suggestion.labels.childToAdd';
      case SuggestionType.AddSpouse:
        return 'suggestion.labels.spouseToAdd';
      case SuggestionType.MergePerson:
        return 'suggestion.labels.duplicatePerson';
      default:
        return 'suggestion.labels.relatedPerson';
    }
  }

  searchTargetPerson(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    if (query.length < 2) {
      this.targetSearchResults.set([]);
      return;
    }

    this.searchService.search({ query, pageSize: 10 }).subscribe({
      next: (response) => {
        this.targetSearchResults.set(response.items);
      }
    });
  }

  searchSecondaryPerson(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    if (query.length < 2) {
      this.secondarySearchResults.set([]);
      return;
    }

    this.searchService.search({ query, pageSize: 10 }).subscribe({
      next: (response) => {
        // Filter out the target person
        const filtered = response.items.filter(p => p.id !== this.selectedTargetPerson()?.id);
        this.secondarySearchResults.set(filtered);
      }
    });
  }

  selectTargetPerson(event: any): void {
    const person = event.option.value as SearchPersonItem;
    this.selectedTargetPerson.set(person);
    this.peopleForm.patchValue({
      targetPersonId: person.id,
      targetPersonSearch: ''
    });
    this.targetSearchResults.set([]);
    this.checkForDuplicate();
  }

  selectSecondaryPerson(event: any): void {
    const person = event.option.value as SearchPersonItem;
    this.selectedSecondaryPerson.set(person);
    this.peopleForm.patchValue({
      secondaryPersonId: person.id,
      secondaryPersonSearch: ''
    });
    this.secondarySearchResults.set([]);
    this.checkForDuplicate();
  }

  clearTargetPerson(): void {
    this.selectedTargetPerson.set(null);
    this.peopleForm.patchValue({ targetPersonId: '', targetPersonSearch: '' });
  }

  clearSecondaryPerson(): void {
    this.selectedSecondaryPerson.set(null);
    this.peopleForm.patchValue({ secondaryPersonId: '', secondaryPersonSearch: '' });
  }

  // Get full lineage name (Person + Father + Grandfather) plus Tree and Town
  getPersonDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    const parts: string[] = [];

    // Get person's name based on language
    let name: string | null = null;
    let fatherName: string | null = null;
    let grandfatherName: string | null = null;

    if (lang === 'ar') {
      name = person.nameArabic || person.nameEnglish || person.primaryName;
      fatherName = person.fatherNameArabic || person.fatherNameEnglish;
      grandfatherName = person.grandfatherNameArabic || person.grandfatherNameEnglish;
    } else if (lang === 'nob') {
      name = person.nameNobiin || person.nameEnglish || person.primaryName;
      fatherName = person.fatherNameNobiin || person.fatherNameEnglish;
      grandfatherName = person.grandfatherNameNobiin || person.grandfatherNameEnglish;
    } else {
      name = person.nameEnglish || person.nameArabic || person.primaryName;
      fatherName = person.fatherNameEnglish || person.fatherNameArabic;
      grandfatherName = person.grandfatherNameEnglish || person.grandfatherNameArabic;
    }

    // Build lineage string
    if (name) parts.push(name);
    if (fatherName) parts.push(fatherName);
    if (grandfatherName) parts.push(grandfatherName);

    let result = parts.join(' ') || unknown;

    // Add tree name if available
    if (person.treeName) {
      result += ` - (${person.treeName})`;
    }

    // Add location name (language-aware) if available
    const locationName = this.getLocationDisplayName(person);
    if (locationName) {
      result += ` - (${locationName})`;
    }

    return result;
  }

  // Get location name (town or country fallback) based on current language
  getLocationDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();

    // Try town first
    let townName = '';
    if (lang === 'ar') {
      townName = person.townNameAr || person.townNameEn || person.townName || '';
    } else if (lang === 'nob') {
      townName = person.townName || person.townNameEn || person.townNameAr || '';
    } else {
      townName = person.townNameEn || person.townName || person.townNameAr || '';
    }

    if (townName) return townName;

    // Fallback to country
    if (lang === 'ar') {
      return person.countryNameAr || person.countryNameEn || '';
    }
    return person.countryNameEn || person.countryNameAr || '';
  }

  formatYear(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }

  getTypeLabel(type: SuggestionType): string {
    const found = this.suggestionTypes.find(t => t.value === type);
    return found?.labelKey || 'common.unknown';
  }

  getConfidenceLabel(level: ConfidenceLevel): string {
    const found = this.confidenceLevels.find(l => l.value === level);
    return found?.labelKey || 'common.unknown';
  }

  private updateSecondaryPersonValidation(type: SuggestionType): void {
    const secondaryControl = this.peopleForm.get('secondaryPersonId');
    if (this.requiresSecondaryPerson()) {
      secondaryControl?.setValidators(Validators.required);
    } else {
      secondaryControl?.clearValidators();
    }
    secondaryControl?.updateValueAndValidity();
  }

  private loadPersonById(personId: string, type: 'target' | 'secondary'): void {
    // Search for the person by ID using the search API
    this.searchService.search({ query: personId, pageSize: 1 }).subscribe({
      next: (response) => {
        const person = response.items.find(p => p.id === personId);
        if (person) {
          if (type === 'target') {
            this.selectedTargetPerson.set(person);
          } else {
            this.selectedSecondaryPerson.set(person);
          }
        }
      }
    });
  }

  private checkForDuplicate(): void {
    const type = this.typeForm.get('type')?.value;
    const targetId = this.peopleForm.get('targetPersonId')?.value;
    const secondaryId = this.peopleForm.get('secondaryPersonId')?.value;
    const treeId = this.treeContext.effectiveTreeId();

    if (!treeId || !type || !targetId) {
      this.duplicateWarning.set(false);
      return;
    }

    this.suggestionService.checkDuplicate(treeId, type, targetId, secondaryId || undefined).subscribe({
      next: (response) => {
        this.duplicateWarning.set(response.hasDuplicate);
      }
    });
  }

  submitSuggestion(): void {
    if (this.submitting()) return;

    const treeId = this.treeContext.effectiveTreeId();
    if (!treeId) {
      this.snackBar.open(this.i18n.t('suggestion.noTreeSelected'), this.i18n.t('common.close'), { duration: 3000 });
      return;
    }

    const request: CreateSuggestionRequest = {
      treeId,
      type: this.typeForm.get('type')?.value,
      targetPersonId: this.peopleForm.get('targetPersonId')?.value || undefined,
      secondaryPersonId: this.peopleForm.get('secondaryPersonId')?.value || undefined,
      confidence: this.detailsForm.get('confidence')?.value,
      submitterNotes: this.detailsForm.get('submitterNotes')?.value
    };

    this.submitting.set(true);

    this.suggestionService.createSuggestion(request).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.snackBar.open(
          this.i18n.t('suggestion.createSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.dialogRef.close(result);
      },
      error: (err) => {
        this.submitting.set(false);
        console.error('Failed to create suggestion:', err);
        this.snackBar.open(
          this.i18n.t('suggestion.createError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }
}
