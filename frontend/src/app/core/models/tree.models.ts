import { Sex } from './person.models';
import { UnionType } from './union.models';

export interface TreePersonNode {
  id: string;
  primaryName: string;
  /** Name in Arabic script */
  nameArabic?: string | null;
  /** Name in English/Latin script */
  nameEnglish?: string | null;
  /** Name in Nobiin (Coptic) script */
  nameNobiin?: string | null;
  sex: Sex;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  isLiving: boolean;
  thumbnailUrl?: string;
  avatarMediaId?: string | null;
  parents: TreePersonNode[];
  children: TreePersonNode[];
  unions: TreeUnionNode[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
}

export interface TreeUnionNode {
  id: string;
  type: UnionType;
  startDate?: string;
  endDate?: string;
  startPlace?: string;
  partners: TreePersonNode[];
  children: TreePersonNode[];
}

export interface PedigreeRequest {
  personId: string;
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  generations: number;
  includeSpouses: boolean;
}

export interface DescendantRequest {
  personId: string;
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  generations: number;
  includeSpouses: boolean;
}

export interface HourglassRequest {
  personId: string;
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  ancestorGenerations: number;
  descendantGenerations: number;
  includeSpouses: boolean;
}

export interface RelationshipCalculationRequest {
  person1Id: string;
  person2Id: string;
}

export interface RelationshipCalculationResponse {
  relationship: string;
  commonAncestorCount: number;
  commonAncestors: CommonAncestor[];
}

export interface CommonAncestor {
  personId: string;
  primaryName: string;
  generationsFromPerson1: number;
  generationsFromPerson2: number;
}

// ============================================================================
// ROOT PERSONS (TOP LEVEL) MODELS
// ============================================================================

/**
 * Response containing root persons (ancestors with no parents) of a tree
 */
export interface RootPersonsResponse {
  /** List of root persons (top-level ancestors) - limited to maxLimit */
  rootPersons: RootPersonSummary[];
  /** Total count of root persons in the tree (may exceed returned list if truncated) */
  totalCount: number;
  /** Whether more root persons exist beyond the returned limit */
  hasMore: boolean;
  /** Tree ID these root persons belong to */
  treeId: string;
  /** Tree name for display */
  treeName: string;
  /** Maximum number of root persons returned (for client awareness) */
  maxLimit: number;
}

/**
 * Summary info for a root person
 */
export interface RootPersonSummary {
  id: string;
  primaryName: string;
  nameArabic?: string | null;
  nameEnglish?: string | null;
  nameNobiin?: string | null;
  sex: Sex;
  birthDate?: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  avatarMediaId?: string | null;
  /** Number of descendants (children, grandchildren, etc.) */
  descendantCount: number;
  /** Number of direct children */
  childCount: number;
  /** Number of generations below this person (capped at maxDepth) */
  generationDepth: number;
}