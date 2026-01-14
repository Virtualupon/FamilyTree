import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, shareReplay, catchError, tap } from 'rxjs/operators';
import { I18nService } from '../i18n/i18n.service';
import { environment } from '../../../environments/environment';

export interface Country {
  code: string;
  name: string;      // English name (mapped from nameEn)
  nameAr?: string;   // Arabic name
  nameLocal?: string; // Nobiin name
  region?: string;
}

interface CountryApiResponse {
  code: string;
  nameEn: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CountriesService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);

  private countries: Country[] = [];
  private countries$: Observable<Country[]> | null = null;

  getCountries(): Observable<Country[]> {
    if (!this.countries$) {
      this.countries$ = this.http.get<CountryApiResponse[]>(`${environment.apiUrl}/countries`).pipe(
        map(response => response.map(c => ({
          code: c.code,
          name: c.nameEn,
          nameAr: c.nameAr,
          nameLocal: c.nameLocal,
          region: c.region
        }))),
        tap(countries => this.countries = countries),
        shareReplay(1),
        catchError(() => {
          // Fallback to static JSON if API fails
          console.warn('Failed to load countries from API, falling back to static file');
          return this.http.get<Country[]>('/assets/data/countries.json').pipe(
            tap(countries => this.countries = countries),
            catchError(() => of([]))
          );
        })
      );
    }
    return this.countries$;
  }

  getCountryDisplayName(country: Country): string {
    if (!country) return '';
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && country.nameAr) {
      return country.nameAr;
    }
    if (lang === 'nob' && country.nameLocal) {
      return country.nameLocal;
    }
    return country.name;
  }

  getCountryByCode(code: string): Country | undefined {
    return this.countries.find(c => c.code === code);
  }

  filterCountries(searchText: string, countries: Country[]): Country[] {
    if (!searchText) return countries;

    const search = searchText.toLowerCase();
    return countries.filter(country =>
      country.name.toLowerCase().includes(search) ||
      (country.nameAr && country.nameAr.includes(searchText)) ||
      (country.nameLocal && country.nameLocal.includes(searchText)) ||
      country.code.toLowerCase().includes(search)
    );
  }

  /**
   * Converts country code to flag emoji using Unicode Regional Indicator Symbols
   * Example: "EG" -> flag emoji, "US" -> flag emoji
   */
  getCountryFlag(countryCode: string): string {
    if (!countryCode || countryCode.length !== 2) return '';

    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));

    return String.fromCodePoint(...codePoints);
  }
}
