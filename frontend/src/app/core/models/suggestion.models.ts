// ============================================================================
// Suggestion Models - Frontend TypeScript interfaces for the Governance Model
// ============================================================================

// Enums matching backend
export enum SuggestionType {
  AddPerson = 0,
  UpdatePerson = 1,
  AddParent = 2,
  AddChild = 3,
  AddSpouse = 4,
  RemoveRelationship = 5,
  MergePerson = 6,
  SplitPerson = 7
}

export enum SuggestionStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
  NeedsInfo = 3,
  Withdrawn = 4
}

export enum EvidenceType {
  Photo = 0,
  Document = 1,
  Audio = 2,
  Video = 3,
  Url = 4,
  OtherMedia = 5
}

export enum ConfidenceLevel {
  Certain = 0,
  Probable = 1,
  Possible = 2,
  Uncertain = 3
}

export enum RelationshipType {
  Biological = 0,
  Adoptive = 1,
  Step = 2,
  Foster = 3,
  Guardian = 4
}

export enum UnionType {
  Marriage = 0,
  CivilUnion = 1,
  Partnership = 2,
  CommonLaw = 3
}

// Label mappings for UI
export const SuggestionTypeLabels: Record<SuggestionType, string> = {
  [SuggestionType.AddPerson]: 'suggestion.type.addPerson',
  [SuggestionType.UpdatePerson]: 'suggestion.type.updatePerson',
  [SuggestionType.AddParent]: 'suggestion.type.addParent',
  [SuggestionType.AddChild]: 'suggestion.type.addChild',
  [SuggestionType.AddSpouse]: 'suggestion.type.addSpouse',
  [SuggestionType.RemoveRelationship]: 'suggestion.type.removeRelationship',
  [SuggestionType.MergePerson]: 'suggestion.type.mergePerson',
  [SuggestionType.SplitPerson]: 'suggestion.type.splitPerson'
};

export const SuggestionStatusLabels: Record<SuggestionStatus, string> = {
  [SuggestionStatus.Pending]: 'suggestion.status.pending',
  [SuggestionStatus.Approved]: 'suggestion.status.approved',
  [SuggestionStatus.Rejected]: 'suggestion.status.rejected',
  [SuggestionStatus.NeedsInfo]: 'suggestion.status.needsInfo',
  [SuggestionStatus.Withdrawn]: 'suggestion.status.withdrawn'
};

export const ConfidenceLevelLabels: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.Certain]: 'suggestion.confidence.certain',
  [ConfidenceLevel.Probable]: 'suggestion.confidence.probable',
  [ConfidenceLevel.Possible]: 'suggestion.confidence.possible',
  [ConfidenceLevel.Uncertain]: 'suggestion.confidence.uncertain'
};

export const EvidenceTypeLabels: Record<EvidenceType, string> = {
  [EvidenceType.Photo]: 'suggestion.evidence.photo',
  [EvidenceType.Document]: 'suggestion.evidence.document',
  [EvidenceType.Audio]: 'suggestion.evidence.audio',
  [EvidenceType.Video]: 'suggestion.evidence.video',
  [EvidenceType.Url]: 'suggestion.evidence.url',
  [EvidenceType.OtherMedia]: 'suggestion.evidence.other'
};

// ============================================================================
// Request DTOs
// ============================================================================

export interface CreateSuggestionRequest {
  treeId: string;
  type: SuggestionType;
  targetPersonId?: string;
  secondaryPersonId?: string;
  targetUnionId?: string;
  proposedValues?: Record<string, any>;
  relationshipType?: RelationshipType;
  unionType?: UnionType;
  confidence: ConfidenceLevel;
  submitterNotes?: string;
  evidence?: CreateEvidenceRequest[];
}

export interface CreateEvidenceRequest {
  type: EvidenceType;
  mediaId?: string;
  url?: string;
  urlTitle?: string;
  description?: string;
  sortOrder?: number;
}

export interface CreateCommentRequest {
  content: string;
}

export interface UpdateSuggestionStatusRequest {
  status: SuggestionStatus;
  statusReason?: string;
  reviewerNotes?: string;
}

export interface WithdrawSuggestionRequest {
  reason?: string;
}

export interface SuggestionQueryParams {
  townId?: string;
  treeId?: string;
  status?: SuggestionStatus;
  type?: SuggestionType;
  submittedByUserId?: number;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDesc?: boolean;
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface SuggestionSummary {
  id: string;
  type: SuggestionType;
  status: SuggestionStatus;
  confidence: ConfidenceLevel;
  createdAt: string;
  submittedAt: string;
  submitterNotes?: string;
  townId: string;
  townName: string;
  townNameEn?: string;
  townNameAr?: string;
  treeId: string;
  treeName: string;
  targetPersonId?: string;
  targetPersonName?: string;
  secondaryPersonId?: string;
  secondaryPersonName?: string;
  submittedByUserId: number;
  submitterName: string;
  evidenceCount: number;
  commentCount: number;
}

export interface SuggestionDetail {
  id: string;
  type: SuggestionType;
  status: SuggestionStatus;
  statusReason?: string;
  confidence: ConfidenceLevel;
  createdAt: string;
  submittedAt: string;
  updatedAt: string;
  townId: string;
  townName: string;
  townNameEn?: string;
  townNameAr?: string;
  treeId: string;
  treeName: string;
  targetPersonId?: string;
  targetPerson?: PersonSummary;
  secondaryPersonId?: string;
  secondaryPerson?: PersonSummary;
  targetUnionId?: string;
  targetUnion?: UnionSummary;
  proposedValues: Record<string, any>;
  relationshipType?: RelationshipType;
  unionType?: UnionType;
  submittedByUserId: number;
  submitter: UserSummary;
  submitterNotes?: string;
  reviewedByUserId?: number;
  reviewer?: UserSummary;
  reviewedAt?: string;
  reviewerNotes?: string;
  appliedEntityType?: string;
  appliedEntityId?: string;
  evidence: Evidence[];
  comments: Comment[];
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  mediaId?: string;
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  url?: string;
  urlTitle?: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  authorUserId: number;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  isAdminComment: boolean;
  createdAt: string;
}

export interface PersonSummary {
  id: string;
  primaryName?: string;
  nameArabic?: string;
  nameEnglish?: string;
  gender?: string;
  birthDate?: string;
  deathDate?: string;
  avatarUrl?: string;
}

export interface UnionSummary {
  id: string;
  type: UnionType;
  startDate?: string;
  endDate?: string;
  members: PersonSummary[];
}

export interface UserSummary {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface SuggestionListResponse {
  items: SuggestionSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SuggestionStats {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  needsInfoCount: number;
  withdrawnCount: number;
  avgReviewTimeHours?: number;
  oldestPendingDays: number;
}

export interface DuplicateCheckResponse {
  hasDuplicate: boolean;
  existingSuggestionId?: string;
  submittedAt?: string;
  submitterName?: string;
}

export interface PendingByTown {
  townId: string;
  townName: string;
  townNameEn?: string;
  townNameAr?: string;
  pendingCount: number;
  oldestPendingAt?: string;
}

// ============================================================================
// Convenience Request DTOs (Simplified endpoints)
// ============================================================================

export interface SuggestAddPersonRequest {
  treeId: string;
  primaryName: string;
  nameEnglish?: string;
  nameArabic?: string;
  sex?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  occupation?: string;
  notes?: string;
  // Optional relationship
  relatedPersonId?: string;
  relationshipType?: 'parent' | 'child' | 'spouse';
  confidence?: ConfidenceLevel;
  submitterNotes?: string;
}

export interface SuggestAddRelationshipRequest {
  treeId: string;
  person1Id: string;
  person2Id: string;
  relationshipType: 'parent-child' | 'spouse';
  person1IsParent?: boolean;
  marriageDate?: string;
  marriagePlace?: string;
  confidence?: ConfidenceLevel;
  submitterNotes?: string;
}

export interface SuggestionSubmittedResponse {
  suggestionId: string;
  status: string;
  message: string;
  submittedAt: string;
}
