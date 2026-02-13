import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';

import { SupportTicketService } from '../../../core/services/support-ticket.service';
import { TranslatePipe, I18nService } from '../../../core/i18n';
import {
  SupportTicketSummary,
  SupportTicketStats,
  TicketStatus,
  TicketCategory,
  TicketPriority,
  SupportTicketQueryParams,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS
} from '../../../core/models/support-ticket.models';

@Component({
  selector: 'app-support-tickets-admin',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatCardModule,
    TranslatePipe
  ],
  template: `
    <div class="admin-tickets">
      <h1 class="page-title">
        <i class="fa-solid fa-headset" aria-hidden="true"></i>
        {{ 'support.admin.title' | translate }}
      </h1>

      <!-- Stats Cards -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat-card stat-card--open" (click)="filterByStatus(TicketStatus.Open)">
            <span class="stat-value">{{ stats()!.openCount }}</span>
            <span class="stat-label">{{ 'support.status.open' | translate }}</span>
          </div>
          <div class="stat-card stat-card--working" (click)="filterByStatus(TicketStatus.WorkingOnIt)">
            <span class="stat-value">{{ stats()!.workingOnItCount }}</span>
            <span class="stat-label">{{ 'support.status.workingOnIt' | translate }}</span>
          </div>
          <div class="stat-card stat-card--resolved" (click)="filterByStatus(TicketStatus.Resolved)">
            <span class="stat-value">{{ stats()!.resolvedCount }}</span>
            <span class="stat-label">{{ 'support.status.resolved' | translate }}</span>
          </div>
          <div class="stat-card stat-card--closed" (click)="filterByStatus(TicketStatus.Closed)">
            <span class="stat-value">{{ stats()!.closedCount }}</span>
            <span class="stat-label">{{ 'support.status.closed' | translate }}</span>
          </div>
          @if (stats()!.avgResolutionTimeHours !== null && stats()!.avgResolutionTimeHours !== undefined) {
            <div class="stat-card stat-card--avg">
              <span class="stat-value">{{ stats()!.avgResolutionTimeHours | number:'1.0-0' }}h</span>
              <span class="stat-label">{{ 'support.admin.avgResolution' | translate }}</span>
            </div>
          }
        </div>
      }

      <!-- Filters -->
      <div class="filters-row">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'support.filter.category' | translate }}</mat-label>
          <mat-select [value]="filterCategory()" (selectionChange)="filterCategory.set($event.value); applyFilters()">
            <mat-option [value]="null">{{ 'support.filter.all' | translate }}</mat-option>
            <mat-option [value]="TicketCategory.Bug">{{ 'support.category.bug' | translate }}</mat-option>
            <mat-option [value]="TicketCategory.Enhancement">{{ 'support.category.enhancement' | translate }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'support.filter.priority' | translate }}</mat-label>
          <mat-select [value]="filterPriority()" (selectionChange)="filterPriority.set($event.value); applyFilters()">
            <mat-option [value]="null">{{ 'support.filter.all' | translate }}</mat-option>
            <mat-option [value]="TicketPriority.High">{{ 'support.priority.high' | translate }}</mat-option>
            <mat-option [value]="TicketPriority.Medium">{{ 'support.priority.medium' | translate }}</mat-option>
            <mat-option [value]="TicketPriority.Low">{{ 'support.priority.low' | translate }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'support.filter.status' | translate }}</mat-label>
          <mat-select [value]="filterStatus()" (selectionChange)="filterStatus.set($event.value); applyFilters()">
            <mat-option [value]="null">{{ 'support.filter.all' | translate }}</mat-option>
            <mat-option [value]="TicketStatus.Open">{{ 'support.status.open' | translate }}</mat-option>
            <mat-option [value]="TicketStatus.WorkingOnIt">{{ 'support.status.workingOnIt' | translate }}</mat-option>
            <mat-option [value]="TicketStatus.Resolved">{{ 'support.status.resolved' | translate }}</mat-option>
            <mat-option [value]="TicketStatus.Closed">{{ 'support.status.closed' | translate }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field filter-field--search">
          <mat-label>{{ 'support.filter.search' | translate }}</mat-label>
          <input matInput [value]="searchTerm()" (input)="onSearchInput($event)"
                 [placeholder]="'support.filter.searchPlaceholder' | translate">
          <i class="fa-solid fa-magnifying-glass" matSuffix aria-hidden="true"></i>
        </mat-form-field>

        <button mat-stroked-button (click)="clearFilters()" class="clear-btn">
          <i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i>
          {{ 'support.filter.clear' | translate }}
        </button>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      }

      <!-- Tickets Table -->
      @if (!loading() && tickets().length > 0) {
        <div class="table-container">
          <table class="ticket-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ 'support.table.subject' | translate }}</th>
                <th>{{ 'support.table.category' | translate }}</th>
                <th>{{ 'support.table.priority' | translate }}</th>
                <th>{{ 'support.table.status' | translate }}</th>
                <th>{{ 'support.table.submitter' | translate }}</th>
                <th>{{ 'support.table.assigned' | translate }}</th>
                <th>{{ 'support.table.created' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (ticket of tickets(); track ticket.id) {
                <tr (click)="viewTicket(ticket)" class="ticket-row">
                  <td class="col-number">{{ ticket.ticketNumber }}</td>
                  <td class="col-subject">
                    {{ ticket.subject }}
                    @if (ticket.attachmentCount > 0) {
                      <i class="fa-solid fa-paperclip attachment-icon" aria-hidden="true"
                         [matTooltip]="ticket.attachmentCount + ' attachments'"></i>
                    }
                    @if (ticket.commentCount > 0) {
                      <span class="comment-badge">{{ ticket.commentCount }}</span>
                    }
                  </td>
                  <td>
                    <span class="ticket-category" [class]="'cat-' + ticket.category">
                      {{ getCategoryLabel(ticket.category) | translate }}
                    </span>
                  </td>
                  <td>
                    <span class="ticket-priority" [class]="'priority-' + ticket.priority">
                      {{ getPriorityLabel(ticket.priority) | translate }}
                    </span>
                  </td>
                  <td>
                    <span class="ticket-status" [class]="'status-' + ticket.status">
                      {{ getStatusLabel(ticket.status) | translate }}
                    </span>
                  </td>
                  <td class="col-user">{{ ticket.submitterName }}</td>
                  <td class="col-user">{{ ticket.assignedToName || '—' }}</td>
                  <td class="col-date">{{ formatDate(ticket.createdAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <mat-paginator
          [length]="totalCount()"
          [pageSize]="pageSize()"
          [pageIndex]="currentPage() - 1"
          [pageSizeOptions]="[10, 20, 50]"
          (page)="onPageChange($event)"
          showFirstLastButtons>
        </mat-paginator>
      }

      <!-- Empty -->
      @if (!loading() && tickets().length === 0) {
        <div class="empty-state">
          <i class="fa-solid fa-inbox" aria-hidden="true"></i>
          <p>{{ 'support.admin.noTickets' | translate }}</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .admin-tickets {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--ft-charcoal, #333);
      margin: 0 0 24px;
      display: flex;
      align-items: center;
      gap: 10px;

      i { color: var(--ft-teal, #187573); }
    }

    /* Stats */
    .stats-grid {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .stat-card {
      flex: 1;
      min-width: 120px;
      padding: 16px;
      border-radius: 10px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      border: 2px solid transparent;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }

    .stat-value {
      display: block;
      font-size: 1.8rem;
      font-weight: 700;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #666;
    }

    .stat-card--open { background: #e3f2fd; .stat-value { color: #1565c0; } }
    .stat-card--working { background: #fff3e0; .stat-value { color: #e65100; } }
    .stat-card--resolved { background: #e8f5e9; .stat-value { color: #2e7d32; } }
    .stat-card--closed { background: #f5f5f5; .stat-value { color: #757575; } }
    .stat-card--avg { background: #f3e5f5; .stat-value { color: #7b1fa2; } }

    /* Filters */
    .filters-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .filter-field {
      min-width: 140px;
      max-width: 180px;
    }

    .filter-field--search {
      flex: 1;
      min-width: 200px;
      max-width: 300px;

      i { color: #999; margin-inline-end: 8px; }
    }

    .clear-btn {
      margin-top: 4px;
      i { margin-inline-end: 6px; }
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 48px 0;
    }

    /* Table */
    .table-container {
      overflow-x: auto;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      background: white;
    }

    .ticket-table {
      width: 100%;
      border-collapse: collapse;

      th {
        background: #fafafa;
        padding: 12px 16px;
        text-align: start;
        font-weight: 600;
        font-size: 0.8rem;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 2px solid #e0e0e0;
        white-space: nowrap;
      }

      td {
        padding: 12px 16px;
        border-bottom: 1px solid #f0f0f0;
        font-size: 0.9rem;
      }
    }

    .ticket-row {
      cursor: pointer;
      transition: background 0.15s;

      &:hover { background: #f8f9fa; }
    }

    .col-number {
      font-weight: 700;
      color: var(--ft-teal, #187573);
      white-space: nowrap;
    }

    .col-subject {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .col-user {
      white-space: nowrap;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .col-date {
      white-space: nowrap;
      font-size: 0.8rem;
      color: #888;
    }

    .attachment-icon {
      color: #999;
      font-size: 0.75rem;
      margin-inline-start: 4px;
    }

    .comment-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--ft-teal, #187573);
      color: white;
      font-size: 0.6rem;
      font-weight: 700;
      margin-inline-start: 4px;
      vertical-align: middle;
    }

    .ticket-category {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
      white-space: nowrap;
      &.cat-0 { background: #fff3e0; color: #e65100; }
      &.cat-1 { background: #e8f5e9; color: #2e7d32; }
    }

    .ticket-priority {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
      &.priority-0 { background: #e0e0e0; color: #666; }
      &.priority-1 { background: #fff3e0; color: #e65100; }
      &.priority-2 { background: #fce4ec; color: #c62828; }
    }

    .ticket-status {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
      white-space: nowrap;
      &.status-0 { background: #e3f2fd; color: #1565c0; }
      &.status-1 { background: #fff3e0; color: #e65100; }
      &.status-2 { background: #e8f5e9; color: #2e7d32; }
      &.status-3 { background: #f5f5f5; color: #757575; }
    }

    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: #888;

      i { font-size: 3rem; color: #ccc; margin-bottom: 12px; display: block; }
    }

    @media (max-width: 768px) {
      .stats-grid { flex-direction: column; }
      .stat-card { min-width: unset; }
      .filters-row { flex-direction: column; }
      .filter-field, .filter-field--search {
        max-width: unset;
        width: 100%;
      }
    }
  `]
})
export class SupportTicketsAdminComponent implements OnInit {
  private readonly ticketService = inject(SupportTicketService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  readonly TicketCategory = TicketCategory;
  readonly TicketPriority = TicketPriority;
  readonly TicketStatus = TicketStatus;

  tickets = signal<SupportTicketSummary[]>([]);
  stats = signal<SupportTicketStats | null>(null);
  loading = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = signal(20);

  // Filters
  filterCategory = signal<TicketCategory | null>(null);
  filterPriority = signal<TicketPriority | null>(null);
  filterStatus = signal<TicketStatus | null>(null);
  searchTerm = signal('');

  private searchDebounce: any;

  ngOnInit(): void {
    this.loadStats();
    this.loadTickets();
  }

  loadStats(): void {
    this.ticketService.getStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (err) => console.error('Failed to load stats:', err)
    });
  }

  loadTickets(): void {
    this.loading.set(true);

    const params: SupportTicketQueryParams = {
      page: this.currentPage(),
      pageSize: this.pageSize()
    };

    if (this.filterCategory() !== null) params.category = this.filterCategory()!;
    if (this.filterPriority() !== null) params.priority = this.filterPriority()!;
    if (this.filterStatus() !== null) params.status = this.filterStatus()!;
    if (this.searchTerm()) params.searchTerm = this.searchTerm();

    this.ticketService.getAllTickets(params).subscribe({
      next: (result) => {
        this.tickets.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load tickets:', err);
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadTickets();
  }

  clearFilters(): void {
    this.filterCategory.set(null);
    this.filterPriority.set(null);
    this.filterStatus.set(null);
    this.searchTerm.set('');
    this.currentPage.set(1);
    this.loadTickets();
  }

  filterByStatus(status: TicketStatus): void {
    this.filterStatus.set(status);
    this.currentPage.set(1);
    this.loadTickets();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);

    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.currentPage.set(1);
      this.loadTickets();
    }, 300);
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadTickets();
  }

  viewTicket(ticket: SupportTicketSummary): void {
    this.router.navigate(['/support', ticket.id]);
  }

  getCategoryLabel(category: TicketCategory): string {
    return TICKET_CATEGORY_LABELS[category] ?? 'Unknown';
  }

  getPriorityLabel(priority: TicketPriority): string {
    return TICKET_PRIORITY_LABELS[priority] ?? 'Unknown';
  }

  getStatusLabel(status: TicketStatus): string {
    return TICKET_STATUS_LABELS[status] ?? 'Unknown';
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(this.i18n.currentLang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
