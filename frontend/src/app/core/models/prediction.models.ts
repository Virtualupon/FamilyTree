// prediction.models.ts
// Models and helpers for the relationship prediction engine

// ============================================================================
// REQUEST INTERFACES
// ============================================================================

export interface PredictionFilterParams {
  status?: string;           // 'New', 'Confirmed', 'Dismissed', 'Applied'
  confidenceLevel?: string;  // 'High', 'Medium', 'Low'
  ruleId?: string;           // e.g. 'spouse_child_gap'
  predictedType?: string;    // 'parent_child' or 'union'
  page?: number;
  pageSize?: number;
}

export interface BulkAcceptRequest {
  treeId?: string;
  minConfidence?: number;
}

// ============================================================================
// RESPONSE INTERFACES
// ============================================================================

export interface PredictionScanResult {
  scanBatchId: string;
  totalPredictions: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  predictions: PredictionDto[];
}

export interface PredictionDto {
  id: string;
  treeId: string;
  ruleId: string;
  ruleDescription: string;
  predictedType: string;       // 'parent_child' or 'union'
  sourcePersonId: string;
  sourcePersonName: string | null;
  sourcePersonNameArabic: string | null;
  targetPersonId: string;
  targetPersonName: string | null;
  targetPersonNameArabic: string | null;
  confidence: number;          // 0-100
  confidenceLevel: string;     // 'High', 'Medium', 'Low'
  explanation: string;
  status: number;              // 0=New, 1=Confirmed, 2=Dismissed, 3=Applied
  createdAt: string;
  scanBatchId: string | null;
}

export interface PagedPredictionResult {
  items: PredictionDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// LABEL MAPS
// ============================================================================

export const RuleLabels: Record<string, string> = {
  spouse_child_gap: 'Spouse-Child Gap',
  missing_union: 'Missing Union',
  sibling_parent_gap: 'Sibling-Parent Gap',
  patronymic_name: 'Patronymic Name',
  age_family: 'Age & Family'
};

export const RuleIcons: Record<string, string> = {
  spouse_child_gap: 'fa-people-arrows',
  missing_union: 'fa-ring',
  sibling_parent_gap: 'fa-children',
  patronymic_name: 'fa-signature',
  age_family: 'fa-cake-candles'
};

export const PredictedTypeLabels: Record<string, string> = {
  parent_child: 'Parent-Child',
  union: 'Union/Marriage'
};

export const PredictedTypeIcons: Record<string, string> = {
  parent_child: 'fa-sitemap',
  union: 'fa-ring'
};

export const StatusLabels: Record<number, string> = {
  0: 'New',
  1: 'Confirmed',
  2: 'Dismissed',
  3: 'Applied'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getRuleLabel(ruleId: string): string {
  return RuleLabels[ruleId] || ruleId;
}

export function getRuleIcon(ruleId: string): string {
  return RuleIcons[ruleId] || 'fa-question';
}

export function getPredictedTypeLabel(type: string): string {
  return PredictedTypeLabels[type] || type;
}

export function getPredictedTypeIcon(type: string): string {
  return PredictedTypeIcons[type] || 'fa-question';
}

export function getStatusLabel(status: number): string {
  return StatusLabels[status] || 'Unknown';
}

export function getConfidenceClass(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 85) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}

export function getPersonDisplayName(
  name: string | null,
  nameArabic: string | null,
  lang: string = 'en'
): string {
  if (lang === 'ar') return nameArabic || name || '?';
  return name || nameArabic || '?';
}
