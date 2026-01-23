/**
 * Family relationship type with trilingual support (Arabic, English, Nubian)
 */
export interface FamilyRelationshipType {
  id: number;
  nameArabic: string;
  nameEnglish: string;
  nameNubian: string;
  category: string | null;
  sortOrder: number;
}

/**
 * Family relationship types grouped by category
 */
export interface FamilyRelationshipTypeGrouped {
  category: string;
  types: FamilyRelationshipType[];
}

/**
 * Display language options for relationship types (legacy format)
 */
export type RelationshipLanguage = 'english' | 'arabic' | 'nubian';

/**
 * App language codes used by I18nService
 */
export type AppLanguage = 'en' | 'ar' | 'nob';

/**
 * Helper to get relationship name in specified language with fallback chain.
 * Always falls back to English if the requested language is empty/null.
 */
export function getRelationshipName(
  type: FamilyRelationshipType,
  language: RelationshipLanguage = 'english'
): string {
  switch (language) {
    case 'arabic':
      return type.nameArabic || type.nameEnglish || '';
    case 'nubian':
      return type.nameNubian || type.nameEnglish || '';
    case 'english':
    default:
      return type.nameEnglish || '';
  }
}

/**
 * Helper to get relationship name using app language codes (en, ar, nob).
 * Includes fallback chain: requested language -> English -> empty string
 */
export function getRelationshipNameByLang(
  type: FamilyRelationshipType,
  lang: AppLanguage
): string {
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

/**
 * Get formatted display string with multiple languages
 * e.g., "Father (أب)"
 */
export function getRelationshipDisplayName(
  type: FamilyRelationshipType,
  primaryLanguage: RelationshipLanguage = 'english',
  showSecondary: boolean = true
): string {
  const primary = getRelationshipName(type, primaryLanguage);

  if (!showSecondary) {
    return primary;
  }

  // Show English with Arabic as secondary by default
  if (primaryLanguage === 'english') {
    const secondary = type.nameArabic || '';
    return secondary ? `${primary} (${secondary})` : primary;
  } else if (primaryLanguage === 'arabic') {
    const secondary = type.nameEnglish || '';
    return secondary ? `${primary} (${secondary})` : primary;
  } else {
    const secondary = type.nameEnglish || '';
    return secondary ? `${primary} (${secondary})` : primary;
  }
}
