export interface Person {
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
  gender: string | null;
  birthDate: string | null;
  birthPrecision: DatePrecision;
  birthPlaceId: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPrecision: DatePrecision;
  deathPlaceId: string | null;
  deathPlace: string | null;
  privacyLevel: PrivacyLevel;
  occupation: string | null;
  education: string | null;
  religion: string | null;
  nationality: string | null;
  ethnicity: string | null;
  isVerified: boolean;
  needsReview: boolean;
  hasConflict: boolean;
  createdAt: string;
  updatedAt: string;
  /** @deprecated Use nameArabic, nameEnglish, nameNobiin directly */
  names: PersonName[];
  /** Avatar/profile picture media ID */
  avatarMediaId: string | null;
}

export interface PersonListItem {
  id: string;
  familyId: string | null;
  familyName: string | null;
  primaryName: string | null;
  /** Name in Arabic script */
  nameArabic?: string | null;
  /** Name in English/Latin script */
  nameEnglish?: string | null;
  /** Name in Nobiin (Coptic) script */
  nameNobiin?: string | null;
  sex: Sex;
  birthDate: string | null;
  birthPrecision: DatePrecision;
  deathDate: string | null;
  deathPrecision: DatePrecision;
  birthPlace: string | null;
  deathPlace: string | null;
  isVerified: boolean;
  needsReview: boolean;
  mediaCount: number;
  /** Avatar/profile picture media ID */
  avatarMediaId?: string | null;
}

export interface PersonName {
  id: string;
  script: string | null;
  given: string | null;
  middle: string | null;
  family: string | null;
  full: string | null;
  transliteration: string | null;
  type: NameType;
}

export enum Sex {
  Male = 'Male',
  Female = 'Female',
  Unknown = 'Unknown'
}

export enum NameType {
  Primary = 0,
  Alias = 1,
  Maiden = 2,
  Married = 3,
  Nickname = 4,
  Birth = 5
}

export enum DatePrecision {
  Exact = 0,
  About = 1,
  Between = 2,
  Before = 3,
  After = 4,
  Unknown = 5
}

export enum PrivacyLevel {
  Public = 0,
  Family = 1,
  Private = 2
}

export interface CreatePersonRequest {
  primaryName: string;
  /** Name in Arabic script */
  nameArabic?: string;
  /** Name in English/Latin script */
  nameEnglish?: string;
  /** Name in Nobiin (Coptic) script */
  nameNobiin?: string;
  sex: Sex;
  gender?: string;
  familyId?: string;
  birthDate?: string;
  birthPrecision?: DatePrecision;
  birthPlaceId?: string;
  deathDate?: string;
  deathPrecision?: DatePrecision;
  deathPlaceId?: string;
  privacyLevel: PrivacyLevel;
  occupation?: string;
  education?: string;
  religion?: string;
  nationality?: string;
  ethnicity?: string;
  /** @deprecated Use nameArabic, nameEnglish, nameNobiin directly */
  names?: CreatePersonNameRequest[];
}

export interface UpdatePersonRequest {
  primaryName?: string;
  /** Name in Arabic script */
  nameArabic?: string;
  /** Name in English/Latin script */
  nameEnglish?: string;
  /** Name in Nobiin (Coptic) script */
  nameNobiin?: string;
  sex?: Sex;
  gender?: string;
  familyId?: string;
  birthDate?: string;
  birthPrecision?: DatePrecision;
  birthPlaceId?: string;
  deathDate?: string;
  deathPrecision?: DatePrecision;
  deathPlaceId?: string;
  privacyLevel?: PrivacyLevel;
  occupation?: string;
  education?: string;
  religion?: string;
  nationality?: string;
  ethnicity?: string;
  isVerified?: boolean;
  needsReview?: boolean;
  /** Avatar/profile picture media ID. Set to null to remove avatar. */
  avatarMediaId?: string | null;
}

export interface CreatePersonNameRequest {
  script?: string;
  given?: string;
  middle?: string;
  family?: string;
  full?: string;
  transliteration?: string;
  type: NameType;
}

export interface PersonSearchRequest {
  townId?: string;  // Optional: filter by town (searches across all trees in the town)
  nameQuery?: string;
  sex?: Sex;
  birthDateFrom?: string;
  birthDateTo?: string;
  deathDateFrom?: string;
  deathDateTo?: string;
  birthPlaceId?: string;
  deathPlaceId?: string;
  privacyLevel?: PrivacyLevel;
  isVerified?: boolean;
  needsReview?: boolean;
  page: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type PersonSearchResponse = PagedResult<PersonListItem>;

// ========================================================================
// AVATAR TYPES
// ========================================================================

/**
 * Request to upload an avatar atomically (creates media + sets AvatarMediaId in one call)
 */
export interface UploadAvatarRequest {
  base64Data: string;
  fileName: string;
  mimeType: string;
}

/**
 * Response after successful avatar upload
 */
export interface UploadAvatarResponse {
  personId: string;
  mediaId: string;
  thumbnailUrl?: string;
}
