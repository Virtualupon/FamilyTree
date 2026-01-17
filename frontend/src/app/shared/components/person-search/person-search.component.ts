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
  templateUrl: './person-search.component.html',
  styleUrls: ['./person-search.component.scss']
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
