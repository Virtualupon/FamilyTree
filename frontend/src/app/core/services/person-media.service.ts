import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

import {
  PersonMediaListItem,
  PersonMediaGrouped,
  MediaUploadRequest,
  MediaUploadPayload,
  MediaValidationError,
  MediaKind,
  MediaWithPersons,
  MediaWithData,
  LinkedPerson,
  LinkPersonToMediaRequest,
  SignedMediaUrl,
  MEDIA_UPLOAD_CONFIG,
  getConfigKey
} from '../models/person-media.models';

@Injectable({
  providedIn: 'root'
})
export class PersonMediaService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // ========================================================================
  // MEDIA UPLOAD & DELETE (at /api/media level)
  // ========================================================================

  /**
   * Upload media and link to specified persons
   * POST /api/media
   */
  uploadMedia(payload: MediaUploadPayload): Observable<MediaWithPersons> {
    const request: MediaUploadRequest = {
      base64Data: payload.base64Data,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      title: payload.title,
      description: payload.description,
      personIds: payload.personIds
    };
    return this.http.post<MediaWithPersons>(`${this.apiUrl}/media`, request);
  }

  /**
   * Get a single media with Base64 data and linked persons
   * GET /api/media/{mediaId}
   */
  getMediaById(mediaId: string): Observable<MediaWithData> {
    return this.http.get<MediaWithData>(`${this.apiUrl}/media/${mediaId}`);
  }

  /**
   * Delete media and all its person links
   * DELETE /api/media/{mediaId}
   */
  deleteMedia(mediaId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/media/${mediaId}`);
  }

  /**
   * Get all persons linked to a media
   * GET /api/media/{mediaId}/persons
   */
  getLinkedPersons(mediaId: string): Observable<LinkedPerson[]> {
    return this.http.get<LinkedPerson[]>(`${this.apiUrl}/media/${mediaId}/persons`);
  }

  /**
   * Get a signed URL for secure media streaming
   * GET /api/media/{mediaId}/signed-url
   *
   * Use this for displaying images, audio, and video.
   * The URL can be used directly in <img src>, <audio src>, <video src>.
   * Browser will cache the media via HTTP headers.
   *
   * @param mediaId The media ID
   * @param expiresInSeconds URL validity (default 1 hour, max 24 hours)
   */
  getSignedUrl(mediaId: string, expiresInSeconds = 3600): Observable<SignedMediaUrl> {
    return this.http.get<SignedMediaUrl>(
      `${this.apiUrl}/media/${mediaId}/signed-url`,
      { params: { expiresInSeconds: expiresInSeconds.toString() } }
    );
  }

  // ========================================================================
  // PERSON-SPECIFIC MEDIA ENDPOINTS
  // ========================================================================

  /**
   * Get all media for a person with linked persons info
   * GET /api/persons/{personId}/media
   */
  getMediaByPerson(personId: string): Observable<PersonMediaListItem[]> {
    return this.http.get<PersonMediaListItem[]>(`${this.apiUrl}/persons/${personId}/media`);
  }

  /**
   * Get all media for a person grouped by type
   * GET /api/persons/{personId}/media/grouped
   */
  getMediaByPersonGrouped(personId: string): Observable<PersonMediaGrouped> {
    return this.http.get<PersonMediaGrouped>(`${this.apiUrl}/persons/${personId}/media/grouped`);
  }

  /**
   * Link a person to existing media
   * POST /api/persons/{personId}/media/{mediaId}/link
   */
  linkPersonToMedia(personId: string, mediaId: string, request?: LinkPersonToMediaRequest): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/persons/${personId}/media/${mediaId}/link`,
      request || {}
    );
  }

  /**
   * Unlink a person from media
   * DELETE /api/persons/{personId}/media/{mediaId}/link
   */
  unlinkPersonFromMedia(personId: string, mediaId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/persons/${personId}/media/${mediaId}/link`);
  }

  // ========================================================================
  // VALIDATION AND PREPARATION METHODS
  // ========================================================================

  /**
   * Validates a file and prepares it for upload
   * @throws MediaValidationError if validation fails
   */
  async validateAndPrepareUpload(file: File, personIds: string[], title?: string, description?: string): Promise<MediaUploadPayload> {
    // Detect media kind from MIME type
    const mediaKind = this.detectMediaKind(file.type);
    if (!mediaKind) {
      throw new MediaValidationError(`Unsupported file type: ${file.type}`);
    }

    // Validate file type
    const configKey = getConfigKey(mediaKind);
    const config = MEDIA_UPLOAD_CONFIG[configKey];

    if (!this.isValidFileType(file, config.allowedTypes as unknown as string[])) {
      throw new MediaValidationError(
        `Invalid file type "${file.type}" for ${mediaKind}. Allowed: ${config.allowedTypes.join(', ')}`
      );
    }

    // Validate file size
    if (!this.isValidFileSize(file, config.maxSizeMB)) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new MediaValidationError(
        `File size (${sizeMB} MB) exceeds maximum (${config.maxSizeMB} MB) for ${mediaKind}`
      );
    }

    // Validate personIds
    if (!personIds || personIds.length === 0) {
      throw new MediaValidationError('At least one person must be specified');
    }

    // Convert to Base64
    const base64Data = await this.fileToBase64(file);

    return {
      base64Data,
      fileName: file.name,
      mimeType: file.type,
      title,
      description,
      personIds,
      sizeBytes: file.size
    };
  }

  /**
   * Check if file type is allowed
   */
  isValidFileType(file: File, allowedTypes: string[]): boolean {
    return allowedTypes.includes(file.type);
  }

  /**
   * Check if file size is within limit
   */
  isValidFileSize(file: File, maxSizeMB: number): boolean {
    const maxBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxBytes;
  }

  /**
   * Detect media kind from MIME type
   */
  detectMediaKind(mimeType: string): MediaKind | null {
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.startsWith('video/')) return 'Video';
    return null;
  }

  // ========================================================================
  // BASE64 CONVERSION METHODS
  // ========================================================================

  /**
   * Convert File to Base64 string
   */
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix if present (e.g., "data:image/png;base64,")
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert Blob to Base64 string
   */
  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert Base64 string to Blob
   */
  base64ToBlob(base64: string, contentType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  /**
   * Create an object URL from Base64 data for displaying media
   */
  createObjectUrl(base64: string, mimeType: string): string {
    const blob = this.base64ToBlob(base64, mimeType);
    return URL.createObjectURL(blob);
  }

  /**
   * Revoke an object URL to free memory
   */
  revokeObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file extension from MIME type
   */
  getExtensionFromMimeType(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/webm': '.webm',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogg'
    };
    return extensions[mimeType] || '';
  }

  /**
   * Get MIME type from file extension
   */
  getMimeTypeFromExtension(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'mp4': 'video/mp4',
      'webm': 'video/webm'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Get media kind label for display
   */
  getMediaKindLabel(mediaKind: MediaKind): string {
    switch (mediaKind) {
      case 'Image': return 'Image';
      case 'Audio': return 'Audio';
      case 'Video': return 'Video';
      default: return 'Unknown';
    }
  }

  /**
   * Get allowed file extensions for a media kind (for file input accept attribute)
   */
  getAllowedExtensions(mediaKind: MediaKind): string {
    const configKey = getConfigKey(mediaKind);
    const config = MEDIA_UPLOAD_CONFIG[configKey];
    return (config.allowedTypes as unknown as string[])
      .map(type => this.getExtensionFromMimeType(type))
      .filter(ext => ext)
      .join(',');
  }

  /**
   * Get all allowed MIME types for file input accept attribute
   */
  getAllAllowedMimeTypes(): string {
    return [
      ...MEDIA_UPLOAD_CONFIG.image.allowedTypes,
      ...MEDIA_UPLOAD_CONFIG.audio.allowedTypes,
      ...MEDIA_UPLOAD_CONFIG.video.allowedTypes
    ].join(',');
  }
}
