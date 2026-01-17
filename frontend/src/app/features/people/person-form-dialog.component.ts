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
  templateUrl: './person-form-dialog.component.html',
  styleUrls: ['./person-form-dialog.component.scss']
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