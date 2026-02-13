import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';

import { ActivityLogService } from '../../../core/services/activity-log.service';
import { TranslatePipe, I18nService } from '../../../core/i18n';
import {
  ActivityLogItem,
  ActivityLogQuery,
  ActivityLogFilters
} from '../../../core/models/activity-log.models';

@Component({
  selector: 'app-activity-logs',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatCardModule,
    TranslatePipe
  ],
  template: `
    <div class="activity-logs">
      <div class="activity-logs__header">
        <div class="activity-logs__title-row">
          <a routerLink="/admin" class="back-link">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </a>
          <h1 class="activity-logs__title">
            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
            {{ 'admin.activityLogs.title' | translate }}
          </h1>
        </div>
        <p class="activity-logs__subtitle">{{ 'admin.activityLogs.subtitle' | translate }}</p>
      </div>

      <!-- Filters -->
      <div class="filters-row">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'admin.activityLogs.action' | translate }}</mat-label>
          <mat-select [value]="filterAction()" (selectionChange)="filterAction.set($event.value); applyFilters()">
            <mat-option [value]="''">{{ 'common.all' | translate }}</mat-option>
            @for (action of availableActions(); track action) {
              <mat-option [value]="action">{{ action }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'admin.activityLogs.entityType' | translate }}</mat-label>
          <mat-select [value]="filterEntityType()" (selectionChange)="filterEntityType.set($event.value); applyFilters()">
            <mat-option [value]="''">{{ 'common.all' | translate }}</mat-option>
            @for (type of availableEntityTypes(); track type) {
              <mat-option [value]="type">{{ type }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'admin.activityLogs.from' | translate }}</mat-label>
          <input matInput type="date" [value]="filterFrom()" (change)="onFromDateChange($event)">
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'admin.activityLogs.to' | translate }}</mat-label>
          <input matInput type="date" [value]="filterTo()" (change)="onToDateChange($event)">
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field filter-field--search">
          <mat-label>{{ 'admin.activityLogs.search' | translate }}</mat-label>
          <input matInput [value]="searchTerm()" (input)="onSearchInput($event)"
                 [placeholder]="'admin.activityLogs.searchPlaceholder' | translate">
          <i class="fa-solid fa-magnifying-glass" matSuffix aria-hidden="true"></i>
        </mat-form-field>

        <button mat-stroked-button (click)="clearFilters()" class="clear-btn">
          <i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i>
          {{ 'admin.activityLogs.clearFilters' | translate }}
        </button>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      }

      <!-- Table -->
      @if (!loading() && logs().length > 0) {
        <div class="table-container">
          <table class="logs-table">
            <thead>
              <tr>
                <th>{{ 'admin.activityLogs.timestamp' | translate }}</th>
                <th>{{ 'admin.activityLogs.actor' | translate }}</th>
                <th>{{ 'admin.activityLogs.action' | translate }}</th>
                <th>{{ 'admin.activityLogs.entityType' | translate }}</th>
                <th>{{ 'admin.activityLogs.description' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (log of logs(); track log.id) {
                <tr>
                  <td class="col-timestamp">{{ formatTimestamp(log.timestamp) }}</td>
                  <td class="col-actor">
                    <div class="actor-cell">
                      <span class="actor-name">{{ log.actorName || '—' }}</span>
                      @if (log.actorEmail) {
                        <span class="actor-email">{{ log.actorEmail }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span class="action-badge" [class]="'action-' + log.action.toLowerCase()">
                      {{ log.action }}
                    </span>
                  </td>
                  <td>
                    <span class="entity-badge">{{ log.entityType }}</span>
                  </td>
                  <td class="col-description">
                    {{ log.changeDescription || '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <mat-paginator
          [length]="totalCount()"
          [pageSize]="pageSize()"
          [pageIndex]="currentPage() - 1"
          [pageSizeOptions]="[10, 25, 50, 100]"
          (page)="onPageChange($event)"
          showFirstLastButtons>
        </mat-paginator>
      }

      <!-- Empty state -->
      @if (!loading() && logs().length === 0) {
        <div class="empty-state">
          <i class="fa-solid fa-inbox" aria-hidden="true"></i>
          <p>{{ 'admin.activityLogs.noLogs' | translate }}</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .activity-logs {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .activity-logs__header {
      margin-bottom: 24px;
    }

    .activity-logs__title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .back-link {
      color: var(--ft-teal, #187573);
      text-decoration: none;
      font-size: 18px;
      display: flex;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      transition: background 0.2s;

      &:hover {
        background: rgba(24, 117, 115, 0.08);
      }
    }

    .activity-logs__title {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--ft-text, #1a1a2e);

      i {
        color: var(--ft-teal, #187573);
      }
    }

    .activity-logs__subtitle {
      margin: 4px 0 0 44px;
      color: var(--ft-text-secondary, #666);
      font-size: 14px;
    }

    .filters-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
      align-items: flex-end;
    }

    .filter-field {
      min-width: 150px;
      flex: 0 1 180px;
    }

    .filter-field--search {
      flex: 1 1 200px;
    }

    .clear-btn {
      height: 56px;
      white-space: nowrap;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 60px 0;
    }

    .table-container {
      overflow-x: auto;
      border-radius: 12px;
      border: 1px solid var(--ft-border, #e8e8e8);
      background: white;
    }

    .logs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;

      th {
        padding: 12px 16px;
        text-align: left;
        font-weight: 600;
        color: var(--ft-text-secondary, #666);
        background: var(--ft-bg-subtle, #f8f9fa);
        border-bottom: 2px solid var(--ft-border, #e8e8e8);
        white-space: nowrap;
      }

      td {
        padding: 10px 16px;
        border-bottom: 1px solid var(--ft-border, #e8e8e8);
        vertical-align: middle;
      }

      tbody tr:hover {
        background: rgba(24, 117, 115, 0.04);
      }

      tbody tr:last-child td {
        border-bottom: none;
      }
    }

    .col-timestamp {
      white-space: nowrap;
      color: var(--ft-text-secondary, #666);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }

    .col-actor {
      min-width: 160px;
    }

    .actor-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .actor-name {
      font-weight: 500;
      color: var(--ft-text, #1a1a2e);
    }

    .actor-email {
      font-size: 12px;
      color: var(--ft-text-secondary, #666);
    }

    .action-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      background: #e8f5e9;
      color: #2e7d32;
    }

    .action-create { background: #e8f5e9; color: #2e7d32; }
    .action-update { background: #e3f2fd; color: #1565c0; }
    .action-delete { background: #ffebee; color: #c62828; }
    .action-upload { background: #f3e5f5; color: #7b1fa2; }
    .action-uploadavatar { background: #f3e5f5; color: #7b1fa2; }
    .action-login { background: #e0f2f1; color: #00695c; }
    .action-register { background: #e0f2f1; color: #00695c; }
    .action-selecttown { background: #fff3e0; color: #e65100; }
    .action-addparent { background: #e8f5e9; color: #2e7d32; }
    .action-removeparent { background: #ffebee; color: #c62828; }
    .action-unlink { background: #ffebee; color: #c62828; }
    .action-review { background: #fff8e1; color: #f57f17; }
    .action-import { background: #e8eaf6; color: #283593; }
    .action-adminaccess { background: #fce4ec; color: #880e4f; }

    .entity-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      background: var(--ft-bg-subtle, #f0f0f0);
      color: var(--ft-text-secondary, #555);
    }

    .col-description {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ft-text-secondary, #555);
      font-size: 13px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--ft-text-secondary, #999);

      i {
        font-size: 48px;
        margin-bottom: 16px;
        display: block;
      }

      p {
        font-size: 16px;
        margin: 0;
      }
    }

    @media (max-width: 768px) {
      .activity-logs {
        padding: 16px;
      }

      .filters-row {
        flex-direction: column;
      }

      .filter-field {
        width: 100%;
        flex: 1;
      }

      .clear-btn {
        width: 100%;
      }
    }
  `]
})
export class ActivityLogsComponent implements OnInit {
  private readonly logService = inject(ActivityLogService);
  private readonly i18n = inject(I18nService);

  // State
  logs = signal<ActivityLogItem[]>([]);
  loading = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = signal(25);

  // Filters
  filterAction = signal('');
  filterEntityType = signal('');
  filterFrom = signal('');
  filterTo = signal('');
  searchTerm = signal('');

  // Filter options
  availableActions = signal<string[]>([]);
  availableEntityTypes = signal<string[]>([]);

  private searchDebounce: any;

  ngOnInit(): void {
    this.loadFilters();
    this.loadLogs();
  }

  loadFilters(): void {
    this.logService.getFilters().subscribe({
      next: (filters) => {
        this.availableActions.set(filters.actions);
        this.availableEntityTypes.set(filters.entityTypes);
      },
      error: (err) => console.error('Failed to load filters:', err)
    });
  }

  loadLogs(): void {
    this.loading.set(true);

    const query: ActivityLogQuery = {
      page: this.currentPage(),
      pageSize: this.pageSize()
    };

    if (this.filterAction()) query.action = this.filterAction();
    if (this.filterEntityType()) query.entityType = this.filterEntityType();
    if (this.filterFrom()) query.from = new Date(this.filterFrom()).toISOString();
    if (this.filterTo()) query.to = new Date(this.filterTo() + 'T23:59:59').toISOString();
    if (this.searchTerm()) query.search = this.searchTerm();

    this.logService.getLogs(query).subscribe({
      next: (result) => {
        this.logs.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load activity logs:', err);
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadLogs();
  }

  clearFilters(): void {
    this.filterAction.set('');
    this.filterEntityType.set('');
    this.filterFrom.set('');
    this.filterTo.set('');
    this.searchTerm.set('');
    this.currentPage.set(1);
    this.loadLogs();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadLogs();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.currentPage.set(1);
      this.loadLogs();
    }, 300);
  }

  onFromDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filterFrom.set(value);
    this.applyFilters();
  }

  onToDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filterTo.set(value);
    this.applyFilters();
  }

  formatTimestamp(ts: string): string {
    const date = new Date(ts);
    return date.toLocaleDateString(this.i18n.currentLang(), {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}
