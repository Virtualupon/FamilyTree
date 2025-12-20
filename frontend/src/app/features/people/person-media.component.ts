import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { PersonMediaService } from '../../core/services/person-media.service';
import { PersonService } from '../../core/services/person.service';
import { PersonListItem } from '../../core/models/person.models';
import {
  PersonMediaListItem,
  PersonMediaGrouped,
  MediaKind,
  MediaValidationError,
  LinkedPerson
} from '../../core/models/person-media.models';

@Component({
  selector: 'app-person-media',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatDialogModule
  ],
  template: `
    <div class="person-media-container">
      <!-- Header with upload button -->
      <div class="media-header">
        <h3>Media Files</h3>
        <button mat-raised-button color="primary" (click)="triggerUpload()">
          <mat-icon>add_photo_alternate</mat-icon>
          Upload Media
        </button>
        <!-- Hidden file input - accepts all media types -->
        <input
          #fileInput
          type="file"
          style="display: none"
          [accept]="acceptTypes"
          (change)="onFileSelected($event)"
        />
      </div>

      <!-- Upload progress -->
      @if (isUploading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        <p class="upload-status">Uploading {{ uploadingFileName() }}...</p>
      }

      <!-- Loading state -->
      @if (isLoading()) {
        <div class="loading">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading media...</p>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <mat-icon>error</mat-icon>
            <p>{{ error() }}</p>
            <button mat-button color="primary" (click)="loadMedia()">Retry</button>
          </mat-card-content>
        </mat-card>
      } @else if (hasNoMedia()) {
        <mat-card class="empty-state">
          <mat-card-content>
            <mat-icon>photo_library</mat-icon>
            <h4>No media files</h4>
            <p>Upload images, audio, or video files for this person.</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <!-- Media Tabs -->
        <mat-tab-group>
          <!-- Images Tab -->
          @if (mediaGrouped()?.images?.length) {
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon>image</mat-icon>
                <span class="tab-label">Images ({{ mediaGrouped()!.images.length }})</span>
              </ng-template>
              <div class="media-grid images-grid">
                @for (media of mediaGrouped()!.images; track media.mediaId) {
                  <mat-card class="media-item image-item">
                    @if (loadedImages()[media.mediaId]) {
                      <img
                        [src]="loadedImages()[media.mediaId]"
                        [alt]="media.fileName"
                        (click)="openLightbox(media)"
                      />
                    } @else {
                      <div class="image-placeholder" (click)="loadFullMedia(media)">
                        <mat-icon>image</mat-icon>
                        <span>Click to load</span>
                      </div>
                    }
                    <mat-card-content>
                      <p class="file-name" [matTooltip]="media.title || media.fileName">
                        {{ truncateFileName(media.title || media.fileName) }}
                      </p>
                      <p class="file-meta">
                        {{ formatFileSize(media.fileSize) }} &bull; {{ formatDate(media.linkedAt) }}
                      </p>
                      <!-- Description -->
                      @if (media.description) {
                        <p class="media-description">{{ media.description }}</p>
                      }
                      <!-- Linked persons -->
                      @if (media.linkedPersons && media.linkedPersons.length > 1) {
                        <div class="linked-persons">
                          <mat-icon class="linked-icon">group</mat-icon>
                          <span class="linked-count">{{ media.linkedPersons.length }} people</span>
                          <div class="linked-list">
                            @for (person of media.linkedPersons; track person.personId) {
                              <a [routerLink]="['/persons', person.personId]" class="linked-person"
                                 [class.primary]="person.isPrimary">
                                {{ person.personName || 'Unknown' }}
                                @if (person.isPrimary) {
                                  <mat-icon class="primary-badge" matTooltip="Primary">star</mat-icon>
                                }
                              </a>
                            }
                          </div>
                        </div>
                      }
                    </mat-card-content>
                    <mat-card-actions>
                      <button mat-icon-button (click)="downloadMedia(media)" matTooltip="Download">
                        <mat-icon>download</mat-icon>
                      </button>
                      <button mat-icon-button color="warn" (click)="deleteMedia(media)" matTooltip="Delete">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </mat-card-actions>
                  </mat-card>
                }
              </div>
            </mat-tab>
          }

          <!-- Audio Tab -->
          @if (mediaGrouped()?.audio?.length) {
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon>audiotrack</mat-icon>
                <span class="tab-label">Audio ({{ mediaGrouped()!.audio.length }})</span>
              </ng-template>
              <div class="media-list audio-list">
                @for (media of mediaGrouped()!.audio; track media.mediaId) {
                  <mat-card class="media-item audio-item">
                    <mat-card-content>
                      <div class="audio-header">
                        <mat-icon class="audio-icon">audiotrack</mat-icon>
                        <div class="audio-info">
                          <p class="file-name" [matTooltip]="media.title || media.fileName">
                            {{ media.title || media.fileName }}
                          </p>
                          <p class="file-meta">
                            {{ formatFileSize(media.fileSize) }} &bull; {{ formatDate(media.linkedAt) }}
                          </p>
                          <!-- Description -->
                          @if (media.description) {
                            <p class="media-description">{{ media.description }}</p>
                          }
                          <!-- Linked persons -->
                          @if (media.linkedPersons && media.linkedPersons.length > 1) {
                            <div class="linked-persons inline">
                              <mat-icon class="linked-icon small">group</mat-icon>
                              <span class="linked-count">Shared with {{ media.linkedPersons.length }} people</span>
                            </div>
                          }
                        </div>
                        <div class="audio-actions">
                          <button mat-icon-button (click)="downloadMedia(media)" matTooltip="Download">
                            <mat-icon>download</mat-icon>
                          </button>
                          <button mat-icon-button color="warn" (click)="deleteMedia(media)" matTooltip="Delete">
                            <mat-icon>delete</mat-icon>
                          </button>
                        </div>
                      </div>
                      @if (loadedAudio()[media.mediaId]) {
                        <audio controls class="audio-player">
                          <source [src]="loadedAudio()[media.mediaId]" [type]="media.mimeType" />
                          Your browser does not support the audio element.
                        </audio>
                      } @else {
                        <button mat-stroked-button (click)="loadFullMedia(media)">
                          <mat-icon>play_arrow</mat-icon>
                          Load Audio
                        </button>
                      }
                    </mat-card-content>
                  </mat-card>
                }
              </div>
            </mat-tab>
          }

          <!-- Videos Tab -->
          @if (mediaGrouped()?.videos?.length) {
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon>videocam</mat-icon>
                <span class="tab-label">Videos ({{ mediaGrouped()!.videos.length }})</span>
              </ng-template>
              <div class="media-list video-list">
                @for (media of mediaGrouped()!.videos; track media.mediaId) {
                  <mat-card class="media-item video-item">
                    <mat-card-content>
                      <div class="video-header">
                        <mat-icon class="video-icon">videocam</mat-icon>
                        <div class="video-info">
                          <p class="file-name" [matTooltip]="media.title || media.fileName">
                            {{ media.title || media.fileName }}
                          </p>
                          <p class="file-meta">
                            {{ formatFileSize(media.fileSize) }} &bull; {{ formatDate(media.linkedAt) }}
                          </p>
                          <!-- Description -->
                          @if (media.description) {
                            <p class="media-description">{{ media.description }}</p>
                          }
                          <!-- Linked persons -->
                          @if (media.linkedPersons && media.linkedPersons.length > 1) {
                            <div class="linked-persons inline">
                              <mat-icon class="linked-icon small">group</mat-icon>
                              <span class="linked-count">Shared with {{ media.linkedPersons.length }} people</span>
                            </div>
                          }
                        </div>
                        <div class="video-actions">
                          <button mat-icon-button (click)="downloadMedia(media)" matTooltip="Download">
                            <mat-icon>download</mat-icon>
                          </button>
                          <button mat-icon-button color="warn" (click)="deleteMedia(media)" matTooltip="Delete">
                            <mat-icon>delete</mat-icon>
                          </button>
                        </div>
                      </div>
                      @if (loadedVideos()[media.mediaId]) {
                        <video controls class="video-player">
                          <source [src]="loadedVideos()[media.mediaId]" [type]="media.mimeType" />
                          Your browser does not support the video element.
                        </video>
                      } @else {
                        <button mat-stroked-button (click)="loadFullMedia(media)">
                          <mat-icon>play_arrow</mat-icon>
                          Load Video
                        </button>
                      }
                    </mat-card-content>
                  </mat-card>
                }
              </div>
            </mat-tab>
          }
        </mat-tab-group>
      }

      <!-- Lightbox for images -->
      @if (lightboxImage()) {
        <div class="lightbox" (click)="closeLightbox()">
          <button mat-icon-button class="lightbox-close">
            <mat-icon>close</mat-icon>
          </button>
          <img [src]="lightboxImage()" alt="Full size image" />
        </div>
      }

      <!-- Upload Dialog Overlay -->
      @if (showUploadDialog()) {
        <div class="upload-dialog-overlay" (click)="closeUploadDialog()">
          <div class="upload-dialog" (click)="$event.stopPropagation()">
            <div class="upload-dialog-header">
              <h3>Upload Media</h3>
              <button mat-icon-button (click)="closeUploadDialog()">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <div class="upload-dialog-content">
              <!-- Selected file info -->
              @if (selectedFile()) {
                <div class="selected-file-info">
                  <mat-icon>{{ getFileIcon(selectedFile()!.type) }}</mat-icon>
                  <div class="file-details">
                    <span class="file-name">{{ selectedFile()!.name }}</span>
                    <span class="file-size">{{ formatFileSize(selectedFile()!.size) }}</span>
                  </div>
                  <button mat-icon-button (click)="clearSelectedFile()">
                    <mat-icon>clear</mat-icon>
                  </button>
                </div>
              } @else {
                <div class="drop-zone" (click)="triggerFileInput()">
                  <mat-icon>cloud_upload</mat-icon>
                  <p>Click to select a file</p>
                  <span class="drop-hint">Images, audio, or video</span>
                </div>
              }

              <!-- Description field -->
              @if (selectedFile()) {
                <mat-form-field appearance="outline" class="description-field">
                  <mat-label>Description (optional)</mat-label>
                  <textarea matInput
                            [(ngModel)]="mediaDescription"
                            placeholder="Add a description for this media..."
                            rows="3"
                            maxlength="500"></textarea>
                  <mat-hint align="end">{{ mediaDescription.length }}/500</mat-hint>
                </mat-form-field>
              }

              <!-- Person selection section -->
              <div class="person-selection-section">
                <h4>Tag People in This Media</h4>
                <p class="selection-hint">This media will be linked to the selected people.</p>

                <!-- Search input -->
                <mat-form-field appearance="outline" class="search-field">
                  <mat-label>Search people to tag</mat-label>
                  <input matInput
                         [(ngModel)]="personSearchQuery"
                         (ngModelChange)="onSearchQueryChange($event)"
                         placeholder="Type a name to search...">
                  <mat-icon matSuffix>search</mat-icon>
                </mat-form-field>

                <!-- Selected persons chips -->
                @if (selectedPersons().length > 0) {
                  <div class="selected-persons-chips">
                    @for (person of selectedPersons(); track person.id) {
                      <div class="person-chip" [class.current]="person.id === personId">
                        <span>{{ person.primaryName || 'Unknown' }}</span>
                        @if (person.id === personId) {
                          <span class="current-badge">(current)</span>
                        }
                        @if (person.id !== personId) {
                          <button mat-icon-button class="remove-btn" (click)="togglePersonSelection(person)">
                            <mat-icon>close</mat-icon>
                          </button>
                        }
                      </div>
                    }
                  </div>
                }

                <!-- Search results -->
                @if (isSearching()) {
                  <div class="search-loading">
                    <mat-spinner diameter="24"></mat-spinner>
                    <span>Searching...</span>
                  </div>
                } @else if (personSearchResults().length > 0) {
                  <div class="search-results">
                    @for (person of personSearchResults(); track person.id) {
                      <div class="search-result-item"
                           [class.selected]="isPersonSelected(person.id)"
                           (click)="togglePersonSelection(person)">
                        <mat-checkbox
                          [checked]="isPersonSelected(person.id)"
                          [disabled]="person.id === personId"
                          (click)="$event.stopPropagation()">
                        </mat-checkbox>
                        <div class="person-info">
                          <span class="person-name">{{ person.primaryName || 'Unknown' }}</span>
                          @if (person.birthDate || person.deathDate) {
                            <span class="person-dates">{{ getLifespan(person) }}</span>
                          }
                        </div>
                        @if (person.id === personId) {
                          <span class="current-label">Current person</span>
                        }
                      </div>
                    }
                  </div>
                } @else if (personSearchQuery && personSearchQuery.length >= 2) {
                  <div class="no-results">
                    <mat-icon>person_search</mat-icon>
                    <span>No people found matching "{{ personSearchQuery }}"</span>
                  </div>
                }
              </div>
            </div>

            <div class="upload-dialog-actions">
              <button mat-button (click)="closeUploadDialog()">Cancel</button>
              <button mat-raised-button color="primary"
                      [disabled]="!selectedFile() || selectedPersons().length === 0 || isUploading()"
                      (click)="performUpload()">
                @if (isUploading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon>upload</mat-icon>
                }
                Upload
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .person-media-container {
      padding: 16px 0;
    }

    .media-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .media-header h3 {
      margin: 0;
      font-size: 18px;
    }

    .upload-status {
      text-align: center;
      color: rgba(0, 0, 0, 0.6);
      font-size: 14px;
      margin: 8px 0;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      gap: 16px;
    }

    .error-card, .empty-state {
      text-align: center;
      padding: 24px;
    }

    .error-card mat-icon, .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: rgba(0, 0, 0, 0.3);
    }

    .error-card mat-icon {
      color: #f44336;
    }

    .empty-state h4 {
      margin: 16px 0 8px 0;
    }

    .empty-state p {
      color: rgba(0, 0, 0, 0.6);
      margin: 0;
    }

    .tab-label {
      margin-left: 8px;
    }

    /* Images Grid */
    .images-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      padding: 16px 0;
    }

    .image-item {
      overflow: hidden;
    }

    .image-item img {
      width: 100%;
      height: 150px;
      object-fit: cover;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .image-item img:hover {
      transform: scale(1.02);
    }

    .image-placeholder {
      width: 100%;
      height: 150px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
      cursor: pointer;
      color: rgba(0, 0, 0, 0.5);
    }

    .image-placeholder:hover {
      background: #eeeeee;
    }

    .image-placeholder mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .image-placeholder span {
      font-size: 12px;
      margin-top: 8px;
    }

    /* Audio & Video Lists */
    .media-list {
      padding: 16px 0;
    }

    .audio-item, .video-item {
      margin-bottom: 16px;
    }

    .audio-header, .video-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 12px;
    }

    .audio-icon, .video-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #1976d2;
    }

    .audio-info, .video-info {
      flex: 1;
    }

    .audio-actions, .video-actions {
      display: flex;
      gap: 4px;
    }

    .audio-player {
      width: 100%;
      margin-top: 8px;
    }

    .video-player {
      width: 100%;
      max-height: 400px;
      margin-top: 8px;
      background: #000;
    }

    /* Common styles */
    .file-name {
      margin: 0;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-meta {
      margin: 4px 0 0 0;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }

    mat-card-actions {
      display: flex;
      justify-content: flex-end;
      padding: 0 8px 8px 8px;
    }

    /* Linked persons styles */
    .linked-persons {
      margin-top: 8px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .linked-persons.inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: none;
      padding: 0;
      margin-top: 4px;
    }

    .linked-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: rgba(0, 0, 0, 0.5);
      vertical-align: middle;
    }

    .linked-icon.small {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .linked-count {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
      margin-left: 4px;
    }

    .linked-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .linked-person {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: white;
      border-radius: 16px;
      font-size: 12px;
      color: #1976d2;
      text-decoration: none;
      transition: background-color 0.2s;
    }

    .linked-person:hover {
      background: #e3f2fd;
    }

    .linked-person.primary {
      background: #fff3e0;
      color: #f57c00;
    }

    .linked-person.primary:hover {
      background: #ffe0b2;
    }

    .primary-badge {
      font-size: 12px;
      width: 12px;
      height: 12px;
      color: #f57c00;
    }

    /* Lightbox */
    .lightbox {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      cursor: pointer;
    }

    .lightbox img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    }

    .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      color: white;
    }

    /* Upload Dialog Styles */
    .upload-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .upload-dialog {
      background: white;
      border-radius: 8px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .upload-dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }

    .upload-dialog-header h3 {
      margin: 0;
      font-size: 18px;
    }

    .upload-dialog-content {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .drop-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s;
    }

    .drop-zone:hover {
      border-color: #1976d2;
      background: #f5f5f5;
    }

    .drop-zone mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #9e9e9e;
    }

    .drop-zone p {
      margin: 12px 0 4px 0;
      font-size: 16px;
      color: rgba(0, 0, 0, 0.87);
    }

    .drop-hint {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }

    .selected-file-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #e3f2fd;
      border-radius: 8px;
    }

    .selected-file-info mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1976d2;
    }

    .file-details {
      flex: 1;
      min-width: 0;
    }

    .file-details .file-name {
      display: block;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-details .file-size {
      display: block;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }

    .person-selection-section {
      margin-top: 24px;
    }

    .person-selection-section h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 500;
    }

    .selection-hint {
      margin: 0 0 16px 0;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }

    .search-field {
      width: 100%;
    }

    .selected-persons-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }

    .person-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      background: #e3f2fd;
      border-radius: 16px;
      font-size: 13px;
      color: #1565c0;
    }

    .person-chip.current {
      background: #fff3e0;
      color: #ef6c00;
    }

    .current-badge {
      font-size: 11px;
      opacity: 0.8;
    }

    .person-chip .remove-btn {
      width: 20px;
      height: 20px;
      line-height: 20px;
    }

    .person-chip .remove-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .search-loading {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      color: rgba(0, 0, 0, 0.6);
    }

    .search-results {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }

    .search-result-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .search-result-item:hover {
      background: #f5f5f5;
    }

    .search-result-item.selected {
      background: #e3f2fd;
    }

    .person-info {
      flex: 1;
      min-width: 0;
    }

    .person-name {
      display: block;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .person-dates {
      display: block;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }

    .current-label {
      font-size: 11px;
      color: #ef6c00;
      background: #fff3e0;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .no-results {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      color: rgba(0, 0, 0, 0.6);
    }

    .no-results mat-icon {
      color: rgba(0, 0, 0, 0.3);
    }

    .upload-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
    }

    .upload-dialog-actions button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    .description-field {
      width: 100%;
      margin-top: 16px;
    }

    .description-field textarea {
      resize: vertical;
      min-height: 60px;
    }

    .media-description {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.7);
      margin-top: 4px;
      line-height: 1.4;
    }

    .media-description-empty {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.4);
      font-style: italic;
      margin-top: 4px;
    }
  `]
})
export class PersonMediaComponent implements OnInit, OnDestroy {
  @Input({ required: true }) personId!: string;

  private mediaService = inject(PersonMediaService);
  private personService = inject(PersonService);
  private snackBar = inject(MatSnackBar);

  // State
  isLoading = signal(true);
  isUploading = signal(false);
  uploadingFileName = signal('');
  error = signal<string | null>(null);
  mediaGrouped = signal<PersonMediaGrouped | null>(null);

  // Loaded media URLs (for lazy loading) - keyed by mediaId (string)
  loadedImages = signal<Record<string, string>>({});
  loadedAudio = signal<Record<string, string>>({});
  loadedVideos = signal<Record<string, string>>({});

  // Lightbox
  lightboxImage = signal<string | null>(null);

  // Upload dialog state
  showUploadDialog = signal(false);
  selectedFile = signal<File | null>(null);
  selectedPersons = signal<PersonListItem[]>([]);
  personSearchQuery = '';
  mediaDescription = '';
  personSearchResults = signal<PersonListItem[]>([]);
  isSearching = signal(false);
  private searchSubject = new Subject<string>();

  // Upload state
  private objectUrls: string[] = [];

  // Accept all media types
  acceptTypes = this.mediaService.getAllAllowedMimeTypes();

  hasNoMedia = computed(() => {
    const grouped = this.mediaGrouped();
    if (!grouped) return true;
    return (
      (!grouped.images || grouped.images.length === 0) &&
      (!grouped.audio || grouped.audio.length === 0) &&
      (!grouped.videos || grouped.videos.length === 0)
    );
  });

  ngOnInit() {
    this.loadMedia();
    this.setupSearchDebounce();
  }

  ngOnDestroy() {
    // Clean up object URLs
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
    this.searchSubject.complete();
  }

  private setupSearchDebounce() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      if (query.length >= 2) {
        this.searchPersons(query);
      } else {
        this.personSearchResults.set([]);
      }
    });
  }

  loadMedia() {
    this.isLoading.set(true);
    this.error.set(null);

    this.mediaService.getMediaByPersonGrouped(this.personId).subscribe({
      next: (grouped) => {
        this.mediaGrouped.set(grouped);
        this.isLoading.set(false);
        // Auto-load first few images
        this.preloadImages(grouped.images?.slice(0, 6) || []);
      },
      error: (err) => {
        console.error('Error loading media:', err);
        this.error.set(err.error?.message || 'Failed to load media');
        this.isLoading.set(false);
      }
    });
  }

  private preloadImages(images: PersonMediaListItem[]) {
    images.forEach(img => this.loadFullMedia(img));
  }

  triggerUpload() {
    // Open upload dialog and pre-select current person
    this.openUploadDialog();
  }

  // Hidden file input handler (for dialog)
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type
    const mediaKind = this.mediaService.detectMediaKind(file.type);
    if (!mediaKind) {
      this.snackBar.open(`Unsupported file type: ${file.type}`, 'Close', { duration: 5000 });
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
    input.value = '';
  }

  // ========================================================================
  // UPLOAD DIALOG METHODS
  // ========================================================================

  openUploadDialog() {
    this.showUploadDialog.set(true);
    this.selectedFile.set(null);
    this.personSearchQuery = '';
    this.personSearchResults.set([]);

    // Pre-select current person
    this.personService.getPerson(this.personId).subscribe({
      next: (person) => {
        const listItem: PersonListItem = {
          id: person.id,
          primaryName: person.primaryName,
          sex: person.sex,
          birthDate: person.birthDate,
          birthPrecision: person.birthPrecision,
          deathDate: person.deathDate,
          deathPrecision: person.deathPrecision,
          birthPlace: person.birthPlace,
          deathPlace: person.deathPlace,
          isVerified: person.isVerified,
          needsReview: person.needsReview,
          mediaCount: 0
        };
        this.selectedPersons.set([listItem]);
      },
      error: () => {
        // Fallback: create minimal person object with just the ID
        this.selectedPersons.set([{
          id: this.personId,
          primaryName: 'Current Person',
          sex: 0,
          birthDate: null,
          birthPrecision: 0,
          deathDate: null,
          deathPrecision: 0,
          birthPlace: null,
          deathPlace: null,
          isVerified: false,
          needsReview: false,
          mediaCount: 0
        }]);
      }
    });
  }

  closeUploadDialog() {
    this.showUploadDialog.set(false);
    this.selectedFile.set(null);
    this.selectedPersons.set([]);
    this.personSearchQuery = '';
    this.mediaDescription = '';
    this.personSearchResults.set([]);
  }

  triggerFileInput() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }

  clearSelectedFile() {
    this.selectedFile.set(null);
    this.mediaDescription = '';
  }

  onSearchQueryChange(query: string) {
    this.searchSubject.next(query);
  }

  private searchPersons(query: string) {
    this.isSearching.set(true);
    this.personService.searchPeople({
      nameQuery: query,
      page: 1,
      pageSize: 10
    }).subscribe({
      next: (result) => {
        this.personSearchResults.set(result.items);
        this.isSearching.set(false);
      },
      error: (err) => {
        console.error('Search error:', err);
        this.personSearchResults.set([]);
        this.isSearching.set(false);
      }
    });
  }

  isPersonSelected(personId: string): boolean {
    return this.selectedPersons().some(p => p.id === personId);
  }

  togglePersonSelection(person: PersonListItem) {
    // Don't allow deselecting current person
    if (person.id === this.personId) return;

    const current = this.selectedPersons();
    const exists = current.some(p => p.id === person.id);

    if (exists) {
      this.selectedPersons.set(current.filter(p => p.id !== person.id));
    } else {
      this.selectedPersons.set([...current, person]);
    }
  }

  async performUpload() {
    const file = this.selectedFile();
    if (!file || this.selectedPersons().length === 0) return;

    try {
      this.isUploading.set(true);
      this.uploadingFileName.set(file.name);

      const personIds = this.selectedPersons().map(p => p.id);

      // Validate and prepare upload
      const payload = await this.mediaService.validateAndPrepareUpload(
        file,
        personIds,
        undefined, // title
        this.mediaDescription.trim() || undefined  // description
      );

      // Upload
      this.mediaService.uploadMedia(payload).subscribe({
        next: () => {
          const mediaKind = this.mediaService.detectMediaKind(file.type);
          const linkedCount = personIds.length;
          const message = linkedCount > 1
            ? `${mediaKind || 'Media'} uploaded and linked to ${linkedCount} people`
            : `${mediaKind || 'Media'} uploaded successfully`;
          this.snackBar.open(message, 'Close', { duration: 3000 });
          this.isUploading.set(false);
          this.closeUploadDialog();
          this.loadMedia(); // Refresh list
        },
        error: (err) => {
          console.error('Upload error:', err);
          this.snackBar.open(err.error?.message || 'Upload failed', 'Close', { duration: 5000 });
          this.isUploading.set(false);
        }
      });
    } catch (err) {
      if (err instanceof MediaValidationError) {
        this.snackBar.open(err.message, 'Close', { duration: 5000 });
      } else {
        this.snackBar.open('Failed to process file', 'Close', { duration: 5000 });
      }
      this.isUploading.set(false);
    }
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audiotrack';
    if (mimeType.startsWith('video/')) return 'videocam';
    return 'insert_drive_file';
  }

  getLifespan(person: PersonListItem): string {
    const birth = person.birthDate ? new Date(person.birthDate).getFullYear() : '?';
    const death = person.deathDate ? new Date(person.deathDate).getFullYear() : '';

    if (birth === '?' && death === '') return '';
    if (death === '') return `b. ${birth}`;
    return `${birth} - ${death}`;
  }

  loadFullMedia(media: PersonMediaListItem) {
    this.mediaService.getMediaById(media.mediaId).subscribe({
      next: (response) => {
        const url = this.mediaService.createObjectUrl(response.base64Data, response.mimeType || 'application/octet-stream');
        this.objectUrls.push(url);

        if (media.mediaKind === 'Image') {
          this.loadedImages.update(imgs => ({ ...imgs, [media.mediaId]: url }));
        } else if (media.mediaKind === 'Audio') {
          this.loadedAudio.update(audio => ({ ...audio, [media.mediaId]: url }));
        } else if (media.mediaKind === 'Video') {
          this.loadedVideos.update(videos => ({ ...videos, [media.mediaId]: url }));
        }
      },
      error: (err) => {
        console.error('Error loading media:', err);
        this.snackBar.open('Failed to load media', 'Close', { duration: 3000 });
      }
    });
  }

  openLightbox(media: PersonMediaListItem) {
    const url = this.loadedImages()[media.mediaId];
    if (url) {
      this.lightboxImage.set(url);
    }
  }

  closeLightbox() {
    this.lightboxImage.set(null);
  }

  downloadMedia(media: PersonMediaListItem) {
    this.mediaService.getMediaById(media.mediaId).subscribe({
      next: (response) => {
        const blob = this.mediaService.base64ToBlob(response.base64Data, response.mimeType || 'application/octet-stream');
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = media.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Download error:', err);
        this.snackBar.open('Failed to download media', 'Close', { duration: 3000 });
      }
    });
  }

  deleteMedia(media: PersonMediaListItem) {
    const linkedCount = media.linkedPersons?.length || 0;
    let confirmMessage = `Delete "${media.fileName}"?`;

    if (linkedCount > 1) {
      confirmMessage += ` This media is linked to ${linkedCount} people and will be removed for all of them.`;
    }
    confirmMessage += ' This cannot be undone.';

    if (!confirm(confirmMessage)) return;

    this.mediaService.deleteMedia(media.mediaId).subscribe({
      next: () => {
        this.snackBar.open('Media deleted', 'Close', { duration: 3000 });
        this.loadMedia(); // Refresh list
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.snackBar.open(err.error?.message || 'Failed to delete media', 'Close', { duration: 3000 });
      }
    });
  }

  // Helper methods
  formatFileSize(bytes: number): string {
    return this.mediaService.formatFileSize(bytes);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  truncateFileName(name: string, maxLength = 25): string {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.length - ext.length - 1);
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4) + '...';
    return `${truncatedBase}.${ext}`;
  }
}
