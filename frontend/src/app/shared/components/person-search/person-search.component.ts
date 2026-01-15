import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil } from 'rxjs/operators';

import { PersonSearchService } from '../../../core/services/person-search.service';
import { TownService } from '../../../core/services/town.service';
import { CountriesService, Country } from '../../../core/services/countries.service';
import { SearchPersonItem } from '../../../core/models/search.models';
import { TownListItem } from '../../../core/models/town.models';
import { I18nService, TranslatePipe } from '../../../core/i18n';
import { Sex } from '../../../core/models/person.models';
import { PersonNameAvatarComponent } from '../person-name-avatar/person-name-avatar.component';

@Component({
  selector: 'app-person-search',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    TranslatePipe,
    PersonNameAvatarComponent
  ],
  template: `
    <div class="person-search-container">
      <!-- Filter Row -->
      <div class="filter-row">
        <!-- Town Filter (Optional) -->
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'common.town' | translate }}</mat-label>
          <mat-select [value]="selectedTownId()" (selectionChange)="onTownChange($event.value)">
            <mat-option [value]="null">{{ 'common.allTowns' | translate }}</mat-option>
            @for (town of towns(); track town.id) {
              <mat-option [value]="town.id">
                {{ getLocalizedTownName(town) }}
              </mat-option>
            }
          </mat-select>
          <i class="fa-solid fa-city" matPrefix aria-hidden="true"></i>
          <mat-hint>{{ 'common.optional' | translate }}</mat-hint>
        </mat-form-field>

        <!-- Nationality Filter (Optional) -->
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'personForm.nationality' | translate }}</mat-label>
          <mat-select [value]="selectedNationality()" (selectionChange)="onNationalityChange($event.value)">
            <mat-option [value]="null">{{ 'common.allNationalities' | translate }}</mat-option>
            @for (country of countries(); track country.code) {
              <mat-option [value]="country.code">
                <span class="country-option">
                  <span class="country-flag">{{ getCountryFlag(country.code) }}</span>
                  <span>{{ getCountryDisplayName(country) }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
          <i class="fa-solid fa-flag" matPrefix aria-hidden="true"></i>
          <mat-hint>{{ 'common.optional' | translate }}</mat-hint>
        </mat-form-field>
      </div>

      <!-- Search Hint -->
      @if (!selectedTownId() && !selectedNationality()) {
        <div class="search-hint">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <span>{{ 'relationships.filterHint' | translate }}</span>
        </div>
      }

      <!-- Person Search -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'relationships.searchPerson' | translate }}</mat-label>
        <i class="fa-solid fa-magnifying-glass" matPrefix aria-hidden="true"></i>
        <input matInput
               [formControl]="searchControl"
               [matAutocomplete]="personAuto"
               [placeholder]="placeholder">
        @if (selectedPerson()) {
          <button mat-icon-button matSuffix (click)="clearSelection()" type="button">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        }
        <mat-autocomplete #personAuto="matAutocomplete"
                          [displayWith]="displayPersonFn"
                          (optionSelected)="onPersonSelected($event.option.value)">
          @for (person of searchResults(); track person.id) {
            <mat-option [value]="person">
              <div class="person-option">
                <app-person-name-avatar [person]="person" size="small"></app-person-name-avatar>
                <span class="person-details">
                  @if (person.birthDate || person.deathDate) {
                    <span class="dates">({{ formatYear(person.birthDate) }} - {{ formatYear(person.deathDate) }})</span>
                  }
                  @if (person.sex !== null && person.sex !== undefined) {
                    <i class="fa-solid sex-icon" [class]="getSexClass(person.sex)" [ngClass]="getSexIcon(person.sex)" aria-hidden="true"></i>
                  }
                </span>
              </div>
            </mat-option>
          }
          @if (isSearching()) {
            <mat-option disabled>
              <mat-spinner diameter="20"></mat-spinner>
              <span>{{ 'common.searching' | translate }}</span>
            </mat-option>
          }
          @if (!isSearching() && searchResults().length === 0 && searchControl.value && searchControl.value.length >= 2) {
            <mat-option disabled>{{ 'common.noResults' | translate }}</mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>

      <!-- Selected Person Display -->
      @if (selectedPerson()) {
        <div class="selected-person">
          <mat-chip-row (removed)="clearSelection()">
            <i class="fa-solid" [ngClass]="getSexIcon(selectedPerson()!.sex)" [class]="getSexClass(selectedPerson()!.sex)" matChipAvatar aria-hidden="true"></i>
            {{ getPersonDisplayName(selectedPerson()!) }}
            <button matChipRemove>
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </mat-chip-row>
        </div>
      }
    </div>
  `,
  styles: [`
    .person-search-container {
      width: 100%;
    }

    .filter-row {
      display: flex;
      gap: 16px;
      margin-bottom: 8px;

      .filter-field {
        flex: 1;

        i.fa-solid {
          margin-right: 8px;
          color: rgba(0, 0, 0, 0.54);
        }
      }
    }

    .search-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: 16px;
      background-color: #fff8e1;
      border-radius: 4px;
      color: #f57c00;
      font-size: 0.85em;

      i.fa-solid {
        font-size: 16px;
      }
    }

    .full-width {
      width: 100%;

      i.fa-solid {
        margin-right: 8px;
        color: rgba(0, 0, 0, 0.54);
      }
    }

    .country-option {
      display: flex;
      align-items: center;
      gap: 8px;

      .country-flag {
        font-size: 1.1em;
      }
    }

    .person-option {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;

      .person-name {
        flex: 1;
        font-weight: 500;
      }

      .person-details {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85em;
        color: rgba(0, 0, 0, 0.6);
      }

      .dates {
        font-size: 12px;
      }

      i.sex-icon {
        font-size: 14px;
      }

      i.sex-icon.male {
        color: #1976d2;
      }

      i.sex-icon.female {
        color: #e91e63;
      }
    }

    .selected-person {
      margin-top: 8px;

      mat-chip-row {
        i.fa-solid {
          font-size: 14px;
        }

        i.male {
          color: #1976d2;
        }

        i.female {
          color: #e91e63;
        }
      }
    }

    mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    @media (max-width: 600px) {
      .filter-row {
        flex-direction: column;
        gap: 0;
      }
    }
  `]
})
export class PersonSearchComponent implements OnInit, OnDestroy {
  @Input() excludePersonId?: string;
  @Input() placeholder = '';

  @Output() personSelected = new EventEmitter<SearchPersonItem | null>();

  private readonly searchService = inject(PersonSearchService);
  private readonly townService = inject(TownService);
  private readonly countriesService = inject(CountriesService);
  private readonly i18n = inject(I18nService);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  // Form control
  searchControl = new FormControl('');

  // State signals
  towns = signal<TownListItem[]>([]);
  countries = signal<Country[]>([]);
  selectedTownId = signal<string | null>(null);
  selectedNationality = signal<string | null>(null);
  searchResults = signal<SearchPersonItem[]>([]);
  selectedPerson = signal<SearchPersonItem | null>(null);
  isSearching = signal(false);

  // Expose Sex enum
  Sex = Sex;

  ngOnInit(): void {
    this.loadTowns();
    this.loadCountries();
    this.setupSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadTowns(): void {
    this.townService.getAllTowns()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (towns) => this.towns.set(towns),
        error: (err) => console.error('Failed to load towns:', err)
      });
  }

  private loadCountries(): void {
    this.countriesService.getCountries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (countries) => this.countries.set(countries),
        error: (err) => console.error('Failed to load countries:', err)
      });
  }

  private setupSearch(): void {
    // Debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        if (!term || term.length < 2) {
          this.searchResults.set([]);
          return of(null);
        }

        this.isSearching.set(true);
        const townId = this.selectedTownId();

        // Use townId-based search if town is selected, otherwise use general quick search
        if (townId) {
          return this.searchService.searchByTown(townId, term, 1, 20).pipe(
            catchError((err) => {
              console.error('Search error:', err);
              return of({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0, searchDurationMs: 0 });
            })
          );
        } else {
          return this.searchService.quickSearch(term, 1, 20).pipe(
            catchError((err) => {
              console.error('Search error:', err);
              return of({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0, searchDurationMs: 0 });
            })
          );
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.isSearching.set(false);
      if (result) {
        // Filter out excluded person
        let filtered = result.items;
        if (this.excludePersonId) {
          filtered = filtered.filter(p => p.id !== this.excludePersonId);
        }
        // Filter by nationality if selected (client-side for now)
        const nationality = this.selectedNationality();
        if (nationality) {
          filtered = filtered.filter(p => p.nationality === nationality);
        }
        this.searchResults.set(filtered);
      }
    });

    // Connect input to search subject
    this.searchControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (typeof value === 'string') {
          this.searchSubject.next(value);
        }
      });
  }

  onTownChange(townId: string | null): void {
    this.selectedTownId.set(townId);
    this.triggerSearch();
  }

  onNationalityChange(nationality: string | null): void {
    this.selectedNationality.set(nationality);
    this.triggerSearch();
  }

  private triggerSearch(): void {
    const currentSearch = this.searchControl.value;
    if (currentSearch && currentSearch.length >= 2) {
      this.searchSubject.next(currentSearch);
    }
  }

  onPersonSelected(person: SearchPersonItem): void {
    this.selectedPerson.set(person);
    this.searchControl.setValue('');
    this.searchResults.set([]);
    this.personSelected.emit(person);
  }

  clearSelection(): void {
    this.selectedPerson.set(null);
    this.searchControl.setValue('');
    this.personSelected.emit(null);
  }

  // Display functions
  displayPersonFn = (person: SearchPersonItem | null): string => {
    return person ? this.getPersonDisplayName(person) : '';
  };

  getPersonDisplayName(person: SearchPersonItem): string {
    if (!person) return '';
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return person.nameArabic || person.nameEnglish || person.primaryName || '';
      case 'nob':
        return person.nameNobiin || person.nameEnglish || person.primaryName || '';
      default:
        return person.nameEnglish || person.nameArabic || person.primaryName || '';
    }
  }

  getLocalizedTownName(town: TownListItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') return town.nameAr || town.nameEn || '';
    if (lang === 'nob') return town.nameLocal || town.nameEn || '';
    return town.nameEn || '';
  }

  getCountryDisplayName(country: Country): string {
    return this.countriesService.getCountryDisplayName(country);
  }

  getCountryFlag(countryCode: string): string {
    return this.countriesService.getCountryFlag(countryCode);
  }

  formatYear(dateStr?: string | null): string {
    if (!dateStr) return '?';
    const date = new Date(dateStr);
    return date.getFullYear().toString();
  }

  getSexClass(sex: number | null | undefined): string {
    if (sex === Sex.Male) return 'male';
    if (sex === Sex.Female) return 'female';
    return '';
  }

  getSexIcon(sex: number | null | undefined): string {
    if (sex === Sex.Male) return 'fa-mars';
    if (sex === Sex.Female) return 'fa-venus';
    return 'fa-user';
  }
}
