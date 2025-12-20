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
 * Display language options for relationship types
 */
export type RelationshipLanguage = 'english' | 'arabic' | 'nubian';

/**
 * Helper to get relationship name in specified language
 */
export function getRelationshipName(
  type: FamilyRelationshipType,
  language: RelationshipLanguage = 'english'
): string {
  switch (language) {
    case 'arabic':
      return type.nameArabic;
    case 'nubian':
      return type.nameNubian;
    case 'english':
    default:
      return type.nameEnglish;
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
    return `${primary} (${type.nameArabic})`;
  } else if (primaryLanguage === 'arabic') {
    return `${primary} (${type.nameEnglish})`;
  } else {
    return `${primary} (${type.nameEnglish})`;
  }
}
