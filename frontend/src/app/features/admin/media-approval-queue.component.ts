import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MediaService } from '../../core/services/media.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { MediaApprovalQueueItem, MediaApprovalQueueResponse } from '../../core/models/media.models';

@Component({
  selector: 'app-media-approval-queue',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslatePipe
  ],
  template: `
    <div class="approval-queue">
      <div class="approval-queue__header">
        <h1>
          <i class="fa-solid fa-clipboard-check" aria-hidden="true"></i>
          {{ 'media.approvalQueue' | translate }}
        </h1>
        @if (total() > 0) {
          <span class="approval-queue__count">{{ total() }} {{ 'media.pending' | translate }}</span>
        }
      </div>

      <!-- Filters -->
      <div class="approval-queue__filters">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'common.search' | translate }}</mat-label>
          <input matInput [(ngModel)]="searchTerm" (keyup.enter)="loadQueue()">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'media.type' | translate }}</mat-label>
          <mat-select [(ngModel)]="kindFilter" (selectionChange)="loadQueue()">
            <mat-option [value]="undefined">{{ 'common.all' | translate }}</mat-option>
            <mat-option value="Image">{{ 'media.images' | translate }}</mat-option>
            <mat-option value="Audio">{{ 'media.audio' | translate }}</mat-option>
            <mat-option value="Video">{{ 'media.videos' | translate }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="approval-queue__loading">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && items().length === 0) {
        <div class="approval-queue__empty">
          <i class="fa-solid fa-circle-check"></i>
          <h3>{{ 'media.noMediaPending' | translate }}</h3>
        </div>
      }

      <!-- Items -->
      @if (!loading() && items().length > 0) {
        <div class="approval-queue__list">
          @for (item of items(); track item.id) {
            <mat-card class="approval-item">
              <mat-card-content>
                <div class="approval-item__main">
                  <div class="approval-item__icon">
                    @switch (item.kind) {
                      @case ('Image') { <i class="fa-solid fa-image"></i> }
                      @case ('Audio') { <i class="fa-solid fa-music"></i> }
                      @case ('Video') { <i class="fa-solid fa-video"></i> }
                      @default { <i class="fa-solid fa-file"></i> }
                    }
                  </div>
                  <div class="approval-item__info">
                    <span class="approval-item__title">{{ item.title || item.fileName }}</span>
                    <span class="approval-item__meta">
                      {{ item.kind }} &bull; {{ formatFileSize(item.fileSize) }}
                      @if (item.uploaderName) {
                        &bull; {{ 'media.uploadedBy' | translate }} {{ item.uploaderName }}
                      }
                      @if (item.treeName) {
                        &bull; {{ item.treeName }}
                      }
                    </span>
                    @if (item.tags.length > 0) {
                      <div class="approval-item__tags">
                        @for (tag of item.tags; track tag) {
                          <mat-chip>{{ tag }}</mat-chip>
                        }
                      </div>
                    }
                  </div>
                  <div class="approval-item__actions">
                    <button mat-raised-button color="primary"
                            [disabled]="processing().has(item.id)"
                            (click)="approve(item)"
                            [matTooltip]="'media.approve' | translate">
                      @if (processing().has(item.id)) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        <i class="fa-solid fa-check"></i>
                      }
                      {{ 'media.approve' | translate }}
                    </button>
                    <button mat-stroked-button color="warn"
                            [disabled]="processing().has(item.id)"
                            (click)="reject(item)"
                            [matTooltip]="'media.reject' | translate">
                      <i class="fa-solid fa-xmark"></i>
                      {{ 'media.reject' | translate }}
                    </button>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>

        <!-- Paginator -->
        @if (total() > pageSize) {
          <mat-paginator
            [length]="total()"
            [pageIndex]="page() - 1"
            [pageSize]="pageSize"
            [pageSizeOptions]="[10, 20, 50]"
            (page)="onPageChange($event)"
            showFirstLastButtons>
          </mat-paginator>
        }
      }
    </div>
  `,
  styles: [`
    .approval-queue {
      padding: 24px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .approval-queue__header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;

      h1 {
        margin: 0;
        font-size: 24px;
        i { margin-right: 8px; color: #7B1FA2; }
      }
    }

    .approval-queue__count {
      background: #f3e5f5;
      color: #7B1FA2;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 500;
    }

    .approval-queue__filters {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .approval-queue__loading,
    .approval-queue__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: #888;

      i { font-size: 48px; margin-bottom: 16px; color: #4caf50; }
    }

    .approval-queue__list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .approval-item__main {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .approval-item__icon {
      font-size: 24px;
      width: 40px;
      text-align: center;
      color: #666;
    }

    .approval-item__info {
      flex: 1;
      min-width: 0;
    }

    .approval-item__title {
      display: block;
      font-weight: 500;
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .approval-item__meta {
      display: block;
      font-size: 13px;
      color: #888;
      margin-top: 2px;
    }

    .approval-item__tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 4px;

      mat-chip {
        font-size: 11px;
        min-height: 22px;
      }
    }

    .approval-item__actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    @media (max-width: 600px) {
      .approval-item__main {
        flex-wrap: wrap;
      }
      .approval-item__actions {
        width: 100%;
        justify-content: flex-end;
      }
    }
  `]
})
export class MediaApprovalQueueComponent implements OnInit {
  private readonly mediaService = inject(MediaService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  items = signal<MediaApprovalQueueItem[]>([]);
  total = signal(0);
  page = signal(1);
  processing = signal(new Set<string>());

  searchTerm = '';
  kindFilter?: string;
  readonly pageSize = 20;

  ngOnInit(): void {
    this.loadQueue();
  }

  loadQueue(): void {
    this.loading.set(true);
    this.mediaService.getApprovalQueue({
      page: this.page(),
      pageSize: this.pageSize,
      kind: this.kindFilter as any,
      searchTerm: this.searchTerm || undefined
    }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  approve(item: MediaApprovalQueueItem): void {
    this.setProcessing(item.id, true);
    this.mediaService.approveMedia(item.id).subscribe({
      next: () => {
        this.setProcessing(item.id, false);
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.total.update(t => t - 1);
        this.snackBar.open(this.i18n.t('media.approved'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: () => {
        this.setProcessing(item.id, false);
        this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  reject(item: MediaApprovalQueueItem): void {
    this.setProcessing(item.id, true);
    this.mediaService.rejectMedia(item.id).subscribe({
      next: () => {
        this.setProcessing(item.id, false);
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.total.update(t => t - 1);
        this.snackBar.open(this.i18n.t('media.rejected'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: () => {
        this.setProcessing(item.id, false);
        this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  onPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.loadQueue();
  }

  formatFileSize(bytes: number): string {
    return this.mediaService.formatFileSize(bytes);
  }

  private setProcessing(id: string, active: boolean): void {
    this.processing.update(set => {
      const newSet = new Set(set);
      if (active) newSet.add(id); else newSet.delete(id);
      return newSet;
    });
  }
}
