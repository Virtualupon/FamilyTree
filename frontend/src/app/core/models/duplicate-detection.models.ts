// duplicate-detection.models.ts
// Models and helpers for duplicate person detection feature

// ============================================================================
// REQUEST INTERFACES
// ============================================================================

export interface DuplicateScanRequest {
  treeId?: string;
  targetTreeId?: string;
  mode?: string;
  minConfidence?: number;
  page?: number;
  pageSize?: number;
}

export interface DuplicateResolveRequest {
  action: 'approve_link' | 'reject' | 'merge';
  keepPersonId?: string;
  notes?: string;
}

// ============================================================================
// RESPONSE INTERFACES
// ============================================================================

export interface DuplicateCandidate {
  // Person A
  personAId: string;
  personAName: string | null;
  personANameArabic: string | null;
  personANameEnglish: string | null;
  personASex: number | string;
  personABirthDate: string | null;
  personADeathDate: string | null;
  personAOrgId: string;
  personAOrgName: string | null;

  // Person B
  personBId: string;
  personBName: string | null;
  personBNameArabic: string | null;
  personBNameEnglish: string | null;
  personBSex: number | string;
  personBBirthDate: string | null;
  personBDeathDate: string | null;
  personBOrgId: string;
  personBOrgName: string | null;

  // Match info
  matchType: string;
  confidence: number;
  similarityScore: number;

  // Name parts
  givenNameA: string | null;
  surnameA: string | null;
  givenNameB: string | null;
  surnameB: string | null;

  // Additional evidence
  sharedParentCount: number;
  evidence: any;
}

export interface DuplicateScanResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: DuplicateCandidate[];
}

export interface DuplicateSummaryItem {
  matchType: string;
  candidateCount: number;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
}

export interface DuplicateSummaryResult {
  treeId: string | null;
  treeName: string | null;
  totalCandidates: number;
  byMatchType: DuplicateSummaryItem[];
}

// ============================================================================
// LABEL MAPS
// ============================================================================

export const MatchTypeLabels: Record<string, string> = {
  name_exact: 'Exact Name Match',
  name_similar: 'Similar Name',
  mother_surn: 'Mother Surname Pattern',
  shared_parent: 'Shared Parent'
};

export const MatchTypeIcons: Record<string, string> = {
  name_exact: 'fa-equals',
  name_similar: 'fa-not-equal',
  mother_surn: 'fa-venus',
  shared_parent: 'fa-people-roof'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get localized label for match type
 */
export function getMatchTypeLabel(type: string): string {
  return MatchTypeLabels[type] || type;
}

/**
 * Get Font Awesome icon class for match type
 */
export function getMatchTypeIcon(type: string): string {
  return MatchTypeIcons[type] || 'fa-question';
}

/**
 * Get confidence class for styling
 */
export function getConfidenceClass(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 90) return 'high';
  if (confidence >= 70) return 'medium';
  return 'low';
}

/**
 * Get sex label (handles both number and string formats)
 */
export function getSexLabel(sex: number | string): string {
  if (typeof sex === 'string') {
    return sex === 'Male' || sex === '0' ? 'Male' :
           sex === 'Female' || sex === '1' ? 'Female' : 'Unknown';
  }
  return sex === 0 ? 'Male' : sex === 1 ? 'Female' : 'Unknown';
}

/**
 * Get Font Awesome icon for sex
 */
export function getSexIcon(sex: number | string): string {
  if (typeof sex === 'string') {
    return sex === 'Male' || sex === '0' ? 'fa-mars' :
           sex === 'Female' || sex === '1' ? 'fa-venus' : 'fa-genderless';
  }
  return sex === 0 ? 'fa-mars' : sex === 1 ? 'fa-venus' : 'fa-genderless';
}

/**
 * Format year from date string
 */
export function formatYear(dateString: string | null): string {
  if (!dateString) return '?';
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? '?' : date.getFullYear().toString();
}

/**
 * Get life span string
 */
export function getLifeSpan(birthDate: string | null, deathDate: string | null): string {
  const birth = formatYear(birthDate);
  const death = formatYear(deathDate);

  if (birth === '?' && death === '?') return '';
  if (death === '?') return `b. ${birth}`;
  return `${birth} - ${death}`;
}
