export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailConfirmed: boolean;
  orgId: string | null;
  orgName: string | null;
  role: OrgRole;
  systemRole: SystemRole;
  preferredLanguage: string;
  isFirstLogin: boolean;
  selectedTownId: string | null;
  selectedTownName: string | null;
}

// System-wide roles (via ASP.NET Identity)
export type SystemRole = 'SuperAdmin' | 'Admin' | 'User';

// Tree-specific roles (OrgUsers.Role)
export enum OrgRole {
  Viewer = 0,
  Contributor = 1,
  Editor = 2,
  SubAdmin = 3,
  Admin = 4,
  Owner = 5
}

export const OrgRoleLabels: Record<OrgRole, string> = {
  [OrgRole.Viewer]: 'Viewer',
  [OrgRole.Contributor]: 'Contributor',
  [OrgRole.Editor]: 'Editor',
  [OrgRole.SubAdmin]: 'Sub-Admin',
  [OrgRole.Admin]: 'Admin',
  [OrgRole.Owner]: 'Owner'
};

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ============================================================================
// Governance Model - Language and Town Selection
// ============================================================================

export interface SetLanguageRequest {
  language: string;
}

export interface SetLanguageResponse {
  language: string;
  isFirstLogin: boolean;
  user: User;
}

export interface SelectTownRequest {
  townId: string;
}

export interface SelectTownResponse {
  accessToken: string;
  townId: string;
  townName: string;
}

export interface TownInfo {
  id: string;
  name: string;
  nameEn: string | null;
  nameAr: string | null;
  country: string | null;
  treeCount: number;
}

export interface AvailableTownsResponse {
  towns: TownInfo[];
}

export interface AdminLoginResponse {
  assignedTowns: TownInfo[];
  isSuperAdmin: boolean;
}
