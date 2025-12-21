// ============================================================================
// FAMILY MODELS
// Family groups within a family tree (Town -> Org -> Family -> Person)
// ============================================================================

/**
 * Full family response with all details
 */
export interface Family {
  id: string;
  name: string;
  nameEn: string | null;
  nameAr: string | null;
  nameLocal: string | null;
  description: string | null;
  orgId: string;
  orgName: string;
  townId: string;
  townName: string;
  patriarchId: string | null;
  patriarchName: string | null;
  matriarchId: string | null;
  matriarchName: string | null;
  color: string | null;
  sortOrder: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight family item for lists/dropdowns
 */
export interface FamilyListItem {
  id: string;
  name: string;
  nameEn: string | null;
  nameAr: string | null;
  nameLocal: string | null;
  color: string | null;
  memberCount: number;
  sortOrder: number;
}

/**
 * Request to create a new family
 */
export interface CreateFamilyRequest {
  name: string;
  orgId: string;
  nameEn?: string;
  nameAr?: string;
  nameLocal?: string;
  description?: string;
  patriarchId?: string;
  matriarchId?: string;
  color?: string;
  sortOrder?: number;
}

/**
 * Request to update an existing family
 */
export interface UpdateFamilyRequest {
  name?: string;
  nameEn?: string;
  nameAr?: string;
  nameLocal?: string;
  description?: string;
  patriarchId?: string;
  matriarchId?: string;
  color?: string;
  sortOrder?: number;
}

/**
 * Family with its members for detailed view
 */
export interface FamilyWithMembers extends Family {
  members: FamilyMember[];
}

/**
 * Lightweight member info for family member lists
 */
export interface FamilyMember {
  id: string;
  primaryName: string | null;
  sex: number;
  birthDate: string | null;
  deathDate: string | null;
  isLiving: boolean;
}

/**
 * Request to assign/remove a person to/from a family
 */
export interface AssignFamilyRequest {
  personId: string;
  familyId: string | null;  // null to remove from family
}
