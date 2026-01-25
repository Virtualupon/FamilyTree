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
