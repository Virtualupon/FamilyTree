import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';

import { SupportTicketService } from '../../core/services/support-ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe, I18nService } from '../../core/i18n';
import {
  SupportTicketDetail,
  TicketStatus,
  TicketCategory,
  TicketPriority,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS
} from '../../core/models/support-ticket.models';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
    MatExpansionModule,
    TranslatePipe
  ],
  template: `
    <div class="ticket-detail">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      }

      @if (!loading() && ticket()) {
        <!-- Back button -->
        <button mat-button class="back-btn" (click)="goBack()">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          {{ 'support.backToTickets' | translate }}
        </button>

        <!-- Header -->
        <div class="detail-header">
          <div class="detail-header__top">
            <span class="ticket-number">#{{ ticket()!.ticketNumber }}</span>
            <span class="ticket-category" [class]="'cat-' + ticket()!.category">
              <i class="fa-solid" [class.fa-bug]="ticket()!.category === TicketCategory.Bug"
                 [class.fa-lightbulb]="ticket()!.category === TicketCategory.Enhancement" aria-hidden="true"></i>
              {{ getCategoryLabel(ticket()!.category) | translate }}
            </span>
            <span class="ticket-priority" [class]="'priority-' + ticket()!.priority">
              {{ getPriorityLabel(ticket()!.priority) | translate }}
            </span>
            <span class="ticket-status" [class]="'status-' + ticket()!.status">
              {{ getStatusLabel(ticket()!.status) | translate }}
            </span>
          </div>
          <h1 class="detail-header__title">{{ ticket()!.subject }}</h1>
          <div class="detail-header__meta">
            <span>
              <i class="fa-solid fa-user" aria-hidden="true"></i>
              {{ ticket()!.submitterName }}
            </span>
            <span>
              <i class="fa-solid fa-clock" aria-hidden="true"></i>
              {{ formatDate(ticket()!.submittedAt) }}
            </span>
            @if (ticket()!.assignedToName) {
              <span>
                <i class="fa-solid fa-user-check" aria-hidden="true"></i>
                {{ 'support.detail.assignedTo' | translate }}: {{ ticket()!.assignedToName }}
              </span>
            }
          </div>
        </div>

        <!-- Description -->
        <div class="detail-section">
          <h3 class="section-title">
            <i class="fa-solid fa-align-left" aria-hidden="true"></i>
            {{ 'support.detail.description' | translate }}
          </h3>
          <div class="description-text">{{ ticket()!.description }}</div>
        </div>

        <!-- Steps to Reproduce -->
        @if (ticket()!.stepsToReproduce) {
          <div class="detail-section">
            <h3 class="section-title">
              <i class="fa-solid fa-list-ol" aria-hidden="true"></i>
              {{ 'support.detail.stepsToReproduce' | translate }}
            </h3>
            <div class="description-text">{{ ticket()!.stepsToReproduce }}</div>
          </div>
        }

        <!-- Page URL & Browser Info -->
        @if (ticket()!.pageUrl || ticket()!.browserInfo) {
          <div class="detail-section detail-section--info">
            @if (ticket()!.pageUrl) {
              <div class="info-row">
                <span class="info-label">{{ 'support.detail.pageUrl' | translate }}:</span>
                <a [href]="ticket()!.pageUrl" target="_blank" class="info-link">{{ ticket()!.pageUrl }}</a>
              </div>
            }
            @if (ticket()!.browserInfo) {
              <div class="info-row">
                <span class="info-label">{{ 'support.detail.browserInfo' | translate }}:</span>
                <span class="info-value">{{ ticket()!.browserInfo }}</span>
              </div>
            }
          </div>
        }

        <!-- Resolution Notes -->
        @if (ticket()!.resolutionNotes) {
          <div class="detail-section detail-section--resolution">
            <h3 class="section-title">
              <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
              {{ 'support.detail.resolutionNotes' | translate }}
            </h3>
            <div class="description-text">{{ ticket()!.resolutionNotes }}</div>
            @if (ticket()!.resolvedByName) {
              <div class="resolution-meta">
                {{ 'support.detail.resolvedBy' | translate }}: {{ ticket()!.resolvedByName }}
                @if (ticket()!.resolvedAt) {
                  &mdash; {{ formatDate(ticket()!.resolvedAt!) }}
                }
              </div>
            }
          </div>
        }

        <!-- Attachments -->
        @if (ticket()!.attachments.length > 0) {
          <div class="detail-section">
            <h3 class="section-title">
              <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
              {{ 'support.detail.attachments' | translate }} ({{ ticket()!.attachments.length }})
            </h3>
            <div class="attachment-grid">
              @for (att of ticket()!.attachments; track att.id) {
                <a [href]="att.url" target="_blank" class="attachment-thumb">
                  <img [src]="att.url" [alt]="att.fileName" loading="lazy">
                  <span class="attachment-name">{{ att.fileName }}</span>
                  <span class="attachment-size">{{ ticketService.formatFileSize(att.fileSize) }}</span>
                </a>
              }
            </div>
          </div>
        }

        <!-- Admin Controls -->
        @if (isAdmin()) {
          <mat-expansion-panel class="admin-panel">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                {{ 'support.admin.controls' | translate }}
              </mat-panel-title>
            </mat-expansion-panel-header>

            <div class="admin-controls">
              <!-- Status -->
              <div class="admin-control-row">
                <mat-form-field appearance="outline" class="admin-field">
                  <mat-label>{{ 'support.detail.status' | translate }}</mat-label>
                  <mat-select [value]="ticket()!.status" (selectionChange)="updateStatus($event.value)">
                    <mat-option [value]="TicketStatus.Open">{{ 'support.status.open' | translate }}</mat-option>
                    <mat-option [value]="TicketStatus.WorkingOnIt">{{ 'support.status.workingOnIt' | translate }}</mat-option>
                    <mat-option [value]="TicketStatus.Resolved">{{ 'support.status.resolved' | translate }}</mat-option>
                    <mat-option [value]="TicketStatus.Closed">{{ 'support.status.closed' | translate }}</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <!-- Priority -->
              <div class="admin-control-row">
                <mat-form-field appearance="outline" class="admin-field">
                  <mat-label>{{ 'support.detail.priority' | translate }}</mat-label>
                  <mat-select [value]="ticket()!.priority" (selectionChange)="updatePriority($event.value)">
                    <mat-option [value]="TicketPriority.Low">{{ 'support.priority.low' | translate }}</mat-option>
                    <mat-option [value]="TicketPriority.Medium">{{ 'support.priority.medium' | translate }}</mat-option>
                    <mat-option [value]="TicketPriority.High">{{ 'support.priority.high' | translate }}</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <!-- Admin Notes -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'support.admin.notes' | translate }}</mat-label>
                <textarea matInput [value]="ticket()!.adminNotes || ''" #adminNotesInput
                          rows="3" [placeholder]="'support.admin.notesPlaceholder' | translate">
                </textarea>
                <mat-hint>{{ 'support.admin.notesHint' | translate }}</mat-hint>
              </mat-form-field>
              <button mat-stroked-button (click)="saveAdminNotes(adminNotesInput.value)">
                <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                {{ 'support.admin.saveNotes' | translate }}
              </button>

              <!-- Resolution Notes (for resolving) -->
              @if (showResolutionInput()) {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'support.admin.resolutionNotes' | translate }}</mat-label>
                  <textarea matInput #resolutionInput rows="2"
                            [placeholder]="'support.admin.resolutionPlaceholder' | translate">
                  </textarea>
                </mat-form-field>
                <button mat-flat-button color="primary"
                        (click)="confirmResolve(resolutionInput.value)">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                  {{ 'support.admin.confirmResolve' | translate }}
                </button>
              }
            </div>
          </mat-expansion-panel>
        }

        <!-- Comments Thread -->
        <div class="detail-section">
          <h3 class="section-title">
            <i class="fa-solid fa-comments" aria-hidden="true"></i>
            {{ 'support.detail.comments' | translate }} ({{ ticket()!.comments.length }})
          </h3>

          <div class="comments-thread">
            @for (comment of ticket()!.comments; track comment.id) {
              <div class="comment" [class.comment--admin]="comment.isAdminResponse">
                <div class="comment__header">
                  <span class="comment__author">
                    <i class="fa-solid" [class.fa-user-shield]="comment.isAdminResponse"
                       [class.fa-user]="!comment.isAdminResponse" aria-hidden="true"></i>
                    {{ comment.authorName }}
                  </span>
                  @if (comment.isAdminResponse) {
                    <span class="comment__badge">{{ 'support.detail.adminResponse' | translate }}</span>
                  }
                  <span class="comment__date">{{ formatDate(comment.createdAt) }}</span>
                </div>
                <div class="comment__content">{{ comment.content }}</div>
              </div>
            }

            @if (ticket()!.comments.length === 0) {
              <div class="no-comments">{{ 'support.detail.noComments' | translate }}</div>
            }
          </div>

          <!-- Add Comment -->
          <div class="add-comment">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'support.detail.addComment' | translate }}</mat-label>
              <textarea matInput [formControl]="commentControl" rows="2"
                        [placeholder]="'support.detail.commentPlaceholder' | translate">
              </textarea>
            </mat-form-field>
            <button mat-flat-button color="primary"
                    [disabled]="!commentControl.value?.trim() || addingComment()"
                    (click)="addComment()">
              @if (addingComment()) {
                <mat-spinner diameter="18"></mat-spinner>
              } @else {
                <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                {{ 'support.detail.sendComment' | translate }}
              }
            </button>
          </div>
        </div>
      }

      <!-- Not found -->
      @if (!loading() && !ticket()) {
        <div class="empty-state">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
          <p>{{ 'support.detail.notFound' | translate }}</p>
          <button mat-button (click)="goBack()">{{ 'support.backToTickets' | translate }}</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .ticket-detail {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    .back-btn {
      margin-bottom: 16px;
      i { margin-inline-end: 6px; }
    }

    .detail-header {
      margin-bottom: 24px;
    }

    .detail-header__top {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .ticket-number {
      font-weight: 700;
      font-size: 1rem;
      color: var(--ft-teal, #187573);
    }

    .ticket-category {
      font-size: 0.8rem;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 500;
      i { margin-inline-end: 4px; }
      &.cat-0 { background: #fff3e0; color: #e65100; }
      &.cat-1 { background: #e8f5e9; color: #2e7d32; }
    }

    .ticket-priority {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      &.priority-0 { background: #e0e0e0; color: #666; }
      &.priority-1 { background: #fff3e0; color: #e65100; }
      &.priority-2 { background: #fce4ec; color: #c62828; }
    }

    .ticket-status {
      font-size: 0.8rem;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 500;
      &.status-0 { background: #e3f2fd; color: #1565c0; }
      &.status-1 { background: #fff3e0; color: #e65100; }
      &.status-2 { background: #e8f5e9; color: #2e7d32; }
      &.status-3 { background: #f5f5f5; color: #757575; }
    }

    .detail-header__title {
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--ft-charcoal, #333);
      margin: 0 0 8px;
    }

    .detail-header__meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      color: #888;
      font-size: 0.85rem;

      span {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      i { font-size: 0.8rem; }
    }

    .detail-section {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .detail-section--info {
      background: #f9f9f9;
    }

    .detail-section--resolution {
      background: #f1f8e9;
      border-color: #c5e1a5;
    }

    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--ft-charcoal, #333);
      margin: 0 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;

      i { color: var(--ft-teal, #187573); font-size: 0.9rem; }
    }

    .description-text {
      white-space: pre-wrap;
      line-height: 1.6;
      color: #444;
    }

    .info-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.85rem;

      &:last-child { margin-bottom: 0; }
    }

    .info-label {
      font-weight: 500;
      color: #666;
      white-space: nowrap;
    }

    .info-link {
      color: var(--ft-teal, #187573);
      word-break: break-all;
    }

    .info-value {
      color: #444;
      word-break: break-all;
    }

    .resolution-meta {
      margin-top: 12px;
      font-size: 0.85rem;
      color: #558b2f;
      font-style: italic;
    }

    .attachment-grid {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .attachment-thumb {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 120px;
      text-decoration: none;
      color: inherit;
      gap: 4px;

      img {
        width: 100px;
        height: 100px;
        object-fit: cover;
        border-radius: 8px;
        border: 2px solid #e0e0e0;
        transition: border-color 0.2s;
      }

      &:hover img {
        border-color: var(--ft-teal, #187573);
      }

      .attachment-name {
        font-size: 0.7rem;
        color: #666;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 120px;
      }

      .attachment-size {
        font-size: 0.65rem;
        color: #999;
      }
    }

    /* Admin Panel */
    .admin-panel {
      margin-bottom: 16px;
    }

    .admin-controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 8px 0;
    }

    .admin-control-row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .admin-field {
      min-width: 200px;
    }

    .full-width { width: 100%; }

    /* Comments */
    .comments-thread {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .comment {
      padding: 12px 16px;
      border-radius: 8px;
      background: #f5f5f5;
      border-left: 3px solid #e0e0e0;

      &--admin {
        background: #e8f5e9;
        border-left-color: var(--ft-teal, #187573);
      }
    }

    .comment__header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .comment__author {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--ft-charcoal, #333);

      i {
        margin-inline-end: 4px;
        font-size: 0.8rem;
      }
    }

    .comment__badge {
      font-size: 0.65rem;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--ft-teal, #187573);
      color: white;
      font-weight: 500;
    }

    .comment__date {
      font-size: 0.75rem;
      color: #999;
      margin-inline-start: auto;
    }

    .comment__content {
      white-space: pre-wrap;
      line-height: 1.5;
      color: #444;
      font-size: 0.9rem;
    }

    .no-comments {
      text-align: center;
      color: #999;
      padding: 16px;
    }

    .add-comment {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
    }

    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: #888;

      i { font-size: 2rem; color: #ccc; margin-bottom: 12px; }
    }

    @media (max-width: 600px) {
      .ticket-detail { padding: 12px 8px; }
      .admin-control-row { flex-direction: column; }
      .admin-field { min-width: unset; width: 100%; }
    }
  `]
})
export class TicketDetailComponent implements OnInit {
  readonly ticketService = inject(SupportTicketService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  readonly TicketCategory = TicketCategory;
  readonly TicketStatus = TicketStatus;
  readonly TicketPriority = TicketPriority;

  ticket = signal<SupportTicketDetail | null>(null);
  loading = signal(false);
  addingComment = signal(false);
  showResolutionInput = signal(false);

  commentControl = this.fb.control('');

  isAdmin = computed(() => {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin';
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadTicket(id);
    }
  }

  loadTicket(id: string): void {
    this.loading.set(true);
    this.ticketService.getTicket(id).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load ticket:', err);
        this.loading.set(false);
      }
    });
  }

  goBack(): void {
    const user = this.authService.getCurrentUser();
    if (user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin') {
      // If coming from admin, go to admin view if that was the referrer
      // Otherwise default to my tickets
    }
    this.router.navigate(['/support']);
  }

  updateStatus(newStatus: TicketStatus): void {
    if (newStatus === TicketStatus.Resolved) {
      this.showResolutionInput.set(true);
      return;
    }

    this.showResolutionInput.set(false);
    this.ticketService.updateStatus(this.ticket()!.id, { status: newStatus }).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.snackBar.open(this.i18n.t('support.admin.statusUpdated'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: () => this.snackBar.open(this.i18n.t('support.admin.updateError'), this.i18n.t('common.close'), { duration: 3000 })
    });
  }

  confirmResolve(resolutionNotes: string): void {
    this.ticketService.updateStatus(this.ticket()!.id, {
      status: TicketStatus.Resolved,
      resolutionNotes
    }).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.showResolutionInput.set(false);
        this.snackBar.open(this.i18n.t('support.admin.statusUpdated'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: () => this.snackBar.open(this.i18n.t('support.admin.updateError'), this.i18n.t('common.close'), { duration: 3000 })
    });
  }

  updatePriority(newPriority: TicketPriority): void {
    this.ticketService.updatePriority(this.ticket()!.id, { priority: newPriority }).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.snackBar.open(this.i18n.t('support.admin.priorityUpdated'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: () => this.snackBar.open(this.i18n.t('support.admin.updateError'), this.i18n.t('common.close'), { duration: 3000 })
    });
  }

  saveAdminNotes(notes: string): void {
    this.ticketService.updateAdminNotes(this.ticket()!.id, { adminNotes: notes }).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.snackBar.open(this.i18n.t('support.admin.notesSaved'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: () => this.snackBar.open(this.i18n.t('support.admin.updateError'), this.i18n.t('common.close'), { duration: 3000 })
    });
  }

  addComment(): void {
    const content = this.commentControl.value?.trim();
    if (!content) return;

    this.addingComment.set(true);
    this.ticketService.addComment(this.ticket()!.id, { content }).subscribe({
      next: (comment) => {
        // Reload ticket to get fresh data
        this.loadTicket(this.ticket()!.id);
        this.commentControl.reset();
        this.addingComment.set(false);
      },
      error: (err) => {
        console.error('Failed to add comment:', err);
        this.addingComment.set(false);
        this.snackBar.open(this.i18n.t('support.detail.commentError'), this.i18n.t('common.close'), { duration: 3000 });
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
