import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Request to translate text to all three languages.
 */
export interface TranslateTextRequest {
  text: string;
}

/**
 * Response with translations in all three languages.
 */
export interface TranslateTextResponse {
  success: boolean;
  english: string | null;
  arabic: string | null;
  nobiin: string | null;
  sourceLanguage: string;
  errorMessage: string | null;
}

/**
 * Request to translate from one specific language to another.
 */
export interface SingleTranslateRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * Response for single translation.
 */
export interface SingleTranslateResponse {
  success: boolean;
  translatedText: string | null;
  errorMessage: string | null;
}

/**
 * Service for text/sentence translation between English, Arabic, and Nobiin.
 * Uses LibreTranslate for English/Arabic and Claude AI for Nobiin translations.
 *
 * Note: This is different from TransliterationService which handles name transliteration.
 * This service handles full text/sentence translation for fields like Notes.
 */
@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/translation`;

  // Signal-based state for reactive access
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Translate text to all three languages (English, Arabic, Nobiin).
   * Auto-detects the source language and translates to the other two.
   */
  translateToAll(text: string): Observable<TranslateTextResponse> {
    this._loading.set(true);
    this._error.set(null);

    const request: TranslateTextRequest = { text };

    return this.http.post<TranslateTextResponse>(this.apiUrl, request).pipe(
      tap(() => this._loading.set(false)),
      catchError(err => {
        this._error.set(err?.error?.message ?? 'Failed to translate text');
        this._loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Translate text from a specific source language to a target language.
   */
  translateSingle(
    text: string,
    sourceLanguage: 'en' | 'ar' | 'nob',
    targetLanguage: 'en' | 'ar' | 'nob'
  ): Observable<SingleTranslateResponse> {
    this._loading.set(true);
    this._error.set(null);

    const request: SingleTranslateRequest = {
      text,
      sourceLanguage,
      targetLanguage
    };

    return this.http.post<SingleTranslateResponse>(`${this.apiUrl}/single`, request).pipe(
      tap(() => this._loading.set(false)),
      catchError(err => {
        this._error.set(err?.error?.message ?? 'Failed to translate text');
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
