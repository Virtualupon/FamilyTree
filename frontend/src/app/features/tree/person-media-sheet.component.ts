import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PersonMediaService } from '../../core/services/person-media.service';
import { MediaService } from '../../core/services/media.service';
import { PersonMediaGrouped, PersonMediaListItem } from '../../core/models/person-media.models';
import { TranslatePipe } from '../../core/i18n';

export interface PersonMediaSheetData {
  personId: string;
  personName: string;
}

@Component({
  selector: 'app-person-media-sheet',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TranslatePipe
  ],
  template: `
    <div class="person-media-sheet">
      <div class="person-media-sheet__header">
        <h3>{{ data.personName }}</h3>
        <button mat-icon-button (click)="close()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      @if (loading()) {
        <div class="person-media-sheet__loading">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      } @else if (isEmpty()) {
        <div class="person-media-sheet__empty">
          <i class="fa-solid fa-photo-film"></i>
          <p>{{ 'media.noMedia' | translate }}</p>
        </div>
      } @else {
        <mat-tab-group>
          @if (mediaData()?.images?.length) {
            <mat-tab>
              <ng-template mat-tab-label>
                <i class="fa-solid fa-image"></i>
                {{ 'media.images' | translate }} ({{ mediaData()!.images.length }})
              </ng-template>
              <div class="person-media-sheet__grid">
                @for (item of mediaData()!.images; track item.mediaId) {
                  <div class="media-thumb" (click)="openMedia(item)">
                    @if (signedUrls().get(item.mediaId); as url) {
                      <img [src]="url" [alt]="item.title || item.fileName" loading="lazy">
                    } @else {
                      <div class="media-thumb__placeholder">
                        <mat-spinner diameter="20"></mat-spinner>
                      </div>
                    }
                    @if (item.title) {
                      <span class="media-thumb__title">{{ item.title }}</span>
                    }
                  </div>
                }
              </div>
            </mat-tab>
          }

          @if (mediaData()?.audio?.length) {
            <mat-tab>
              <ng-template mat-tab-label>
                <i class="fa-solid fa-music"></i>
                {{ 'media.audio' | translate }} ({{ mediaData()!.audio.length }})
              </ng-template>
              <div class="person-media-sheet__list">
                @for (item of mediaData()!.audio; track item.mediaId) {
                  <div class="media-list-item">
                    <i class="fa-solid fa-file-audio"></i>
                    <div class="media-list-item__info">
                      <span class="media-list-item__name">{{ item.title || item.fileName }}</span>
                      <span class="media-list-item__size">{{ formatSize(item.fileSize) }}</span>
                    </div>
                    @if (signedUrls().get(item.mediaId); as url) {
                      <audio controls preload="none" [src]="url"></audio>
                    }
                  </div>
                }
              </div>
            </mat-tab>
          }

          @if (mediaData()?.videos?.length) {
            <mat-tab>
              <ng-template mat-tab-label>
                <i class="fa-solid fa-video"></i>
                {{ 'media.videos' | translate }} ({{ mediaData()!.videos.length }})
              </ng-template>
              <div class="person-media-sheet__list">
                @for (item of mediaData()!.videos; track item.mediaId) {
                  <div class="media-list-item">
                    <i class="fa-solid fa-file-video"></i>
                    <div class="media-list-item__info">
                      <span class="media-list-item__name">{{ item.title || item.fileName }}</span>
                      <span class="media-list-item__size">{{ formatSize(item.fileSize) }}</span>
                    </div>
                    @if (signedUrls().get(item.mediaId); as url) {
                      <video controls preload="none" [src]="url" style="max-width: 100%;"></video>
                    }
                  </div>
                }
              </div>
            </mat-tab>
          }
        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    .person-media-sheet {
      padding: 16px;
      max-height: 70vh;
      overflow-y: auto;
    }

    .person-media-sheet__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
    }

    .person-media-sheet__loading,
    .person-media-sheet__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: #888;

      i {
        font-size: 32px;
        margin-bottom: 12px;
      }
    }

    .person-media-sheet__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
      padding: 12px 0;
    }

    .media-thumb {
      position: relative;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      background: #f5f5f5;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      &__placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
      }

      &__title {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 4px 6px;
        background: rgba(0,0,0,0.6);
        color: white;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .person-media-sheet__list {
      padding: 12px 0;
    }

    .media-list-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #eee;

      > i {
        font-size: 20px;
        color: #666;
        width: 24px;
        text-align: center;
      }

      &__info {
        flex: 1;
        min-width: 0;
      }

      &__name {
        display: block;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &__size {
        font-size: 12px;
        color: #888;
      }

      audio, video {
        max-width: 200px;
      }
    }

    mat-tab-group {
      ::ng-deep .mat-mdc-tab-labels {
        gap: 4px;
      }
    }
  `]
})
export class PersonMediaSheetComponent implements OnInit {
  private readonly personMediaService = inject(PersonMediaService);
  private readonly mediaService = inject(MediaService);

  loading = signal(true);
  mediaData = signal<PersonMediaGrouped | null>(null);
  signedUrls = signal(new Map<string, string>());

  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: PersonMediaSheetData,
    private sheetRef: MatBottomSheetRef<PersonMediaSheetComponent>
  ) {}

  ngOnInit(): void {
    this.loadMedia();
  }

  isEmpty(): boolean {
    const d = this.mediaData();
    if (!d) return true;
    return !d.images?.length && !d.audio?.length && !d.videos?.length;
  }

  close(): void {
    this.sheetRef.dismiss();
  }

  formatSize(bytes: number): string {
    return this.mediaService.formatFileSize(bytes);
  }

  openMedia(item: PersonMediaListItem): void {
    // For now, images open in a new tab via signed URL
    const url = this.signedUrls().get(item.mediaId);
    if (url) {
      window.open(url, '_blank');
    }
  }

  private loadMedia(): void {
    this.personMediaService.getMediaByPersonGrouped(this.data.personId).subscribe({
      next: (grouped) => {
        this.mediaData.set(grouped);
        this.loading.set(false);
        this.loadSignedUrls(grouped);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  private loadSignedUrls(grouped: PersonMediaGrouped): void {
    const allItems = [
      ...(grouped.images || []),
      ...(grouped.audio || []),
      ...(grouped.videos || [])
    ];

    allItems.forEach(item => {
      this.mediaService.getSignedUrl(item.mediaId).subscribe({
        next: (cached) => {
          this.signedUrls.update(map => {
            const newMap = new Map(map);
            newMap.set(item.mediaId, cached.url);
            return newMap;
          });
        }
      });
    });
  }
}
