// src/app/core/models/search.models.ts
import { Sex } from './person.models';

// ============================================================================
// PERSON SEARCH
// ============================================================================

/**
 * Request for unified person search (POST /api/search/persons)
 */
export interface PersonSearchRequest {
  query?: string;
  searchIn?: SearchScript;  // 'auto' | 'arabic' | 'latin' | 'coptic'
  treeId?: string;
  townId?: string;
  familyId?: string;
  sex?: Sex | string;  // Accepts enum or string ('Male', 'Female') for API compatibility
  isLiving?: boolean;
  birthYearFrom?: number;
  birthYearTo?: number;
  page?: number;
  pageSize?: number;
}

export type SearchScript = 'auto' | 'arabic' | 'latin' | 'coptic';

/**
 * Result from person search
 */
export interface PersonSearchResult {
  items: SearchPersonItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  searchDurationMs: number;
}

/**
 * Person item from search results with aggregated names
 */
export interface SearchPersonItem {
  id: string;
  orgId: string;
  familyId: string | null;
  familyName: string | null;
  primaryName: string | null;
  /** Name in Arabic script */
  nameArabic: string | null;
  /** Name in English/Latin script */
  nameEnglish: string | null;
  /** Name in Nobiin (Coptic) script */
  nameNobiin: string | null;
  // Father's names
  fatherId: string | null;
  fatherNameArabic: string | null;
  fatherNameEnglish: string | null;
  fatherNameNobiin: string | null;
  // Grandfather's names
  grandfatherId: string | null;
  grandfatherNameArabic: string | null;
  grandfatherNameEnglish: string | null;
  grandfatherNameNobiin: string | null;
  sex: Sex;
  birthDate: string | null;
  deathDate: string | null;
  birthPlaceId: string | null;
  birthPlaceName: string | null;
  isLiving: boolean;
  /** @deprecated Use nameArabic, nameEnglish, nameNobiin directly */
  names?: SearchPersonName[];
  parentsCount: number;
  childrenCount: number;
  spousesCount: number;
  mediaCount: number;
}

/**
 * Name entry from search results
 */
export interface SearchPersonName {
  id: string;
  script: string | null;
  fullName: string | null;
  givenName: string | null;
  middle: string | null;
  surname: string | null;
  transliteration: string | null;
  nameType: number;
  isPrimary: boolean;
}

// ============================================================================
// RELATIONSHIP PATH FINDING
// ============================================================================

/**
 * Request to find relationship path between two people
 */
export interface RelationshipPathRequest {
  person1Id: string;
  person2Id: string;
  treeId?: string;
  maxDepth?: number;
}

/**
 * Result of relationship path finding
 */
export interface RelationshipPathResult {
  pathFound: boolean;
  pathLength: number;
  pathNodes: PathNode[];
  pathRelationships: PathRelationship[];
  relationshipSummary: string;
  humanReadableRelationship: string;
}

export interface PathNode {
  personId: string;
  primaryName: string;
  sex: Sex;
  birthYear: number | null;
  isLiving: boolean;
}

export interface PathRelationship {
  fromPersonId: string;
  toPersonId: string;
  relationshipType: string;  // 'parent' | 'child' | 'spouse'
}

// ============================================================================
// FAMILY TREE DATA (for visualization)
// ============================================================================

/**
 * Request for family tree data
 */
export interface FamilyTreeDataRequest {
  rootPersonId: string;
  viewMode?: TreeViewMode;  // 'pedigree' | 'descendants' | 'hourglass'
  generations?: number;
  includeSpouses?: boolean;
}

export type TreeViewMode = 'pedigree' | 'descendants' | 'hourglass';

/**
 * Result containing tree data for visualization
 */
export interface FamilyTreeDataResult {
  rootPersonId: string;
  viewMode: string;
  generationsLoaded: number;
  persons: TreePersonNode[];
  totalPersonCount: number;
}

/**
 * Person node in tree data
 */
export interface TreePersonNode {
  id: string;
  primaryName: string | null;
  /** Name in Arabic script */
  nameArabic: string | null;
  /** Name in English/Latin script */
  nameEnglish: string | null;
  /** Name in Nobiin (Coptic) script */
  nameNobiin: string | null;
  sex: Sex;
  birthDate: string | null;
  deathDate: string | null;
  isLiving: boolean;
  generationLevel: number;
  relationshipType: string;  // 'root' | 'ancestor' | 'descendant' | 'spouse'
  parentId: string | null;
  spouseUnionId: string | null;
  /** @deprecated Use nameArabic, nameEnglish, nameNobiin directly */
  names?: SearchPersonName[];
}

// ============================================================================
// PERSON DETAILS (complete profile)
// ============================================================================

/**
 * Complete person details with all related data
 */
export interface PersonDetailsResult {
  id: string;
  orgId: string;
  familyId: string | null;
  familyName: string | null;
  primaryName: string | null;
  /** Name in Arabic script */
  nameArabic: string | null;
  /** Name in English/Latin script */
  nameEnglish: string | null;
  /** Name in Nobiin (Coptic) script */
  nameNobiin: string | null;
  sex: Sex;
  birthDate: string | null;
  birthPlaceId: string | null;
  birthPlaceName: string | null;
  deathDate: string | null;
  deathPlaceId: string | null;
  deathPlaceName: string | null;
  occupation: string | null;
  education: string | null;
  religion: string | null;
  nationality: string | null;
  notes: string | null;
  isLiving: boolean;
  /** @deprecated Use nameArabic, nameEnglish, nameNobiin directly */
  names?: SearchPersonName[];
  parents: RelatedPerson[];
  children: RelatedPerson[];
  spouses: SpouseInfo[];
  siblings: RelatedPerson[];
}

export interface RelatedPerson {
  id: string;
  primaryName: string | null;
  sex: Sex;
  birthYear: number | null;
  isLiving: boolean;
  relationshipType: string | null;
}

export interface SpouseInfo extends RelatedPerson {
  unionId: string;
  unionType: number;
  marriageDate: string | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Language type for display name */
export type DisplayLanguage = 'ar' | 'en' | 'nob';

/** Interface for objects with direct name columns */
export interface HasDirectNames {
  primaryName?: string | null;
  nameArabic?: string | null;
  nameEnglish?: string | null;
  nameNobiin?: string | null;
}

/**
 * Get the display name for a person based on language preference
 * Falls back to other available names if preferred language is not available
 */
export function getDisplayName(person: HasDirectNames, language: DisplayLanguage = 'en'): string {
  switch (language) {
    case 'ar':
      return person.nameArabic || person.nameEnglish || person.primaryName || 'Unknown';
    case 'nob':
      return person.nameNobiin || person.nameEnglish || person.primaryName || 'Unknown';
    case 'en':
    default:
      return person.nameEnglish || person.nameArabic || person.primaryName || 'Unknown';
  }
}

/**
 * Get the primary name from a SearchPersonItem
 * Uses direct name columns with fallback to legacy names array
 */
export function getPrimaryName(person: SearchPersonItem): string {
  // Prefer direct columns
  if (person.primaryName) return person.primaryName;
  if (person.nameEnglish) return person.nameEnglish;
  if (person.nameArabic) return person.nameArabic;
  if (person.nameNobiin) return person.nameNobiin;

  // Fallback to legacy names array
  if (person.names && person.names.length > 0) {
    const primary = person.names.find(n => n.isPrimary) || person.names[0];
    return primary?.fullName || 'Unknown';
  }

  return 'Unknown';
}

/**
 * Get Arabic name if available
 */
export function getArabicName(person: HasDirectNames): string | null {
  return person.nameArabic || null;
}

/**
 * Get Latin/English name if available
 */
export function getLatinName(person: HasDirectNames): string | null {
  return person.nameEnglish || null;
}

/**
 * Get Coptic/Nobiin name if available
 */
export function getCopticName(person: HasDirectNames): string | null {
  return person.nameNobiin || null;
}

/**
 * Get name in specific script
 */
export function getNameByScript(person: HasDirectNames, script: string): string | null {
  const scriptLower = script.toLowerCase();
  switch (scriptLower) {
    case 'arabic':
    case 'ar':
      return person.nameArabic || null;
    case 'latin':
    case 'english':
    case 'en':
      return person.nameEnglish || null;
    case 'coptic':
    case 'nobiin':
    case 'nob':
      return person.nameNobiin || null;
    default:
      return null;
  }
}

/**
 * Convert SearchPersonItem to PersonListItem format for backward compatibility
 */
export function toPersonListItem(item: SearchPersonItem): import('./person.models').PersonListItem {
  return {
    id: item.id,
    familyId: item.familyId,
    familyName: item.familyName,
    primaryName: getPrimaryName(item),
    nameArabic: item.nameArabic,
    nameEnglish: item.nameEnglish,
    nameNobiin: item.nameNobiin,
    sex: item.sex,
    birthDate: item.birthDate,
    birthPrecision: 0, // DatePrecision.Exact
    deathDate: item.deathDate,
    deathPrecision: 0,
    birthPlace: item.birthPlaceName,
    deathPlace: null,
    isVerified: false,
    needsReview: false,
    mediaCount: item.mediaCount
  };
}