import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

import { PersonService } from '../../core/services/person.service';
import { CountriesService, Country } from '../../core/services/countries.service';
import { TransliterationService } from '../../core/services/transliteration.service';
import { FamilyService } from '../../core/services/family.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyListItem } from '../../core/models/family.models';
import {
  Person,
  PersonListItem,
  Sex,
  NameType,
  DatePrecision,
  PrivacyLevel,
  CreatePersonRequest,
  UpdatePersonRequest
} from '../../core/models/person.models';

export interface PersonFormDialogData {
  person?: PersonListItem | Person;
}

@Component({
  selector: 'app-person-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatExpansionModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
    TranslatePipe
  ],
  template: `
    <div class="person-form-dialog">
      <!-- Header -->
      <div class="person-form-dialog__header">
        <h2 class="person-form-dialog__title">
          {{ (data.person ? 'people.editPerson' : 'people.addPerson') | translate }}
        </h2>
        <button mat-icon-button (click)="onCancel()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      
      <!-- Form -->
      <form [formGroup]="form" class="person-form-dialog__content">
        <mat-tab-group animationDuration="200ms">
          <!-- Basic Info Tab -->
          <mat-tab [label]="'personForm.basicInfo' | translate">
            <div class="form-tab-content">
              <!-- Primary Name -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.fullName' | translate }} *</mat-label>
                <input matInput formControlName="primaryName" autocomplete="name">
                @if (form.get('primaryName')?.hasError('required')) {
                  <mat-error>{{ 'common.required' | translate }}</mat-error>
                }
              </mat-form-field>
              
              <!-- Sex -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.sex' | translate }}</mat-label>
                <mat-select formControlName="sex">
                  <mat-option [value]="Sex.Male">
                    <i class="fa-solid fa-mars" aria-hidden="true"></i>
                    {{ 'people.male' | translate }}
                  </mat-option>
                  <mat-option [value]="Sex.Female">
                    <i class="fa-solid fa-venus" aria-hidden="true"></i>
                    {{ 'people.female' | translate }}
                  </mat-option>
                </mat-select>
              </mat-form-field>
              
              <!-- Is Living Toggle -->
              <div class="form-field-toggle">
                <mat-slide-toggle formControlName="isLiving" color="primary">
                  {{ 'personForm.isLiving' | translate }}
                </mat-slide-toggle>
              </div>

              <!-- Family Group -->
              @if (families().length > 0) {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'personForm.family' | translate }}</mat-label>
                  <mat-select formControlName="familyId">
                    <mat-option [value]="null">
                      <i class="fa-solid fa-circle-minus" aria-hidden="true"></i>
                      {{ 'personForm.noFamily' | translate }}
                    </mat-option>
                    @for (family of families(); track family.id) {
                      <mat-option [value]="family.id">
                        @if (family.color) {
                          <span class="family-color" [style.background-color]="family.color"></span>
                        }
                        {{ getLocalizedFamilyName(family) }}
                      </mat-option>
                    }
                  </mat-select>
                  <i class="fa-solid fa-people-group" matSuffix aria-hidden="true"></i>
                </mat-form-field>
              }

              <!-- Privacy Level -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.privacy' | translate }}</mat-label>
                <mat-select formControlName="privacyLevel">
                  <mat-option [value]="PrivacyLevel.Public">
                    <i class="fa-solid fa-globe" aria-hidden="true"></i>
                    {{ 'personForm.privacyPublic' | translate }}
                  </mat-option>
                  <mat-option [value]="PrivacyLevel.Family">
                    <i class="fa-solid fa-people-roof" aria-hidden="true"></i>
                    {{ 'personForm.privacyFamily' | translate }}
                  </mat-option>
                  <mat-option [value]="PrivacyLevel.Private">
                    <i class="fa-solid fa-lock" aria-hidden="true"></i>
                    {{ 'personForm.privacyPrivate' | translate }}
                  </mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </mat-tab>
          
          <!-- Life Events Tab -->
          <mat-tab [label]="'personForm.lifeEvents' | translate">
            <div class="form-tab-content">
              <!-- Birth Section -->
              <div class="form-section">
                <h4 class="form-section__title">
                  <i class="fa-solid fa-cake-candles" aria-hidden="true"></i>
                  {{ 'people.born' | translate }}
                </h4>
                
                <div class="form-row">
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{ 'personForm.birthDate' | translate }}</mat-label>
                    <input matInput [matDatepicker]="birthPicker" formControlName="birthDate">
                    <mat-datepicker-toggle matSuffix [for]="birthPicker"></mat-datepicker-toggle>
                    <mat-datepicker #birthPicker></mat-datepicker>
                  </mat-form-field>
                  
                  <mat-form-field appearance="outline" class="precision-field">
                    <mat-select formControlName="birthPrecision">
                      <mat-option [value]="DatePrecision.Exact">Exact</mat-option>
                      <mat-option [value]="DatePrecision.About">About</mat-option>
                      <mat-option [value]="DatePrecision.Before">Before</mat-option>
                      <mat-option [value]="DatePrecision.After">After</mat-option>
                      <mat-option [value]="DatePrecision.Unknown">Unknown</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>
                
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'personForm.birthPlace' | translate }}</mat-label>
                  <input matInput formControlName="birthPlace" autocomplete="off">
                  <i class="fa-solid fa-location-dot" matSuffix aria-hidden="true"></i>
                </mat-form-field>
              </div>
              
              <!-- Death Section -->
              @if (!form.get('isLiving')?.value) {
                <div class="form-section">
                  <h4 class="form-section__title">
                    <i class="fa-solid fa-clock" aria-hidden="true"></i>
                    {{ 'people.died' | translate }}
                  </h4>
                  
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="flex-1">
                      <mat-label>{{ 'personForm.deathDate' | translate }}</mat-label>
                      <input matInput [matDatepicker]="deathPicker" formControlName="deathDate">
                      <mat-datepicker-toggle matSuffix [for]="deathPicker"></mat-datepicker-toggle>
                      <mat-datepicker #deathPicker></mat-datepicker>
                    </mat-form-field>
                    
                    <mat-form-field appearance="outline" class="precision-field">
                      <mat-select formControlName="deathPrecision">
                        <mat-option [value]="DatePrecision.Exact">Exact</mat-option>
                        <mat-option [value]="DatePrecision.About">About</mat-option>
                        <mat-option [value]="DatePrecision.Before">Before</mat-option>
                        <mat-option [value]="DatePrecision.After">After</mat-option>
                        <mat-option [value]="DatePrecision.Unknown">Unknown</mat-option>
                      </mat-select>
                    </mat-form-field>
                  </div>
                  
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ 'personForm.deathPlace' | translate }}</mat-label>
                    <input matInput formControlName="deathPlace" autocomplete="off">
                    <i class="fa-solid fa-location-dot" matSuffix aria-hidden="true"></i>
                  </mat-form-field>
                </div>
              }
            </div>
          </mat-tab>
          
          <!-- Additional Info Tab -->
          <mat-tab [label]="'personForm.additionalInfo' | translate">
            <div class="form-tab-content">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.occupation' | translate }}</mat-label>
                <input matInput formControlName="occupation">
                <i class="fa-solid fa-briefcase" matSuffix aria-hidden="true"></i>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.education' | translate }}</mat-label>
                <input matInput formControlName="education">
                <i class="fa-solid fa-graduation-cap" matSuffix aria-hidden="true"></i>
              </mat-form-field>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.religion' | translate }}</mat-label>
                <input matInput formControlName="religion">
              </mat-form-field>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.nationality' | translate }}</mat-label>
                @if (getSelectedCountryFlag()) {
                  <span matPrefix class="selected-flag">{{ getSelectedCountryFlag() }}</span>
                }
                <input matInput
                       formControlName="nationality"
                       [matAutocomplete]="countryAuto"
                       (input)="onNationalityInput($event)">
                <mat-autocomplete #countryAuto="matAutocomplete"
                                  [displayWith]="displayCountry"
                                  autoActiveFirstOption>
                  @for (country of filteredCountries(); track country.code) {
                    <mat-option [value]="country">
                      <span class="country-option">
                        <span class="country-flag">{{ getCountryFlag(country.code) }}</span>
                        <span class="country-name">{{ getCountryDisplayName(country) }}</span>
                      </span>
                    </mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.notes' | translate }}</mat-label>
                <textarea matInput formControlName="notes" rows="4"></textarea>
              </mat-form-field>
            </div>
          </mat-tab>
          
          <!-- Names Tab -->
          <mat-tab [label]="'personForm.names' | translate">
            <div class="form-tab-content">
              <p class="names-hint">{{ 'personForm.namesHint' | translate }}</p>

              <!-- Arabic Name -->
              <mat-form-field appearance="outline" class="full-width name-field-arabic">
                <mat-label>الاسم بالعربية (Arabic Name)</mat-label>
                <input matInput formControlName="nameArabic" dir="rtl"
                       (blur)="onArabicNameBlur()">
                <i class="fa-solid fa-font" matSuffix aria-hidden="true"></i>
              </mat-form-field>

              <!-- English Name -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Name in English</mat-label>
                <input matInput formControlName="nameEnglish"
                       (blur)="onEnglishNameBlur()">
                <i class="fa-solid fa-font" matSuffix aria-hidden="true"></i>
              </mat-form-field>

              <!-- Nobiin Name -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>ⲣⲁⲛ ⲛⲟⲃⲓⲓⲛ (Nobiin Name)</mat-label>
                <input matInput formControlName="nameNobiin">
                <i class="fa-solid fa-font" matSuffix aria-hidden="true"></i>
                <mat-hint>{{ 'personForm.nobiinOptional' | translate }}</mat-hint>
              </mat-form-field>

              <!-- Transliterate Button -->
              <div class="transliterate-actions">
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  (click)="transliterateAllNames()"
                  [disabled]="transliterating() !== null || !hasAnyNameToTransliterate()">
                  @if (transliterating() !== null) {
                    <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                    <i class="fa-solid fa-language" aria-hidden="true"></i>
                  }
                  {{ 'personForm.autoFillNames' | translate }}
                </button>
                <span class="transliterate-hint">{{ 'personForm.autoFillHint' | translate }}</span>
              </div>
            </div>
          </mat-tab>
        </mat-tab-group>
      </form>
      
      <!-- Actions -->
      <div class="person-form-dialog__actions">
        <button mat-button (click)="onCancel()">
          {{ 'common.cancel' | translate }}
        </button>
        <button 
          mat-flat-button 
          color="primary" 
          (click)="onSave()"
          [disabled]="saving() || form.invalid">
          @if (saving()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <ng-container>
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
              {{ 'common.save' | translate }}
            </ng-container>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .person-form-dialog {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 90vh;
      
      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ft-spacing-md);
        border-bottom: 1px solid var(--ft-divider);
        position: sticky;
        top: 0;
        background: var(--ft-surface);
        z-index: 1;
      }
      
      &__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      
      &__content {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      &__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-md);
        border-top: 1px solid var(--ft-divider);
        position: sticky;
        bottom: 0;
        background: var(--ft-surface);
        
        button {
          min-height: var(--ft-touch-target);
        }
      }
    }
    
    .form-tab-content {
      padding: var(--ft-spacing-md);
    }
    
    .full-width {
      width: 100%;
    }
    
    .flex-1 {
      flex: 1;
    }
    
    .form-row {
      display: flex;
      gap: var(--ft-spacing-md);
      
      @media (max-width: 500px) {
        flex-direction: column;
        gap: 0;
      }
    }
    
    .precision-field {
      width: 120px;
      
      @media (max-width: 500px) {
        width: 100%;
      }
    }
    
    .form-field-toggle {
      margin-bottom: var(--ft-spacing-md);
    }
    
    .form-section {
      margin-bottom: var(--ft-spacing-lg);
      
      &__title {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        margin: 0 0 var(--ft-spacing-md);
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ft-on-surface-variant);
        
        i.fa-solid {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }
    
    .name-panel {
      margin-bottom: var(--ft-spacing-md);
    }
    
    .name-form-content {
      padding-top: var(--ft-spacing-md);
    }
    
    .name-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: var(--ft-spacing-sm);
    }
    
    .names-hint {
      color: var(--ft-on-surface-variant);
      font-size: 0.875rem;
      margin-bottom: var(--ft-spacing-md);
    }

    .name-field-arabic input {
      font-family: 'Noto Naskh Arabic', 'Arabic Typesetting', serif;
      font-size: 1.1em;
    }

    .transliterate-actions {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-md);
      margin-top: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      background: var(--ft-surface-variant);
      border-radius: 8px;
    }

    .transliterate-hint {
      color: var(--ft-on-surface-variant);
      font-size: 0.75rem;
    }

    .family-color {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    ::ng-deep .mat-mdc-tab-body-wrapper {
      flex: 1;
    }
    
    mat-spinner {
      display: inline-block;
    }

    .country-option {
      display: flex;
      align-items: center;
      gap: 8px;

      .country-flag {
        font-size: 1.2em;
        line-height: 1;
      }

      .country-name {
        flex: 1;
      }
    }

    .selected-flag {
      font-size: 1.2em;
      margin-right: 8px;
    }
  `]
})
export class PersonFormDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly personService = inject(PersonService);
  private readonly transliterationService = inject(TransliterationService);
  private readonly familyService = inject(FamilyService);
  private readonly treeContext = inject(TreeContextService);
  private readonly countriesService = inject(CountriesService);
  private readonly i18n = inject(I18nService);
  private readonly dialogRef = inject(MatDialogRef<PersonFormDialogComponent>);
  readonly data = inject<PersonFormDialogData>(MAT_DIALOG_DATA);

  // Expose enums to template
  readonly Sex = Sex;
  readonly NameType = NameType;
  readonly DatePrecision = DatePrecision;
  readonly PrivacyLevel = PrivacyLevel;

  form!: FormGroup;
  saving = signal(false);
  transliterating = signal<'arabic' | 'english' | 'all' | null>(null);
  families = signal<FamilyListItem[]>([]);
  countries = signal<Country[]>([]);
  filteredCountries = signal<Country[]>([]);
  
  ngOnInit(): void {
    this.initForm();
    this.loadFamilies();
    this.loadCountries();

    if (this.data.person) {
      this.loadPersonDetails();
    }
  }

  private loadCountries(): void {
    this.countriesService.getCountries().subscribe({
      next: (countries) => {
        this.countries.set(countries);
        this.filteredCountries.set(countries);
      },
      error: (err) => console.error('Failed to load countries:', err)
    });
  }

  private loadFamilies(): void {
    const currentTree = this.treeContext.selectedTree();
    if (currentTree) {
      this.familyService.getFamiliesByTree(currentTree.id).subscribe({
        next: (families) => this.families.set(families),
        error: (err) => console.error('Failed to load families:', err)
      });
    }
  }
  
  private initForm(): void {
    this.form = this.fb.group({
      primaryName: ['', Validators.required],
      nameArabic: [''],
      nameEnglish: [''],
      nameNobiin: [''],
      sex: [Sex.Male],
      isLiving: [true],
      familyId: [null],
      privacyLevel: [PrivacyLevel.Family],
      birthDate: [null],
      birthPrecision: [DatePrecision.Exact],
      birthPlace: [''],
      deathDate: [null],
      deathPrecision: [DatePrecision.Exact],
      deathPlace: [''],
      occupation: [''],
      education: [''],
      religion: [''],
      nationality: [''],
      notes: ['']
    });
  }
  
  private loadPersonDetails(): void {
    if (!this.data.person) return;
    
    // If we only have PersonListItem, load full person
    if (!('names' in this.data.person)) {
      this.personService.getPerson(this.data.person.id).subscribe({
        next: (person) => this.patchForm(person),
        error: (err) => console.error('Failed to load person details:', err)
      });
    } else {
      this.patchForm(this.data.person as Person);
    }
  }
  
  private patchForm(person: Person): void {
    this.form.patchValue({
      primaryName: person.primaryName || '',
      nameArabic: person.nameArabic || '',
      nameEnglish: person.nameEnglish || '',
      nameNobiin: person.nameNobiin || '',
      sex: person.sex,
      isLiving: !person.deathDate,
      familyId: person.familyId || null,
      privacyLevel: person.privacyLevel,
      birthDate: person.birthDate ? new Date(person.birthDate) : null,
      birthPrecision: person.birthPrecision,
      birthPlace: person.birthPlace || '',
      deathDate: person.deathDate ? new Date(person.deathDate) : null,
      deathPrecision: person.deathPrecision,
      deathPlace: person.deathPlace || '',
      occupation: person.occupation || '',
      education: person.education || '',
      religion: person.religion || '',
      nationality: person.nationality || '',
      notes: person.notes || ''
    });
  }
  
  hasAnyNameToTransliterate(): boolean {
    const formValue = this.form.value;
    return !!(formValue.nameArabic || formValue.nameEnglish);
  }

  onArabicNameBlur(): void {
    // Auto-fill English if Arabic was entered and English is empty
    const arabicName = this.form.get('nameArabic')?.value;
    const englishName = this.form.get('nameEnglish')?.value;

    if (arabicName && !englishName) {
      this.transliterateFromArabic();
    }
  }

  onEnglishNameBlur(): void {
    // Auto-fill Arabic if English was entered and Arabic is empty
    const arabicName = this.form.get('nameArabic')?.value;
    const englishName = this.form.get('nameEnglish')?.value;

    if (englishName && !arabicName) {
      this.transliterateFromEnglish();
    }
  }

  private transliterateFromArabic(): void {
    const arabicName = this.form.get('nameArabic')?.value;
    if (!arabicName?.trim()) return;

    this.transliterating.set('arabic');

    this.transliterationService.transliterate({
      inputName: arabicName,
      sourceLanguage: 'ar',
      displayLanguage: this.i18n.currentLang() as 'en' | 'ar' | 'nob'
    }).subscribe({
      next: (result) => {
        this.transliterating.set(null);

        // Fill in English if empty
        if (!this.form.get('nameEnglish')?.value && result.english?.best) {
          this.form.patchValue({ nameEnglish: result.english.best });
        }

        // Fill in Nobiin if empty
        if (!this.form.get('nameNobiin')?.value && result.nobiin?.value) {
          this.form.patchValue({ nameNobiin: result.nobiin.value });
        }
      },
      error: () => this.transliterating.set(null)
    });
  }

  private transliterateFromEnglish(): void {
    const englishName = this.form.get('nameEnglish')?.value;
    if (!englishName?.trim()) return;

    this.transliterating.set('english');

    this.transliterationService.transliterate({
      inputName: englishName,
      sourceLanguage: 'en',
      displayLanguage: this.i18n.currentLang() as 'en' | 'ar' | 'nob'
    }).subscribe({
      next: (result) => {
        this.transliterating.set(null);

        // Fill in Arabic if empty
        if (!this.form.get('nameArabic')?.value && result.arabic) {
          this.form.patchValue({ nameArabic: result.arabic });
        }

        // Fill in Nobiin if empty
        if (!this.form.get('nameNobiin')?.value && result.nobiin?.value) {
          this.form.patchValue({ nameNobiin: result.nobiin.value });
        }
      },
      error: () => this.transliterating.set(null)
    });
  }

  transliterateAllNames(): void {
    const arabicName = this.form.get('nameArabic')?.value;
    const englishName = this.form.get('nameEnglish')?.value;

    // Prefer transliterating from Arabic if available
    if (arabicName?.trim()) {
      this.transliterateFromArabic();
    } else if (englishName?.trim()) {
      this.transliterateFromEnglish();
    }
  }
  
  onCancel(): void {
    this.dialogRef.close(false);
  }
  
  onSave(): void {
    if (this.form.invalid) return;

    this.saving.set(true);
    const formValue = this.form.value;

    const operation = this.data.person
      ? this.personService.updatePerson(this.data.person.id, this.buildUpdateRequest(formValue))
      : this.personService.createPerson(this.buildCreateRequest(formValue));

    operation.subscribe({
      next: (person) => {
        this.saving.set(false);
        this.dialogRef.close(person);
      },
      error: (error) => {
        console.error('Failed to save person:', error);
        this.saving.set(false);
      }
    });
  }

  private buildCreateRequest(formValue: any): CreatePersonRequest {
    return {
      primaryName: formValue.primaryName,
      nameArabic: formValue.nameArabic || undefined,
      nameEnglish: formValue.nameEnglish || undefined,
      nameNobiin: formValue.nameNobiin || undefined,
      sex: formValue.sex,
      familyId: formValue.familyId || undefined,
      privacyLevel: formValue.privacyLevel,
      birthDate: formValue.birthDate ? this.formatDateForApi(formValue.birthDate) : undefined,
      birthPrecision: formValue.birthPrecision,
      deathDate: !formValue.isLiving && formValue.deathDate
        ? this.formatDateForApi(formValue.deathDate)
        : undefined,
      deathPrecision: formValue.deathPrecision,
      occupation: formValue.occupation || undefined,
      education: formValue.education || undefined,
      religion: formValue.religion || undefined,
      nationality: this.extractNationalityCode(formValue.nationality),
      notes: formValue.notes || undefined
    };
  }

  private buildUpdateRequest(formValue: any): UpdatePersonRequest {
    return {
      primaryName: formValue.primaryName,
      nameArabic: formValue.nameArabic || undefined,
      nameEnglish: formValue.nameEnglish || undefined,
      nameNobiin: formValue.nameNobiin || undefined,
      sex: formValue.sex,
      familyId: formValue.familyId || undefined,
      privacyLevel: formValue.privacyLevel,
      birthDate: formValue.birthDate ? this.formatDateForApi(formValue.birthDate) : undefined,
      birthPrecision: formValue.birthPrecision,
      deathDate: !formValue.isLiving && formValue.deathDate
        ? this.formatDateForApi(formValue.deathDate)
        : undefined,
      deathPrecision: formValue.deathPrecision,
      occupation: formValue.occupation || undefined,
      education: formValue.education || undefined,
      religion: formValue.religion || undefined,
      nationality: this.extractNationalityCode(formValue.nationality),
      notes: formValue.notes || undefined
    };
  }

  private extractNationalityCode(value: Country | string | null | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'object' && value.code) {
      return value.code;
    }
    if (typeof value === 'string') {
      return value || undefined;
    }
    return undefined;
  }
  
  private formatDateForApi(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  getLocalizedFamilyName(family: FamilyListItem): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return family.nameAr || family.name;
      case 'nob':
        return family.nameLocal || family.name;
      case 'en':
      default:
        return family.nameEn || family.name;
    }
  }

  // Country autocomplete methods
  onNationalityInput(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    const filtered = this.countriesService.filterCountries(input, this.countries());
    this.filteredCountries.set(filtered);
  }

  displayCountry = (value: Country | string | null): string => {
    if (!value) return '';
    if (typeof value === 'string') {
      // If it's a code, find the country
      const found = this.countries().find(c => c.code === value);
      return found ? this.getCountryDisplayName(found) : value;
    }
    return this.getCountryDisplayName(value);
  };

  getCountryDisplayName(country: Country): string {
    return this.countriesService.getCountryDisplayName(country);
  }

  getCountryFlag(countryCode: string): string {
    return this.countriesService.getCountryFlag(countryCode);
  }

  getSelectedCountryFlag(): string {
    const value = this.form.get('nationality')?.value;
    if (!value) return '';
    if (typeof value === 'object' && value.code) {
      return this.getCountryFlag(value.code);
    }
    if (typeof value === 'string' && value.length === 2) {
      return this.getCountryFlag(value);
    }
    return '';
  }
}