/**
 * Transliteration models for Arabic, English, and Nobiin name conversion
 */

/**
 * Supported languages for transliteration
 */
export type TransliterationLanguage = 'ar' | 'en' | 'nob';

/**
 * Request to transliterate a single name
 */
export interface TransliterationRequest {
  inputName: string;
  sourceLanguage: TransliterationLanguage;
  displayLanguage: TransliterationLanguage;
  isGedImport?: boolean;
  personId?: string;
  orgId?: string;
}

/**
 * Batch request for multiple names
 */
export interface BatchTransliterationRequest {
  names: TransliterationRequest[];
}

/**
 * Request to verify/correct a name mapping
 */
export interface VerifyMappingRequest {
  mappingId: number;
  arabic?: string | null;
  english?: string | null;
  nobiin?: string | null;
}

/**
 * English transliteration result with alternatives
 */
export interface EnglishResult {
  best: string;
  alternatives: string[];
  source: 'db_reuse' | 'rule_based' | 'ai_suggestion' | 'ged' | 'manual_required';
  confidence: number;
}

/**
 * Nobiin transliteration result with IPA
 */
export interface NobiinResult {
  value: string | null;
  ipa: string | null;
  source: 'deterministic_ipa' | 'db_reuse';
}

/**
 * Display name result based on user's preferred language
 */
export interface DisplayResult {
  value: string;
  lang: TransliterationLanguage;
}

/**
 * Metadata about the transliteration process
 */
export interface TransliterationMetadata {
  needsReview: boolean;
  hasConflict: boolean;
  warnings: string[];
  fromCache: boolean;
}

/**
 * Complete transliteration result
 */
export interface TransliterationResult {
  arabic: string | null;
  english: EnglishResult;
  nobiin: NobiinResult;
  display: DisplayResult;
  metadata: TransliterationMetadata;
  mappingId?: number;
}

/**
 * Batch transliteration result
 */
export interface BatchTransliterationResult {
  results: TransliterationResult[];
  totalProcessed: number;
  needsReviewCount: number;
  conflictCount: number;
  cachedCount: number;
}

/**
 * Stored name mapping from database
 */
export interface NameMapping {
  id: number;
  arabic: string | null;
  english: string | null;
  nobiin: string | null;
  ipa: string | null;
  isVerified: boolean;
  source: string | null;
  confidence: number | null;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Result of mapping verification
 */
export interface VerifyMappingResult {
  mappingId: number;
  success: boolean;
  message: string | null;
  mapping: NameMapping | null;
}

/**
 * Helper to get the display name based on language preference
 */
export function getTransliteratedName(
  result: TransliterationResult,
  language: TransliterationLanguage = 'en'
): string {
  switch (language) {
    case 'ar':
      return result.arabic ?? result.english.best ?? result.nobiin.value ?? '';
    case 'nob':
      return result.nobiin.value ?? result.english.best ?? result.arabic ?? '';
    case 'en':
    default:
      return result.english.best ?? result.arabic ?? result.nobiin.value ?? '';
  }
}

/**
 * Get confidence level as a descriptive string
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

/**
 * Get confidence color for UI display
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'green';
  if (confidence >= 0.7) return 'orange';
  return 'red';
}

// ============================================================================
// Person-based transliteration types
// ============================================================================

/**
 * Request for bulk transliteration generation
 */
export interface BulkTransliterationRequest {
  orgId?: string;
  missingScripts?: string[];
  maxPersons?: number;
  skipComplete?: boolean;
}

/**
 * Result of generating translations for a single person
 */
export interface PersonTransliterationResult {
  success: boolean;
  message: string | null;
  personId: string;
  namesGenerated: number;
  generatedNames: GeneratedNameInfo[];
  warnings: string[];
}

/**
 * Info about a generated name
 */
export interface GeneratedNameInfo {
  nameId: string;
  script: string;
  fullName: string;
  sourceScript: string;
  sourceName: string;
  confidence: number;
}

/**
 * Result of bulk transliteration generation
 */
export interface BulkTransliterationResult {
  success: boolean;
  message: string | null;
  totalPersonsProcessed: number;
  totalNamesGenerated: number;
  personsSkipped: number;
  errors: number;
  results: PersonTransliterationResult[];
}

/**
 * Preview of what translations would be generated
 */
export interface TransliterationPreviewResult {
  success: boolean;
  message: string | null;
  personId: string;
  existingNames: ExistingNameInfo[];
  proposedNames: ProposedNameInfo[];
  missingScripts: string[];
}

/**
 * Info about an existing name
 */
export interface ExistingNameInfo {
  nameId: string;
  script: string;
  fullName: string;
  isPrimary: boolean;
}

/**
 * Info about a proposed name to generate
 */
export interface ProposedNameInfo {
  script: string;
  proposedFullName: string;
  sourceScript: string;
  sourceName: string;
  confidence: number;
  needsReview: boolean;
}
