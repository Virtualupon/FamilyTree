import { OrgRole } from './auth.models';

// ============================================================================
// FAMILY TREE
// ============================================================================

export interface FamilyTree {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  allowCrossTreeLinking: boolean;
  coverImageUrl: string | null;
  ownerId: number | null;
  ownerName: string | null;
  townId: string;       // REQUIRED: Every tree belongs to a town
  townName: string;     // REQUIRED: Town name for display
  memberCount: number;
  personCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyTreeListItem {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  coverImageUrl: string | null;
  personCount: number;
  userRole: OrgRole | null;
  townId: string;       // REQUIRED: Every tree belongs to a town
  townName: string;     // REQUIRED: Town name for filtering/display
  createdAt: string;
}

/**
 * Request to create a new family tree.
 * townId is REQUIRED - every tree must belong to a town per hierarchy rules.
 */
export interface CreateFamilyTreeRequest {
  name: string;
  townId: string;       // REQUIRED: Every tree must belong to a town
  description?: string;
  isPublic?: boolean;
  allowCrossTreeLinking?: boolean;
}

export interface UpdateFamilyTreeRequest {
  name?: string;
  description?: string;
  isPublic?: boolean;
  allowCrossTreeLinking?: boolean;
  coverImageUrl?: string;
  townId?: string;
}

// ============================================================================
// TREE MEMBERS
// ============================================================================

export interface TreeMember {
  id: string;
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: OrgRole;
  joinedAt: string;
}

export interface AddTreeMemberRequest {
  userId: number;
  role: OrgRole;
}

export interface UpdateTreeMemberRoleRequest {
  role: OrgRole;
}

// ============================================================================
// INVITATIONS
// ============================================================================

export interface TreeInvitation {
  id: string;
  email: string;
  role: OrgRole;
  invitedByName: string;
  expiresAt: string;
  isAccepted: boolean;
  createdAt: string;
}

export interface CreateInvitationRequest {
  email: string;
  role: OrgRole;
  expirationDays?: number;
}

export interface AcceptInvitationRequest {
  token: string;
}

// ============================================================================
// PERSON LINKS (Cross-tree linking)
// ============================================================================

export enum PersonLinkType {
  SamePerson = 0,
  Ancestor = 1,
  Related = 2
}

export enum PersonLinkStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2
}

export const PersonLinkTypeLabels: Record<PersonLinkType, string> = {
  [PersonLinkType.SamePerson]: 'Same Person',
  [PersonLinkType.Ancestor]: 'Ancestor',
  [PersonLinkType.Related]: 'Related'
};

export const PersonLinkStatusLabels: Record<PersonLinkStatus, string> = {
  [PersonLinkStatus.Pending]: 'Pending',
  [PersonLinkStatus.Approved]: 'Approved',
  [PersonLinkStatus.Rejected]: 'Rejected'
};

export interface PersonLink {
  id: string;
  sourcePersonId: string;
  sourcePersonName: string | null;
  sourceTreeId: string;
  sourceTreeName: string | null;
  targetPersonId: string;
  targetPersonName: string | null;
  targetTreeId: string;
  targetTreeName: string | null;
  linkType: PersonLinkType;
  confidence: number;
  notes: string | null;
  status: PersonLinkStatus;
  createdByName: string | null;
  approvedByName: string | null;
  createdAt: string;
}

export interface CreatePersonLinkRequest {
  sourcePersonId: string;
  targetPersonId: string;
  linkType: PersonLinkType;
  confidence?: number;
  notes?: string;
}

export interface ApprovePersonLinkRequest {
  approve: boolean;
  notes?: string;
}

export interface PersonLinkSearchResult {
  id: string;
  primaryName: string | null;
  sex: number;
  birthDate: string | null;
  deathDate: string | null;
  treeId: string;
  treeName: string;
}

/**
 * Summary of a cross-tree link for D3 visualization
 */
export interface PersonLinkSummary {
  linkId: string;
  linkType: PersonLinkType;
  linkedPersonId: string;
  linkedPersonName: string;
  linkedTreeId: string;
  linkedTreeName: string;
  linkedTownId: string | null;
  linkedTownName: string | null;
}

/**
 * Map of person IDs to their cross-tree links for D3 visualization
 */
export type TreeLinksSummary = Record<string, PersonLinkSummary[]>;

// ============================================================================
// ADMIN
// ============================================================================

export interface AdminUser {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  systemRole: string;
  treeCount: number;
  createdAt: string;
}

export interface AdminTreeAssignment {
  id: string;
  userId: number;
  userEmail: string | null;
  userName: string | null;
  treeId: string;
  treeName: string | null;
  assignedByName: string | null;
  assignedAt: string;
}

export interface CreateAdminAssignmentRequest {
  userId: number;
  treeId: string;
}

export interface UpdateSystemRoleRequest {
  systemRole: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  systemRole?: string; // "User", "Admin", "SuperAdmin"
}

export interface PlatformStats {
  totalUsers: number;
  superAdmins: number;
  admins: number;
  totalTrees: number;
  publicTrees: number;
  totalPeople: number;
  totalMedia: number;
  totalRelationships: number;
  recentUsers: Array<{
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: string;
  }>;
  largestTrees: Array<{
    id: string;
    name: string;
    personCount: number;
  }>;
}
