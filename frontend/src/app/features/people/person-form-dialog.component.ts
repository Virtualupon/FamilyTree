import { Component, inject, OnInit, signal, computed } from '@angular/core';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PersonService } from '../../core/services/person.service';
import { CountriesService, Country } from '../../core/services/countries.service';
import { TransliterationService } from '../../core/services/transliteration.service';
import { TranslationService } from '../../core/services/translation.service';
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
  treeId?: string;
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
    MatSnackBarModule,
    TranslatePipe
  ],
  templateUrl: './person-form-dialog.component.html',
  styleUrls: ['./person-form-dialog.component.scss']
})
export class PersonFormDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly personService = inject(PersonService);
  private readonly transliterationService = inject(TransliterationService);
  private readonly translationService = inject(TranslationService);
  private readonly familyService = inject(FamilyService);
  private readonly treeContext = inject(TreeContextService);
  private readonly countriesService = inject(CountriesService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);
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
  translatingNotes = signal(false);
  translationStatus = signal<'idle' | 'translating' | 'success' | 'error'>('idle');
  families = signal<FamilyListItem[]>([]);
  countries = signal<Country[]>([]);
  filteredCountries = signal<Country[]>([]);

  // Get the notes field name based on current language
  currentNotesField = computed(() => {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar': return 'notesAr';
      case 'nob': return 'notesNob';
      default: return 'notes';
    }
  });

  // Get current notes value for display
  currentNotesValue = computed(() => {
    if (!this.form) return '';
    const field = this.currentNotesField();
    return this.form.get(field)?.value || '';
  });
  
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
      // Keep all three for backend compatibility
      notes: [''],
      notesAr: [''],
      notesNob: [''],
      // Single field for user input (based on current language)
      currentNotes: ['']
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
    // Get the notes value for the current language
    const lang = this.i18n.currentLang();
    let currentLangNotes = '';
    switch (lang) {
      case 'ar':
        currentLangNotes = person.notesAr || person.notes || '';
        break;
      case 'nob':
        currentLangNotes = person.notesNob || person.notes || '';
        break;
      default:
        currentLangNotes = person.notes || '';
    }

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
      // Store all notes but only display current language
      notes: person.notes || '',
      notesAr: person.notesAr || '',
      notesNob: person.notesNob || '',
      // Single notes field for current language
      currentNotes: currentLangNotes
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

  /**
   * Check if there are any notes to translate from
   */
  hasAnyNotesToTranslate(): boolean {
    const formValue = this.form.value;
    return !!(formValue.notes || formValue.notesAr || formValue.notesNob);
  }

  /**
   * Auto-translate notes to all three languages using the translation service.
   * Uses English as source if available, otherwise Arabic, otherwise Nobiin.
   * Always overwrites the other two language fields with fresh translations.
   */
  autoTranslateNotes(): void {
    const notes = this.form.get('notes')?.value?.trim();
    const notesAr = this.form.get('notesAr')?.value?.trim();
    const notesNob = this.form.get('notesNob')?.value?.trim();

    // Determine source text - prefer English, then Arabic, then Nobiin
    const sourceText = notes || notesAr || notesNob;
    if (!sourceText) return;

    // Determine which field is the source (to avoid overwriting it)
    const sourceIsEnglish = !!notes;
    const sourceIsArabic = !notes && !!notesAr;

    this.translatingNotes.set(true);

    this.translationService.translateToAll(sourceText).subscribe({
      next: (result) => {
        this.translatingNotes.set(false);

        if (result.success) {
          // Always fill target fields (don't overwrite the source field)
          if (!sourceIsEnglish && result.english) {
            this.form.patchValue({ notes: result.english });
          }
          if (!sourceIsArabic && result.arabic) {
            this.form.patchValue({ notesAr: result.arabic });
          }
          if ((sourceIsEnglish || sourceIsArabic) && result.nobiin) {
            this.form.patchValue({ notesNob: result.nobiin });
          }
        }
      },
      error: () => this.translatingNotes.set(false)
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
  
  onSave(): void {
    if (this.form.invalid) return;

    this.saving.set(true);
    const formValue = this.form.value;

    // First, sync currentNotes to the appropriate language field
    const currentNotes = formValue.currentNotes?.trim();
    const lang = this.i18n.currentLang();

    // Update the correct notes field based on current language
    switch (lang) {
      case 'ar':
        this.form.patchValue({ notesAr: currentNotes });
        break;
      case 'nob':
        this.form.patchValue({ notesNob: currentNotes });
        break;
      default:
        this.form.patchValue({ notes: currentNotes });
    }

    // If there are notes, translate to other languages in background
    if (currentNotes) {
      this.translateAndSave(formValue, currentNotes, lang);
    } else {
      this.savePersonDirectly(formValue);
    }
  }

  /**
   * Translate notes and save person
   */
  private translateAndSave(formValue: any, sourceText: string, sourceLang: string): void {
    this.translationStatus.set('translating');

    this.translationService.translateToAll(sourceText).subscribe({
      next: (result) => {
        if (result.success) {
          // Update all language fields with translations
          if (sourceLang !== 'en' && result.english) {
            this.form.patchValue({ notes: result.english });
          }
          if (sourceLang !== 'ar' && result.arabic) {
            this.form.patchValue({ notesAr: result.arabic });
          }
          if (sourceLang !== 'nob' && result.nobiin) {
            this.form.patchValue({ notesNob: result.nobiin });
          }
          this.translationStatus.set('success');
        }
        // Save with updated values
        this.savePersonDirectly(this.form.value);
      },
      error: () => {
        // Translation failed, but still save with what we have
        this.translationStatus.set('error');
        this.snackBar.open(
          this.i18n.t('personForm.translationFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.savePersonDirectly(formValue);
      }
    });
  }

  /**
   * Save person directly without translation
   */
  private savePersonDirectly(formValue: any): void {
    const operation = this.data.person
      ? this.personService.updatePerson(this.data.person.id, this.buildUpdateRequest(formValue))
      : this.personService.createPerson(this.buildCreateRequest(formValue));

    operation.subscribe({
      next: (person) => {
        this.saving.set(false);
        // Show success message with translation status
        const statusKey = this.translationStatus() === 'success'
          ? 'personForm.savedWithTranslation'
          : (this.data.person ? 'personForm.updateSuccess' : 'personForm.createSuccess');
        this.snackBar.open(
          this.i18n.t(statusKey),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.dialogRef.close(person);
      },
      error: (error) => {
        console.error('Failed to save person:', error);
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('personForm.saveFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
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
      notes: formValue.notes || undefined,
      notesAr: formValue.notesAr || undefined,
      notesNob: formValue.notesNob || undefined
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
      notes: formValue.notes || undefined,
      notesAr: formValue.notesAr || undefined,
      notesNob: formValue.notesNob || undefined
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

  /**
   * Get the notes label translation key based on current language
   */
  getNotesLabelKey(): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar': return 'personForm.notesArabic';
      case 'nob': return 'personForm.notesNobiin';
      default: return 'personForm.notesEnglish';
    }
  }

  /**
   * Check if notes field should use RTL direction
   */
  isNotesRtl(): boolean {
    return this.i18n.currentLang() === 'ar';
  }
}