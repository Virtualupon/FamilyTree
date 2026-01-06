import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TransliterationRequest,
  TransliterationResult,
  BatchTransliterationRequest,
  BatchTransliterationResult,
  VerifyMappingRequest,
  VerifyMappingResult,
  NameMapping,
  TransliterationLanguage,
  BulkTransliterationRequest,
  BulkTransliterationResult,
  PersonTransliterationResult,
  TransliterationPreviewResult
} from '../models/transliteration.models';

/**
 * Service for name transliteration between Arabic, English, and Nobiin scripts.
 * Uses Claude AI on the backend with database caching for verified mappings.
 */
@Injectable({
  providedIn: 'root'
})
export class TransliterationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/transliteration`;

  // Signal-based state for reactive access
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _lastResult = signal<TransliterationResult | null>(null);

  // Public readonly signals
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly lastResult = this._lastResult.asReadonly();

  /**
   * Transliterate a single name between Arabic, English, and Nobiin
   */
  transliterate(request: TransliterationRequest): Observable<TransliterationResult> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.post<TransliterationResult>(this.apiUrl, request).pipe(
      tap(result => {
        this._lastResult.set(result);
        this._loading.set(false);
      }),
      catchError(err => {
        this._error.set(err?.error?.message ?? 'Failed to transliterate name');
        this._loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Shorthand to transliterate from a specific source language
   */
  transliterateFromArabic(
    name: string,
    displayLanguage: TransliterationLanguage = 'en'
  ): Observable<TransliterationResult> {
    return this.transliterate({
      inputName: name,
      sourceLanguage: 'ar',
      displayLanguage
    });
  }

  transliterateFromEnglish(
    name: string,
    displayLanguage: TransliterationLanguage = 'en'
  ): Observable<TransliterationResult> {
    return this.transliterate({
      inputName: name,
      sourceLanguage: 'en',
      displayLanguage
    });
  }

  transliterateFromNobiin(
    name: string,
    displayLanguage: TransliterationLanguage = 'en'
  ): Observable<TransliterationResult> {
    return this.transliterate({
      inputName: name,
      sourceLanguage: 'nob',
      displayLanguage
    });
  }

  /**
   * Batch transliterate multiple names (for GED import or bulk operations)
   */
  transliterateBatch(
    names: TransliterationRequest[]
  ): Observable<BatchTransliterationResult> {
    this._loading.set(true);
    this._error.set(null);

    const request: BatchTransliterationRequest = { names };

    return this.http.post<BatchTransliterationResult>(`${this.apiUrl}/batch`, request).pipe(
      tap(() => this._loading.set(false)),
      catchError(err => {
        this._error.set(err?.error?.message ?? 'Failed to process batch transliteration');
        this._loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Verify and optionally correct a name mapping
   */
  verifyMapping(request: VerifyMappingRequest): Observable<VerifyMappingResult> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.post<VerifyMappingResult>(`${this.apiUrl}/verify`, request).pipe(
      tap(() => this._loading.set(false)),
      catchError(err => {
        this._error.set(err?.error?.message ?? 'Failed to verify mapping');
        this._loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get all name mappings that need review
   */
  getMappingsNeedingReview(): Observable<NameMapping[]> {
    return this.http.get<NameMapping[]>(`${this.apiUrl}/review`);
  }

  /**
   * Search for existing name mappings
   */
  searchMappings(query: string, limit: number = 20): Observable<NameMapping[]> {
    return this.http.get<NameMapping[]>(`${this.apiUrl}/search`, {
      params: { q: query, limit: limit.toString() }
    });
  }

  /**
   * Get a specific name mapping by ID
   */
  getMappingById(id: number): Observable<NameMapping> {
    return this.http.get<NameMapping>(`${this.apiUrl}/${id}`);
  }

  /**
   * Generate missing language variants for a specific person
   */
  generateForPerson(personId: string): Observable<PersonTransliterationResult> {
    return this.http.post<PersonTransliterationResult>(
      `${this.apiUrl}/person/${personId}/generate`,
      {}
    );
  }

  /**
   * Preview what translations would be generated for a person
   */
  previewForPerson(personId: string): Observable<TransliterationPreviewResult> {
    return this.http.get<TransliterationPreviewResult>(
      `${this.apiUrl}/person/${personId}/preview`
    );
  }

  /**
   * Bulk generate missing translations for all persons in org
   */
  bulkGenerate(request: BulkTransliterationRequest): Observable<BulkTransliterationResult> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.post<BulkTransliterationResult>(`${this.apiUrl}/bulk-generate`, request).pipe(
      tap(() => this._loading.set(false)),
      catchError(err => {
        this._error.set(err?.error?.message ?? 'Failed to process bulk generation');
        this._loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this._error.set(null);
  }
}
