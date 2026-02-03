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

// ============================================================================
// Two-Phase Registration (Secure)
// ============================================================================

/**
 * Phase 1: Initiate registration request.
 * Password is sent once here, then stored encrypted on server.
 */
export interface InitiateRegistrationRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  homeTownId?: string;
}

/**
 * Phase 1 response - returns registration token (NOT password).
 * SECURITY: Frontend stores only the token, not the password.
 */
export interface InitiateRegistrationResponse {
  success: boolean;
  message: string;
  maskedEmail: string;
  registrationToken: string | null;
}

/**
 * Phase 2: Complete registration using token + code.
 * SECURITY: Password is NOT sent again.
 */
export interface CompleteRegistrationRequest {
  registrationToken: string;
  code: string;
}

export interface CompleteRegistrationResponse {
  success: boolean;
  message: string;
  tokens?: AuthResponse;
}

// ============================================================================
// Email Verification & Password Reset
// ============================================================================

export interface ResendCodeRequest {
  email: string;
  purpose: 'Registration' | 'PasswordReset';
}

export interface ResendCodeResponse {
  success: boolean;
  message: string;
  retryAfterSeconds?: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Auth Response & User
// ============================================================================

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
  homeTownId: string | null;
  homeTownName: string | null;
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
