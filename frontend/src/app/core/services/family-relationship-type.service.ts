import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, shareReplay, catchError, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FamilyRelationshipType,
  FamilyRelationshipTypeGrouped,
  RelationshipLanguage,
  getRelationshipDisplayName,
  getRelationshipNameByLang
} from '../models/family-relationship-type.models';
import { I18nService } from '../i18n';

/**
 * Service for managing family relationship types with trilingual support.
 * Uses localStorage caching with version-based invalidation.
 * Designed to be resilient - app should start even if API fails.
 */
@Injectable({
  providedIn: 'root'
})
export class FamilyRelationshipTypeService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly apiUrl = `${environment.apiUrl}/relationship-types`;

  private readonly STORAGE_KEY = 'familyRelationshipTypes';
  private readonly VERSION_KEY = 'familyRelationshipTypes_version';

  // Cache the observable to avoid multiple requests
  private cache$: Observable<FamilyRelationshipType[]> | null = null;
  private groupedCache$: Observable<FamilyRelationshipTypeGrouped[]> | null = null;

  // Signal-based state for reactive access
  private readonly _types = signal<FamilyRelationshipType[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _initialized = signal(false);

  // Public readonly signals
  readonly types = this._types.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly initialized = this._initialized.asReadonly();

  // Computed signals for grouped data
  readonly immediateFamily = computed(() =>
    this._types().filter(t => t.category === 'Immediate')
  );
  readonly grandparents = computed(() =>
    this._types().filter(t => t.category === 'Grandparents')
  );
  readonly grandchildren = computed(() =>
    this._types().filter(t => t.category === 'Grandchildren')
  );
  readonly unclesAunts = computed(() =>
    this._types().filter(t => t.category === 'Uncles/Aunts')
  );
  readonly cousins = computed(() =>
    this._types().filter(t => t.category === 'Cousins')
  );
  readonly nephewsNieces = computed(() =>
    this._types().filter(t => t.category === 'Nephews/Nieces')
  );
  readonly inLaws = computed(() =>
    this._types().filter(t => t.category === 'In-Laws')
  );
  readonly stepRelations = computed(() =>
    this._types().filter(t => t.category === 'Step')
  );

  constructor() {
    // Load from localStorage on service initialization
    this.loadFromStorage();
  }

  /**
   * Preload relationship types - called by APP_INITIALIZER.
   * MUST NOT throw - app must start even if API fails.
   * Uses localStorage cache with version-based invalidation.
   */
  async preload(): Promise<void> {
    try {
      this._loading.set(true);

      // Check server version first
      const serverVersion = await firstValueFrom(
        this.http.get(`${this.apiUrl}/version`, { responseType: 'text' }).pipe(
          timeout(5000),
          catchError(() => of(null))
        )
      );

      const localVersion = this.getStoredVersion();

      // If versions match and we have cached data, skip fetch
      if (serverVersion && serverVersion === localVersion && this._types().length > 0) {
        this._initialized.set(true);
        this._loading.set(false);
        return;
      }

      // Fetch fresh data from API
      const types = await firstValueFrom(
        this.http.get<FamilyRelationshipType[]>(this.apiUrl).pipe(
          timeout(10000),
          catchError(err => {
            console.warn('Failed to fetch relationship types from API:', err);
            return of(null);
          })
        )
      );

      if (types && types.length > 0) {
        this._types.set(types);
        this.saveToStorage(types, serverVersion);
      }
    } catch (err) {
      console.warn('Relationship type preload failed, using cache:', err);
    } finally {
      this._loading.set(false);
      this._initialized.set(true);
    }
  }

  /**
   * Get all family relationship types (cached)
   */
  getAll(): Observable<FamilyRelationshipType[]> {
    if (!this.cache$) {
      this._loading.set(true);
      this._error.set(null);

      this.cache$ = this.http.get<FamilyRelationshipType[]>(this.apiUrl).pipe(
        tap(types => {
          this._types.set(types);
          this._loading.set(false);
          this.saveToStorage(types, null);
        }),
        catchError(err => {
          this._error.set('Failed to load relationship types');
          this._loading.set(false);
          this.cache$ = null; // Clear cache on error to allow retry
          throw err;
        }),
        shareReplay(1)
      );
    }
    return this.cache$;
  }

  /**
   * Get all family relationship types grouped by category (cached)
   */
  getAllGrouped(): Observable<FamilyRelationshipTypeGrouped[]> {
    if (!this.groupedCache$) {
      this.groupedCache$ = this.http
        .get<FamilyRelationshipTypeGrouped[]>(`${this.apiUrl}/grouped`)
        .pipe(shareReplay(1));
    }
    return this.groupedCache$;
  }

  /**
   * Get a specific relationship type by ID
   */
  getById(id: number): Observable<FamilyRelationshipType | undefined> {
    // Try to get from cached signal first
    const cached = this._types().find(t => t.id === id);
    if (cached) {
      return of(cached);
    }

    // Otherwise fetch from API
    return this.http.get<FamilyRelationshipType>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get localized name by type ID.
   * Returns "Unknown" with warning if ID not found - NEVER empty string.
   */
  getLocalizedNameById(id: number): string {
    const type = this._types().find(t => t.id === id);
    if (!type) {
      console.warn(`Unknown relationship type ID: ${id}`);
      return this.i18n.t('common.unknown') || 'Unknown';
    }
    return this.getLocalizedName(type);
  }

  /**
   * Get type by i18n key (for backward compat).
   * Maps keys like "relationship.father" to the corresponding type.
   */
  getTypeByI18nKey(key: string): FamilyRelationshipType | undefined {
    if (!key) return undefined;

    // Extract name from key: "relationship.father" -> "father"
    const name = key.replace('relationship.', '').toLowerCase();

    return this._types().find(t =>
      t.nameEnglish.toLowerCase().replace(/[- ]/g, '') === name ||
      t.nameEnglish.toLowerCase() === name
    );
  }

  /**
   * Search relationship types by name (in any language)
   */
  search(query: string): FamilyRelationshipType[] {
    if (!query || query.trim().length === 0) {
      return this._types();
    }

    const searchTerm = query.toLowerCase().trim();

    return this._types().filter(type =>
      type.nameEnglish.toLowerCase().includes(searchTerm) ||
      type.nameArabic.includes(searchTerm) ||
      type.nameNubian.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Get display name for a relationship type (legacy method with explicit language)
   */
  getDisplayName(
    type: FamilyRelationshipType,
    language: RelationshipLanguage = 'english',
    showSecondary: boolean = true
  ): string {
    return getRelationshipDisplayName(type, language, showSecondary);
  }

  /**
   * Get localized name for a relationship type using the user's current language.
   * Includes fallback chain: requested language -> English -> empty string
   */
  getLocalizedName(type: FamilyRelationshipType): string {
    return getRelationshipNameByLang(type, this.i18n.currentLang());
  }

  /**
   * Clear the cache (useful for testing or when data might have changed)
   */
  clearCache(): void {
    this.cache$ = null;
    this.groupedCache$ = null;
    this._types.set([]);
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.VERSION_KEY);
    } catch (e) {
      console.warn('Failed to clear relationship types from storage:', e);
    }
  }

  /**
   * Load types from localStorage
   */
  private loadFromStorage(): void {
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      if (cached) {
        const types = JSON.parse(cached) as FamilyRelationshipType[];
        if (Array.isArray(types) && types.length > 0) {
          this._types.set(types);
        }
      }
    } catch (e) {
      console.warn('Failed to load relationship types from storage:', e);
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Save types to localStorage with optional version
   */
  private saveToStorage(types: FamilyRelationshipType[], version: string | null): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(types));
      if (version) {
        localStorage.setItem(this.VERSION_KEY, version);
      }
    } catch (e) {
      console.warn('Failed to save relationship types to storage:', e);
    }
  }

  /**
   * Get stored version from localStorage
   */
  private getStoredVersion(): string | null {
    try {
      return localStorage.getItem(this.VERSION_KEY);
    } catch (e) {
      return null;
    }
  }
}
