import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
import { FamilyService } from '../../core/services/family.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { AuthService } from '../../core/services/auth.service';
import { SuggestionService } from '../../core/services/suggestion.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyListItem } from '../../core/models/family.models';
import { OrgRole } from '../../core/models/auth.models';
import { SuggestionType, ConfidenceLevel } from '../../core/models/suggestion.models';
import { PersonAvatarComponent } from '../../shared/components/person-avatar/person-avatar.component';
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
    TranslatePipe,
    PersonAvatarComponent
  ],
  templateUrl: './person-form-dialog.component.html',
  styleUrls: ['./person-form-dialog.component.scss']
})
export class PersonFormDialogComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();
  private readonly personService = inject(PersonService);
  private readonly transliterationService = inject(TransliterationService);
  private readonly familyService = inject(FamilyService);
  private readonly treeContext = inject(TreeContextService);
  private readonly authService = inject(AuthService);
  private readonly suggestionService = inject(SuggestionService);
  private readonly countriesService = inject(CountriesService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<PersonFormDialogComponent>);
  readonly data = inject<PersonFormDialogData>(MAT_DIALOG_DATA);

  // Computed: Check if user is a Viewer (read-only, can only create suggestions)
  isViewer = computed(() => {
    const user = this.authService.getCurrentUser();
    if (!user) return true;
    // System admins are never viewers - they can directly edit
    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin') return false;
    // Regular users: need Contributor or higher org role to directly edit
    // If role is undefined or less than Contributor, they must use suggestions
    return user.role === undefined || user.role === null || user.role < OrgRole.Contributor;
  });

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
    this.setupPrimaryNameSync();
    this.loadFamilies();
    this.loadCountries();

    if (this.data.person) {
      this.loadPersonDetails();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Set up subscriptions to sync primaryName with the language-specific name
   * based on the current UI language.
   */
  private setupPrimaryNameSync(): void {
    // When nameEnglish changes and UI is English, sync to primaryName
    this.form.get('nameEnglish')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        const lang = this.i18n.currentLang();
        if (lang === 'en' || (lang !== 'ar' && lang !== 'nob')) {
          this.form.patchValue({ primaryName: value || '' }, { emitEvent: false });
        }
      });

    // When nameArabic changes and UI is Arabic, sync to primaryName
    this.form.get('nameArabic')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (this.i18n.currentLang() === 'ar') {
          this.form.patchValue({ primaryName: value || '' }, { emitEvent: false });
        }
      });

    // When nameNobiin changes and UI is Nobiin, sync to primaryName
    this.form.get('nameNobiin')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (this.i18n.currentLang() === 'nob') {
          this.form.patchValue({ primaryName: value || '' }, { emitEvent: false });
        }
      });
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
      nationality: ['']
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
      nationality: person.nationality || ''
    });
  }

  hasAnyNameToTransliterate(): boolean {
    const formValue = this.form.value;
    return !!(formValue.nameArabic || formValue.nameEnglish || formValue.nameNobiin);
  }

  onArabicNameBlur(): void {
    const arabicName = this.form.get('nameArabic')?.value;
    if (!arabicName?.trim()) return;

    // When editing an existing person, always sync other fields on blur.
    // When creating a new person, only fill if the other fields are empty.
    const isEditing = !!this.data.person;
    const englishName = this.form.get('nameEnglish')?.value;

    if (isEditing || !englishName) {
      this.transliterateFromArabic(isEditing);
    }
  }

  onEnglishNameBlur(): void {
    const englishName = this.form.get('nameEnglish')?.value;
    if (!englishName?.trim()) return;

    const isEditing = !!this.data.person;
    const arabicName = this.form.get('nameArabic')?.value;

    if (isEditing || !arabicName) {
      this.transliterateFromEnglish(isEditing);
    }
  }

  onNobiinNameBlur(): void {
    const nobiinName = this.form.get('nameNobiin')?.value;
    if (!nobiinName?.trim()) return;

    const isEditing = !!this.data.person;
    const arabicName = this.form.get('nameArabic')?.value;

    if (isEditing || !arabicName) {
      this.transliterateFromNobiin(isEditing);
    }
  }

  private transliterateFromArabic(overwrite = false): void {
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

        // Fill in English (overwrite if editing, otherwise only if empty)
        if (result.english?.best && (overwrite || !this.form.get('nameEnglish')?.value)) {
          this.form.patchValue({ nameEnglish: result.english.best });
        }

        // Fill in Nobiin (overwrite if editing, otherwise only if empty)
        if (result.nobiin?.value && (overwrite || !this.form.get('nameNobiin')?.value)) {
          this.form.patchValue({ nameNobiin: result.nobiin.value });
        }
      },
      error: () => this.transliterating.set(null)
    });
  }

  private transliterateFromEnglish(overwrite = false): void {
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

        // Fill in Arabic (overwrite if editing, otherwise only if empty)
        if (result.arabic && (overwrite || !this.form.get('nameArabic')?.value)) {
          this.form.patchValue({ nameArabic: result.arabic });
        }

        // Fill in Nobiin (overwrite if editing, otherwise only if empty)
        if (result.nobiin?.value && (overwrite || !this.form.get('nameNobiin')?.value)) {
          this.form.patchValue({ nameNobiin: result.nobiin.value });
        }
      },
      error: () => this.transliterating.set(null)
    });
  }

  private transliterateFromNobiin(overwrite = false): void {
    const nobiinName = this.form.get('nameNobiin')?.value;
    if (!nobiinName?.trim()) return;

    this.transliterating.set('arabic'); // reuse loading state

    this.transliterationService.transliterate({
      inputName: nobiinName,
      sourceLanguage: 'nob',
      displayLanguage: this.i18n.currentLang() as 'en' | 'ar' | 'nob'
    }).subscribe({
      next: (result) => {
        this.transliterating.set(null);

        if (result.arabic && (overwrite || !this.form.get('nameArabic')?.value)) {
          this.form.patchValue({ nameArabic: result.arabic });
        }

        if (result.english?.best && (overwrite || !this.form.get('nameEnglish')?.value)) {
          this.form.patchValue({ nameEnglish: result.english.best });
        }
      },
      error: () => this.transliterating.set(null)
    });
  }

  transliterateAllNames(): void {
    const arabicName = this.form.get('nameArabic')?.value;
    const englishName = this.form.get('nameEnglish')?.value;
    const nobiinName = this.form.get('nameNobiin')?.value;

    // Manual button click always overwrites existing values
    // Priority: Arabic → English → Nobiin
    if (arabicName?.trim()) {
      this.transliterateFromArabic(true);
    } else if (englishName?.trim()) {
      this.transliterateFromEnglish(true);
    } else if (nobiinName?.trim()) {
      this.transliterateFromNobiin(true);
    }
  }

  onAvatarChanged(): void {
    // Avatar was uploaded/removed via the PersonAvatarComponent.
    // No form changes needed — avatar is saved atomically by the component itself.
    this.snackBar.open(
      this.i18n.t('personForm.avatarUpdated'),
      this.i18n.t('common.close'),
      { duration: 2000 }
    );
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
  
  onSave(): void {
    if (this.form.invalid) return;

    this.saving.set(true);
    const formValue = this.form.value;

    // If user is a viewer (can only suggest, not directly create/edit), route to suggestion system
    if (this.isViewer()) {
      this.saveAsSuggestion(this.form.value);
      return;
    }

    this.savePersonDirectly(formValue);
  }

  /**
   * Save as a suggestion (for viewers who cannot directly add/edit persons)
   */
  private saveAsSuggestion(formValue: any): void {
    const treeId = this.data.treeId || this.treeContext.effectiveTreeId();
    if (!treeId) {
      this.saving.set(false);
      this.snackBar.open(
        this.i18n.t('suggestion.noTreeSelected'),
        this.i18n.t('common.close'),
        { duration: 5000 }
      );
      return;
    }

    // Validate: at least one name must be provided
    const hasName = formValue.primaryName?.trim() ||
                    formValue.nameArabic?.trim() ||
                    formValue.nameEnglish?.trim() ||
                    formValue.nameNobiin?.trim();

    if (!hasName) {
      this.saving.set(false);
      this.snackBar.open(
        this.i18n.t('suggestion.validation.nameRequired'),
        this.i18n.t('common.close'),
        { duration: 5000 }
      );
      return;
    }

    // Determine if this is an update (existing person) or add (new person)
    const isUpdate = !!this.data.person;
    const suggestionType = isUpdate ? SuggestionType.UpdatePerson : SuggestionType.AddPerson;

    // Build the proposed changes as notes
    const proposedChanges = this.buildProposedChangesDescription(formValue);

    const request = {
      treeId,
      type: suggestionType,
      targetPersonId: isUpdate ? this.data.person!.id : undefined,
      confidence: ConfidenceLevel.Probable,
      submitterNotes: proposedChanges,
      proposedValues: {
        primaryName: formValue.primaryName?.trim() || undefined,
        nameArabic: formValue.nameArabic?.trim() || undefined,
        nameEnglish: formValue.nameEnglish?.trim() || undefined,
        nameNobiin: formValue.nameNobiin?.trim() || undefined,
        sex: formValue.sex || undefined,
        birthDate: formValue.birthDate ? this.formatDateForApi(formValue.birthDate) : undefined,
        deathDate: formValue.deathDate ? this.formatDateForApi(formValue.deathDate) : undefined,
      }
    };

    this.suggestionService.createSuggestion(request).subscribe({
      next: (result) => {
        this.saving.set(false);
        // Show success message with person name
        const personName = formValue.primaryName?.trim() ||
                          formValue.nameArabic?.trim() ||
                          formValue.nameEnglish?.trim() ||
                          '';
        this.snackBar.open(
          this.i18n.t('suggestion.submitSuccess', { name: personName }),
          this.i18n.t('common.close'),
          { duration: 5000, panelClass: 'success-snackbar' }
        );
        this.dialogRef.close({ isSuggestion: true, result });
      },
      error: (err) => {
        console.error('Failed to create suggestion:', err);
        this.saving.set(false);
        const errorMessage = err?.error?.message || this.i18n.t('suggestion.createError');
        this.snackBar.open(
          errorMessage,
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  /**
   * Build a human-readable description of proposed changes
   */
  private buildProposedChangesDescription(formValue: any): string {
    const parts: string[] = [];

    if (formValue.primaryName) {
      parts.push(`Name: ${formValue.primaryName}`);
    }
    if (formValue.nameArabic) {
      parts.push(`Arabic: ${formValue.nameArabic}`);
    }
    if (formValue.nameEnglish) {
      parts.push(`English: ${formValue.nameEnglish}`);
    }
    if (formValue.sex) {
      parts.push(`Sex: ${formValue.sex}`);
    }
    if (formValue.birthDate) {
      parts.push(`Birth: ${this.formatDateForApi(formValue.birthDate)}`);
    }
    if (formValue.deathDate) {
      parts.push(`Death: ${this.formatDateForApi(formValue.deathDate)}`);
    }

    return parts.join(', ') || 'Person details';
  }

  /**
   * Save person directly
   */
  private savePersonDirectly(formValue: any): void {
    const operation = this.data.person
      ? this.personService.updatePerson(this.data.person.id, this.buildUpdateRequest(formValue))
      : this.personService.createPerson(this.buildCreateRequest(formValue));

    operation.subscribe({
      next: (person) => {
        this.saving.set(false);
        const statusKey = this.data.person ? 'personForm.updateSuccess' : 'personForm.createSuccess';
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
      nationality: this.extractNationalityCode(formValue.nationality)
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
      nationality: this.extractNationalityCode(formValue.nationality)
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