// ============================================
// PersonMedia Models and Constants
// Many-to-many: Media can be linked to multiple persons
// ============================================

/**
 * Media type/kind constants
 */
export type MediaKind = 'Image' | 'Audio' | 'Video';

/**
 * Upload configuration for each media type
 */
export const MEDIA_UPLOAD_CONFIG = {
  image: {
    maxSizeMB: 10,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  audio: {
    maxSizeMB: 50,
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp3']
  },
  video: {
    maxSizeMB: 100,
    allowedTypes: ['video/mp4', 'video/webm', 'video/ogg']
  }
} as const;

/**
 * Get config key from media type
 */
export function getConfigKey(mediaKind: MediaKind): keyof typeof MEDIA_UPLOAD_CONFIG {
  return mediaKind.toLowerCase() as keyof typeof MEDIA_UPLOAD_CONFIG;
}

// ============================================
// Linked Person (for many-to-many display)
// ============================================

/**
 * Person linked to media
 */
export interface LinkedPerson {
  personId: string;
  personName: string | null;
  isPrimary: boolean;
  notes: string | null;
  notesAr: string | null;
  notesNob: string | null;
  linkedAt: string;
}

// ============================================
// Media Response DTOs
// ============================================

/**
 * List item for person's media (without Base64 data for efficiency)
 */
export interface PersonMediaListItem {
  mediaId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  mediaKind: MediaKind;
  title: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionNob: string | null;
  thumbnailPath: string | null;
  isPrimary: boolean;
  sortOrder: number;
  linkedAt: string;
  linkedPersons: LinkedPerson[];
}

/**
 * Full media with Base64 data and linked persons
 */
export interface MediaWithData {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  mediaKind: MediaKind;
  title: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionNob: string | null;
  base64Data: string;
  createdAt: string;
  linkedPersons: LinkedPerson[];
}

/**
 * Media with linked persons (without Base64 data, for upload response)
 */
export interface MediaWithPersons {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  mediaKind: MediaKind;
  title: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionNob: string | null;
  thumbnailPath: string | null;
  createdAt: string;
  updatedAt: string;
  linkedPersons: LinkedPerson[];
}

/**
 * Grouped media response by type
 */
export interface PersonMediaGrouped {
  images: PersonMediaListItem[];
  audio: PersonMediaListItem[];
  videos: PersonMediaListItem[];
}

// ============================================
// Upload Request DTOs
// ============================================

/**
 * Request for uploading media with multiple person links
 */
export interface MediaUploadRequest {
  base64Data: string;
  fileName: string;
  mimeType: string;
  title?: string;
  description?: string;
  personIds: string[];
}

/**
 * Payload prepared for upload (includes validation result)
 */
export interface MediaUploadPayload {
  base64Data: string;
  fileName: string;
  mimeType: string;
  title?: string;
  description?: string;
  personIds: string[];
  sizeBytes: number;
}

/**
 * Request to link a person to existing media
 */
export interface LinkPersonToMediaRequest {
  isPrimary?: boolean;
  notes?: string;
}

// ============================================
// Validation
// ============================================

/**
 * Validation error for media uploads
 */
export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

// ============================================
// Signed URL Response
// ============================================

/**
 * Response from signed URL endpoint
 * Used for secure media streaming with browser caching
 */
export interface SignedMediaUrl {
  url: string;
  expiresAt: string;  // ISO date string
  contentType: string;
}

// ============================================
// Legacy aliases (for backwards compatibility)
// ============================================

/** @deprecated Use MediaKind instead */
export type MediaType = MediaKind;

/** @deprecated Use PersonMediaListItem instead */
export interface PersonMediaResponse {
  id: string;
  personId: string;
  mediaType: MediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  createdAt: string;
  updatedAt: string | null;
}
