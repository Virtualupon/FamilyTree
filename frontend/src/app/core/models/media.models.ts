// ============================================
// Media Gallery Models
// Organization-wide media search and display
// ============================================

import { LinkedPerson } from './person-media.models';

/**
 * Media type/kind for filtering
 */
export type MediaKind = 'Image' | 'Audio' | 'Video' | 'Document';

/**
 * Parameters for searching media
 */
export interface MediaSearchParams {
  kind?: MediaKind;
  personId?: string;
  captureDateFrom?: string;
  captureDateTo?: string;
  capturePlaceId?: string;
  searchTerm?: string;
  /** Exclude media that are used as avatars (Person.AvatarMediaId) */
  excludeAvatars?: boolean;
  /** Filter by approval status */
  approvalStatus?: string;
  /** Filter by tag name */
  tag?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Media item returned from search
 */
export interface MediaItem {
  id: string;
  orgId: string;
  personId?: string;
  kind: MediaKind;
  url: string;
  storageKey: string;
  fileName: string;
  mimeType?: string;
  fileSize: number;
  title?: string;
  description?: string;
  captureDate?: string;
  capturePlaceId?: string;
  placeName?: string;
  visibility: number;
  copyright?: string;
  thumbnailPath?: string;
  metadataJson?: string;
  createdAt: string;
  updatedAt: string;
  /** Approval status: Approved, Pending, Rejected */
  approvalStatus: string;
  /** Tags applied to this media */
  tags: string[];
  linkedPersons: LinkedPerson[];
}

/**
 * Paginated search result
 */
export interface MediaSearchResult {
  media: MediaItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// Media Approval Queue
// ============================================

/**
 * Item in the media approval queue
 */
export interface MediaApprovalQueueItem {
  id: string;
  orgId: string;
  treeName?: string;
  fileName: string;
  mimeType?: string;
  fileSize: number;
  kind: string;
  approvalStatus: string;
  uploaderName?: string;
  uploadedByUserId?: number;
  createdAt: string;
  title?: string;
  description?: string;
  tags: string[];
  linkedPersons: LinkedPerson[];
}

/**
 * Paginated approval queue response
 */
export interface MediaApprovalQueueResponse {
  items: MediaApprovalQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Request parameters for approval queue
 */
export interface MediaApprovalQueueParams {
  page?: number;
  pageSize?: number;
  kind?: MediaKind;
  searchTerm?: string;
}

/**
 * Cached signed URL with expiry tracking
 * Used to prevent repeated API calls and handle URL expiration
 */
export interface CachedSignedUrl {
  url: string;
  expiresAt: Date;
  contentType: string;
  mediaId: string;
}
