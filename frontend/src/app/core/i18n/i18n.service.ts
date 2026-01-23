import { Injectable, signal, computed, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

export type Language = 'en' | 'ar' | 'nob';

export interface LanguageConfig {
  code: Language;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly STORAGE_KEY = 'family_tree_language';
  private readonly translateService = inject(TranslateService);

  readonly supportedLanguages: LanguageConfig[] = [
    { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', flag: '🇬🇧' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', flag: '🇸🇦' },
    { code: 'nob', name: 'Nobiin', nativeName: 'ⲛⲟⲃⲓ̄ⲛ', direction: 'ltr', flag: '🇸🇩' }
  ];

  private currentLangSubject = new BehaviorSubject<Language>(this.getInitialLanguage());
  currentLang$ = this.currentLangSubject.asObservable();

  currentLang = signal<Language>(this.getInitialLanguage());

  direction = computed(() => {
    const lang = this.currentLang();
    return this.supportedLanguages.find(l => l.code === lang)?.direction || 'ltr';
  });

  isRtl = computed(() => this.direction() === 'rtl');

  constructor() {
    this.initTranslations();
  }

  private getInitialLanguage(): Language {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored && this.supportedLanguages.some(l => l.code === stored)) {
      return stored as Language;
    }
    return 'en';
  }

  private initTranslations(): void {
    // Add supported languages
    this.translateService.addLangs(['en', 'ar', 'nob']);
    
    // Set fallback language
    this.translateService.setDefaultLang('en');

    // Use the stored or default language
    const lang = this.getInitialLanguage();
    this.translateService.use(lang);
    this.applyDirection();
  }

  setLanguage(lang: Language): void {
    localStorage.setItem(this.STORAGE_KEY, lang);
    this.currentLang.set(lang);
    this.currentLangSubject.next(lang);
    this.translateService.use(lang);
    this.applyDirection();
  }

  clearLanguage(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private applyDirection(): void {
    const dir = this.direction();
    document.documentElement.dir = dir;
    document.documentElement.lang = this.currentLang();
    document.body.classList.toggle('rtl', dir === 'rtl');
  }

  /**
   * Translate a key using ngx-translate (from JSON files)
   * Use this in TypeScript code. In templates, use the | translate pipe.
   */
  t(key: string, params?: Record<string, string | number>): string {
    return this.translateService.instant(key, params);
  }

  /**
   * Get localized town name based on current language
   */
  getTownName(town: { name: string; nameEn?: string | null; nameAr?: string | null; nameLocal?: string | null }): string {
    const lang = this.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    return town.nameLocal || town.name;
  }

  /**
   * Get localized tree name based on current language
   */
  getTreeName(tree: { name: string; nameEn?: string | null; nameAr?: string | null; nameLocal?: string | null }): string {
    const lang = this.currentLang();
    if (lang === 'ar' && tree.nameAr) return tree.nameAr;
    if (lang === 'en' && tree.nameEn) return tree.nameEn;
    return tree.nameLocal || tree.name;
  }

  /**
   * Get localized family group name based on current language
   */
  getFamilyName(family: { name: string; nameEn?: string | null; nameAr?: string | null; nameLocal?: string | null }): string {
    const lang = this.currentLang();
    if (lang === 'ar' && family.nameAr) return family.nameAr;
    if (lang === 'en' && family.nameEn) return family.nameEn;
    return family.nameLocal || family.name;
  }

  /**
   * Get localized person name based on current language/script preference
   */
  getPersonName(person: {
    primaryName?: string | null;
    names?: Array<{ fullName: string; script?: string; nameType?: string }> | null;
  }): string {
    if (!person.names || person.names.length === 0) {
      return person.primaryName || '';
    }

    const lang = this.currentLang();

    // Try to find name in preferred script
    let preferredScript = 'Latin';
    if (lang === 'ar') preferredScript = 'Arabic';
    if (lang === 'nob') preferredScript = 'Coptic';

    // First try primary name in preferred script
    const primaryInScript = person.names.find(
      n => n.nameType === 'Primary' && n.script === preferredScript
    );
    if (primaryInScript) return primaryInScript.fullName;

    // Then try any name in preferred script
    const anyInScript = person.names.find(n => n.script === preferredScript);
    if (anyInScript) return anyInScript.fullName;

    // Fall back to primary name in any script
    const primary = person.names.find(n => n.nameType === 'Primary');
    if (primary) return primary.fullName;

    // Fall back to first name
    return person.names[0]?.fullName || person.primaryName || '';
  }

  /**
   * Get localized relationship type name based on current language.
   * Includes fallback chain: requested language -> English -> empty string
   */
  getRelationshipTypeName(type: {
    nameEnglish: string;
    nameArabic: string;
    nameNubian: string
  }): string {
    const lang = this.currentLang();
    switch (lang) {
      case 'ar':
        return type.nameArabic || type.nameEnglish || '';
      case 'nob':
        return type.nameNubian || type.nameEnglish || '';
      case 'en':
      default:
        return type.nameEnglish || '';
    }
  }
}