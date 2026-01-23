import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, shareReplay, catchError } from 'rxjs';
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
 * Caches the static lookup data after first load.
 */
@Injectable({
  providedIn: 'root'
})
export class FamilyRelationshipTypeService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly apiUrl = `${environment.apiUrl}/relationship-types`;

  // Cache the observable to avoid multiple requests
  private cache$: Observable<FamilyRelationshipType[]> | null = null;
  private groupedCache$: Observable<FamilyRelationshipTypeGrouped[]> | null = null;

  // Signal-based state for reactive access
  private readonly _types = signal<FamilyRelationshipType[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly types = this._types.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

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
  }

  /**
   * Preload types into cache (call on app init if needed)
   */
  preload(): void {
    this.getAll().subscribe();
  }
}
