import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { SupportTicketService } from '../../core/services/support-ticket.service';
import { TranslatePipe, I18nService } from '../../core/i18n';
import {
  TicketStatus,
  TicketCategory,
  TicketPriority,
  SupportTicketSummary,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS
} from '../../core/models/support-ticket.models';
import { SubmitTicketDialogComponent } from './submit-ticket-dialog.component';

@Component({
  selector: 'app-my-tickets',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatTabsModule,
    MatChipsModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    TranslatePipe
  ],
  template: `
    <div class="my-tickets">
      <!-- Header -->
      <div class="page-header">
        <div class="page-header__title-row">
          <h1 class="page-header__title">
            <i class="fa-solid fa-ticket" aria-hidden="true"></i>
            {{ 'support.myTickets' | translate }}
          </h1>
          <button mat-flat-button color="primary" class="new-ticket-btn" (click)="openSubmitDialog()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            {{ 'support.newTicket' | translate }}
          </button>
        </div>
      </div>

      <!-- Status Tabs -->
      <mat-tab-group (selectedTabChange)="onTabChange($event.index)" [selectedIndex]="selectedTab()">
        <mat-tab [label]="'support.filter.all' | translate"></mat-tab>
        <mat-tab [label]="'support.status.open' | translate"></mat-tab>
        <mat-tab [label]="'support.status.workingOnIt' | translate"></mat-tab>
        <mat-tab [label]="'support.status.resolved' | translate"></mat-tab>
      </mat-tab-group>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      }

      <!-- Ticket List -->
      @if (!loading() && tickets().length > 0) {
        <div class="ticket-list">
          @for (ticket of tickets(); track ticket.id) {
            <div class="ticket-card" (click)="viewTicket(ticket)" tabindex="0">
              <div class="ticket-card__header">
                <span class="ticket-number">#{{ ticket.ticketNumber }}</span>
                <span class="ticket-category" [class]="'cat-' + ticket.category">
                  <i class="fa-solid" [class.fa-bug]="ticket.category === TicketCategory.Bug"
                     [class.fa-lightbulb]="ticket.category === TicketCategory.Enhancement" aria-hidden="true"></i>
                  {{ getCategoryLabel(ticket.category) | translate }}
                </span>
                <span class="ticket-priority" [class]="'priority-' + ticket.priority">
                  {{ getPriorityLabel(ticket.priority) | translate }}
                </span>
                <span class="ticket-status" [class]="'status-' + ticket.status">
                  {{ getStatusLabel(ticket.status) | translate }}
                </span>
              </div>

              <h3 class="ticket-card__subject">{{ ticket.subject }}</h3>

              <div class="ticket-card__meta">
                <span class="meta-item">
                  <i class="fa-solid fa-clock" aria-hidden="true"></i>
                  {{ formatDate(ticket.submittedAt) }}
                </span>
                @if (ticket.attachmentCount > 0) {
                  <span class="meta-item">
                    <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
                    {{ ticket.attachmentCount }}
                  </span>
                }
                @if (ticket.commentCount > 0) {
                  <span class="meta-item">
                    <i class="fa-solid fa-comments" aria-hidden="true"></i>
                    {{ ticket.commentCount }}
                  </span>
                }
                @if (ticket.assignedToName) {
                  <span class="meta-item">
                    <i class="fa-solid fa-user-check" aria-hidden="true"></i>
                    {{ ticket.assignedToName }}
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- Paginator -->
        @if (totalCount() > pageSize()) {
          <mat-paginator
            [length]="totalCount()"
            [pageSize]="pageSize()"
            [pageIndex]="currentPage() - 1"
            [pageSizeOptions]="[10, 20, 50]"
            (page)="onPageChange($event)"
            showFirstLastButtons>
          </mat-paginator>
        }
      }

      <!-- Empty State -->
      @if (!loading() && tickets().length === 0) {
        <div class="empty-state">
          <i class="fa-solid fa-ticket empty-state__icon" aria-hidden="true"></i>
          <h3>{{ 'support.emptyState.title' | translate }}</h3>
          <p>{{ 'support.emptyState.description' | translate }}</p>
          <button mat-flat-button color="primary" (click)="openSubmitDialog()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            {{ 'support.newTicket' | translate }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .my-tickets {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-header__title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .page-header__title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--ft-charcoal, #333);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;

      i { color: var(--ft-teal, #187573); }
    }

    .new-ticket-btn i {
      margin-inline-end: 6px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 48px 0;
    }

    .ticket-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 16px;
    }

    .ticket-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      padding: 16px 20px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        border-color: var(--ft-teal, #187573);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
      }
    }

    .ticket-card__header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .ticket-number {
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--ft-teal, #187573);
    }

    .ticket-category {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;

      i { margin-inline-end: 4px; }

      &.cat-0 { background: #fff3e0; color: #e65100; } /* Bug */
      &.cat-1 { background: #e8f5e9; color: #2e7d32; } /* Enhancement */
    }

    .ticket-priority {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;

      &.priority-0 { background: #e0e0e0; color: #666; }      /* Low */
      &.priority-1 { background: #fff3e0; color: #e65100; }    /* Medium */
      &.priority-2 { background: #fce4ec; color: #c62828; }    /* High */
    }

    .ticket-status {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
      margin-inline-start: auto;

      &.status-0 { background: #e3f2fd; color: #1565c0; }     /* Open */
      &.status-1 { background: #fff3e0; color: #e65100; }     /* Working */
      &.status-2 { background: #e8f5e9; color: #2e7d32; }     /* Resolved */
      &.status-3 { background: #f5f5f5; color: #757575; }     /* Closed */
    }

    .ticket-card__subject {
      font-size: 1rem;
      font-weight: 500;
      color: var(--ft-charcoal, #333);
      margin: 0 0 8px 0;
    }

    .ticket-card__meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .meta-item {
      font-size: 0.8rem;
      color: #888;
      display: flex;
      align-items: center;
      gap: 4px;

      i { font-size: 0.75rem; }
    }

    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: #888;
    }

    .empty-state__icon {
      font-size: 3rem;
      color: #ccc;
      margin-bottom: 16px;
    }

    .empty-state h3 {
      font-size: 1.2rem;
      color: var(--ft-charcoal, #333);
      margin: 0 0 8px;
    }

    .empty-state p {
      margin: 0 0 24px;
    }

    @media (max-width: 600px) {
      .my-tickets { padding: 12px 8px; }

      .page-header__title-row {
        flex-direction: column;
        align-items: stretch;
      }

      .ticket-card__header {
        flex-wrap: wrap;
      }

      .ticket-status {
        margin-inline-start: 0;
      }
    }
  `]
})
export class MyTicketsComponent implements OnInit {
  private readonly ticketService = inject(SupportTicketService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(I18nService);

  readonly TicketCategory = TicketCategory;
  readonly TicketStatus = TicketStatus;

  tickets = signal<SupportTicketSummary[]>([]);
  loading = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = signal(20);
  selectedTab = signal(0);

  private readonly tabStatusMap: (TicketStatus | undefined)[] = [
    undefined,             // All
    TicketStatus.Open,
    TicketStatus.WorkingOnIt,
    TicketStatus.Resolved
  ];

  ngOnInit(): void {
    this.loadTickets();
  }

  loadTickets(): void {
    this.loading.set(true);
    const status = this.tabStatusMap[this.selectedTab()];

    this.ticketService.getMyTickets({
      status,
      page: this.currentPage(),
      pageSize: this.pageSize()
    }).subscribe({
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

  onTabChange(index: number): void {
    this.selectedTab.set(index);
    this.currentPage.set(1);
    this.loadTickets();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadTickets();
  }

  viewTicket(ticket: SupportTicketSummary): void {
    this.router.navigate(['/support', ticket.id]);
  }

  openSubmitDialog(): void {
    const dialogRef = this.dialog.open(SubmitTicketDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadTickets();
      }
    });
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
