import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, interval, takeUntil } from 'rxjs';

import { StorageMigrationService } from '../../../core/services/storage-migration.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import {
  MigrationPendingCount,
  MigrationProgress,
  MigrationRequest,
  MigrationFileResult,
  MigrationError
} from '../../../core/models/storage-migration.models';

@Component({
  selector: 'app-storage-migration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatExpansionModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './storage-migration.component.html',
  styleUrls: ['./storage-migration.component.scss']
})
export class StorageMigrationComponent implements OnInit, OnDestroy {
  private readonly migrationService = inject(StorageMigrationService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);
  private readonly destroy$ = new Subject<void>();

  // State signals
  loading = signal(true);
  pendingCount = signal<MigrationPendingCount | null>(null);
  isRunning = signal(false);
  progress = signal<MigrationProgress | null>(null);
  previewResults = signal<MigrationFileResult[]>([]);
  errors = signal<MigrationError[]>([]);
  showPreview = signal(false);

  // Form state
  config: MigrationRequest = {
    dryRun: true,
    renameFiles: true,
    deleteLocalAfter: false,
    batchSize: 50,
    maxFiles: 0,
    maxConcurrency: 5
  };

  // Table columns
  previewColumns = ['oldPath', 'newPath', 'fileSize'];
  errorColumns = ['fileName', 'oldPath', 'errorMessage'];

  // Computed values
  get mediaKinds(): string[] {
    const pending = this.pendingCount();
    return pending ? Object.keys(pending.byMediaKind) : [];
  }

  ngOnInit(): void {
    this.loadPendingCount();
    this.checkStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPendingCount(): void {
    this.loading.set(true);
    this.migrationService.getPendingCount().subscribe({
      next: (count) => {
        this.pendingCount.set(count);
        this.loading.set(false);
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.storageMigration.errors.loadFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.loading.set(false);
      }
    });
  }

  checkStatus(): void {
    this.migrationService.getStatus().subscribe({
      next: (status) => {
        this.isRunning.set(status.isRunning);
        if (status.progress) {
          this.progress.set(status.progress);
          this.errors.set(status.progress.errors || []);
        }
        if (status.isRunning) {
          this.startPolling();
        }
      },
      error: () => {}
    });
  }

  startPolling(): void {
    interval(2000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.isRunning()) return;

        this.migrationService.getStatus().subscribe({
          next: (status) => {
            this.isRunning.set(status.isRunning);
            if (status.progress) {
              this.progress.set(status.progress);
              this.errors.set(status.progress.errors || []);
            }
            if (!status.isRunning) {
              this.loadPendingCount();
              this.snackBar.open(
                status.message,
                this.i18n.t('common.close'),
                { duration: 5000 }
              );
            }
          }
        });
      });
  }

  runPreview(): void {
    this.loading.set(true);
    this.showPreview.set(false);

    this.migrationService.preview({
      ...this.config,
      maxFiles: this.config.maxFiles || 100 // Limit preview to 100 files
    }).subscribe({
      next: (result) => {
        this.previewResults.set(result.progress.fileResults || []);
        this.showPreview.set(true);
        this.loading.set(false);
        this.snackBar.open(
          result.message,
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.storageMigration.errors.previewFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.loading.set(false);
      }
    });
  }

  startMigration(): void {
    const pending = this.pendingCount();
    const count = this.config.maxFiles || pending?.totalLocalFiles || 0;

    if (!confirm(this.i18n.t('admin.storageMigration.confirmStart', { count }))) {
      return;
    }

    this.config.dryRun = false;
    this.isRunning.set(true);
    this.progress.set(null);
    this.errors.set([]);

    this.migrationService.migrate(this.config).subscribe({
      next: (result) => {
        this.isRunning.set(false);
        this.progress.set(result.progress);
        this.errors.set(result.progress.errors || []);
        this.loadPendingCount();
        this.snackBar.open(
          result.message,
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      },
      error: (err) => {
        this.isRunning.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.storageMigration.errors.migrationFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });

    this.startPolling();
  }

  cancelMigration(): void {
    if (!confirm(this.i18n.t('admin.storageMigration.confirmCancel'))) {
      return;
    }

    this.migrationService.cancel().subscribe({
      next: (result) => {
        this.snackBar.open(
          result.message,
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.storageMigration.errors.cancelFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      }
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getMediaKindEntries(): { kind: string; count: number }[] {
    const pending = this.pendingCount();
    if (!pending) return [];
    return Object.entries(pending.byMediaKind).map(([kind, count]) => ({ kind, count }));
  }
}
