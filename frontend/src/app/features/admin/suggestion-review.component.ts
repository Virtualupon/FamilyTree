import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';

import { I18nService, TranslatePipe } from '../../core/i18n';
import { SuggestionService } from '../../core/services/suggestion.service';
import { AuthService } from '../../core/services/auth.service';
import {
  SuggestionDetail,
  SuggestionStatus,
  SuggestionType,
  ConfidenceLevel,
  Evidence,
  Comment
} from '../../core/models/suggestion.models';

@Component({
  selector: 'app-suggestion-review',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatExpansionModule,
    MatDividerModule,
    MatMenuModule,
    TranslatePipe
  ],
  template: `
    <div class="suggestion-review">
      @if (loading()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (suggestion()) {
        <!-- Header -->
        <header class="suggestion-review__header">
          <div class="suggestion-review__title-row">
            <button mat-icon-button (click)="goBack()" class="back-button">
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
            </button>
            <div>
              <h1>{{ getTypeLabel(suggestion()!.type) | translate }}</h1>
              <mat-chip [class]="'status-chip status-chip--' + getStatusClass(suggestion()!.status)">
                {{ getStatusLabel(suggestion()!.status) | translate }}
              </mat-chip>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <div class="suggestion-review__content">
          <!-- Suggestion Details Card -->
          <mat-card class="detail-card">
            <mat-card-header>
              <mat-card-title>{{ 'suggestion.details' | translate }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <!-- People Involved -->
              <div class="people-section">
                <div class="person-box">
                  <span class="person-box__label">{{ getTargetPersonLabel() | translate }}</span>
                  <div class="person-box__info">
                    <div class="person-avatar">
                      <i class="fa-solid fa-user" aria-hidden="true"></i>
                    </div>
                    <div class="person-details">
                      <span class="person-name">{{ suggestion()!.targetPerson?.primaryName || ('common.unknown' | translate) }}</span>
                      @if (suggestion()!.targetPersonId) {
                        <a [routerLink]="['/people', suggestion()!.targetPersonId]" class="person-link">
                          {{ 'common.viewProfile' | translate }}
                        </a>
                      }
                    </div>
                  </div>
                </div>

                @if (suggestion()!.secondaryPersonId) {
                  <div class="relationship-arrow">
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                  </div>
                  <div class="person-box">
                    <span class="person-box__label">{{ getSecondaryPersonLabel() | translate }}</span>
                    <div class="person-box__info">
                      <div class="person-avatar">
                        <i class="fa-solid fa-user" aria-hidden="true"></i>
                      </div>
                      <div class="person-details">
                        <span class="person-name">{{ suggestion()!.secondaryPerson?.primaryName || ('common.unknown' | translate) }}</span>
                        <a [routerLink]="['/people', suggestion()!.secondaryPersonId]" class="person-link">
                          {{ 'common.viewProfile' | translate }}
                        </a>
                      </div>
                    </div>
                  </div>
                }
              </div>

              <mat-divider></mat-divider>

              <!-- Metadata -->
              <div class="metadata-grid">
                <div class="metadata-item">
                  <span class="metadata-item__label">{{ 'suggestion.submittedBy' | translate }}</span>
                  <span class="metadata-item__value">{{ suggestion()!.submitter?.name || suggestion()!.submitter?.email || ('common.unknown' | translate) }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-item__label">{{ 'suggestion.submittedAt' | translate }}</span>
                  <span class="metadata-item__value">{{ formatDateTime(suggestion()!.createdAt) }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-item__label">{{ 'suggestion.confidenceLevel' | translate }}</span>
                  <span class="metadata-item__value">{{ getConfidenceLabel(suggestion()!.confidence) | translate }}</span>
                </div>
                @if (suggestion()!.treeName) {
                  <div class="metadata-item">
                    <span class="metadata-item__label">{{ 'suggestion.tree' | translate }}</span>
                    <span class="metadata-item__value">{{ suggestion()!.treeName }}</span>
                  </div>
                }
              </div>

              <mat-divider></mat-divider>

              <!-- Submitter Notes -->
              @if (suggestion()!.submitterNotes) {
                <div class="rationale-section">
                  <h4>{{ 'suggestion.submitterNotes' | translate }}</h4>
                  <p>{{ suggestion()!.submitterNotes }}</p>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Evidence Section -->
          @if (suggestion()!.evidence && suggestion()!.evidence.length > 0) {
            <mat-card class="evidence-card">
              <mat-card-header>
                <mat-card-title>{{ 'suggestion.evidence' | translate }} ({{ suggestion()!.evidence.length }})</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <mat-accordion>
                  @for (evidence of suggestion()!.evidence; track evidence.id) {
                    <mat-expansion-panel>
                      <mat-expansion-panel-header>
                        <mat-panel-title>
                          <i class="fa-solid" [ngClass]="getEvidenceIcon(evidence.type)" aria-hidden="true"></i>
                          {{ evidence.urlTitle || evidence.description || ('suggestion.evidenceItem' | translate) }}
                        </mat-panel-title>
                      </mat-expansion-panel-header>
                      <div class="evidence-content">
                        <p>{{ evidence.description }}</p>
                        @if (evidence.mediaUrl) {
                          <a [href]="evidence.mediaUrl" target="_blank" class="evidence-link">
                            <i class="fa-solid fa-external-link" aria-hidden="true"></i>
                            {{ 'suggestion.viewFile' | translate }}
                          </a>
                        }
                        @if (evidence.url) {
                          <a [href]="evidence.url" target="_blank" class="evidence-link">
                            <i class="fa-solid fa-link" aria-hidden="true"></i>
                            {{ evidence.urlTitle || evidence.url }}
                          </a>
                        }
                      </div>
                    </mat-expansion-panel>
                  }
                </mat-accordion>
              </mat-card-content>
            </mat-card>
          }

          <!-- Comments Section -->
          <mat-card class="comments-card">
            <mat-card-header>
              <mat-card-title>{{ 'suggestion.comments' | translate }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (suggestion()!.comments && suggestion()!.comments.length > 0) {
                <div class="comments-list">
                  @for (comment of suggestion()!.comments; track comment.id) {
                    <div class="comment-item" [class.comment-item--admin]="comment.isAdminComment">
                      <div class="comment-header">
                        <span class="comment-author">{{ comment.authorName }}</span>
                        @if (comment.isAdminComment) {
                          <mat-chip class="admin-chip">{{ 'suggestion.admin' | translate }}</mat-chip>
                        }
                        <span class="comment-date">{{ formatDateTime(comment.createdAt) }}</span>
                      </div>
                      <p class="comment-text">{{ comment.content }}</p>
                    </div>
                  }
                </div>
              } @else {
                <p class="no-comments">{{ 'suggestion.noComments' | translate }}</p>
              }

              <!-- Add Comment -->
              @if (isAdmin()) {
                <form [formGroup]="commentForm" (ngSubmit)="addComment()" class="add-comment-form">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ 'suggestion.addComment' | translate }}</mat-label>
                    <textarea matInput formControlName="text" rows="2"></textarea>
                  </mat-form-field>
                  <button mat-stroked-button type="submit" [disabled]="!commentForm.valid || addingComment()">
                    @if (addingComment()) {
                      <mat-spinner diameter="16"></mat-spinner>
                    } @else {
                      {{ 'common.add' | translate }}
                    }
                  </button>
                </form>
              }
            </mat-card-content>
          </mat-card>

          <!-- Review History -->
          @if (suggestion()!.reviewedAt) {
            <mat-card class="history-card">
              <mat-card-header>
                <mat-card-title>{{ 'suggestion.reviewHistory' | translate }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="history-item">
                  <span class="history-action">{{ getStatusLabel(suggestion()!.status) | translate }}</span>
                  <span class="history-by">{{ 'suggestion.by' | translate }} {{ suggestion()!.reviewer?.name || suggestion()!.reviewer?.email || ('common.unknown' | translate) }}</span>
                  <span class="history-date">{{ formatDateTime(suggestion()!.reviewedAt!) }}</span>
                </div>
                @if (suggestion()!.reviewerNotes) {
                  <div class="reviewer-notes">
                    <strong>{{ 'suggestion.reviewerNotes' | translate }}:</strong>
                    <p>{{ suggestion()!.reviewerNotes }}</p>
                  </div>
                }
              </mat-card-content>
            </mat-card>
          }
        </div>

        <!-- Admin Actions -->
        @if (isAdmin() && canTakeAction()) {
          <div class="admin-actions">
            <mat-card class="actions-card">
              <mat-card-header>
                <mat-card-title>{{ 'suggestion.takeAction' | translate }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <form [formGroup]="actionForm">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ 'suggestion.reviewerNotes' | translate }}</mat-label>
                    <textarea matInput formControlName="notes" rows="3" [placeholder]="'suggestion.notesPlaceholder' | translate"></textarea>
                  </mat-form-field>

                  @if (showRejectReason()) {
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>{{ 'suggestion.rejectReason' | translate }} *</mat-label>
                      <textarea matInput formControlName="reason" rows="2" required></textarea>
                    </mat-form-field>
                  }

                  <div class="action-buttons">
                    <button
                      mat-flat-button
                      color="primary"
                      [disabled]="processing()"
                      (click)="approve()">
                      @if (processing() && currentAction() === 'approve') {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <i class="fa-solid fa-check" aria-hidden="true"></i>
                        {{ 'suggestion.approve' | translate }}
                      }
                    </button>
                    <button
                      mat-flat-button
                      color="accent"
                      [disabled]="processing()"
                      (click)="requestMoreInfo()">
                      @if (processing() && currentAction() === 'info') {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <i class="fa-solid fa-question-circle" aria-hidden="true"></i>
                        {{ 'suggestion.requestInfo' | translate }}
                      }
                    </button>
                    <button
                      mat-flat-button
                      color="warn"
                      [disabled]="processing()"
                      (click)="reject()">
                      @if (processing() && currentAction() === 'reject') {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <i class="fa-solid fa-times" aria-hidden="true"></i>
                        {{ 'suggestion.reject' | translate }}
                      }
                    </button>
                  </div>
                </form>
              </mat-card-content>
            </mat-card>
          </div>
        }

        <!-- Rollback Option (for approved suggestions) -->
        @if (isAdmin() && suggestion()!.status === SuggestionStatus.Approved) {
          <div class="rollback-section">
            <button mat-stroked-button color="warn" [matMenuTriggerFor]="rollbackMenu">
              <i class="fa-solid fa-undo" aria-hidden="true"></i>
              {{ 'suggestion.rollback' | translate }}
            </button>
            <mat-menu #rollbackMenu="matMenu">
              <div class="rollback-form" (click)="$event.stopPropagation()">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'suggestion.rollbackReason' | translate }}</mat-label>
                  <textarea matInput [(ngModel)]="rollbackReason" rows="2"></textarea>
                </mat-form-field>
                <button mat-flat-button color="warn" (click)="rollback()" [disabled]="!rollbackReason || processing()">
                  {{ 'suggestion.confirmRollback' | translate }}
                </button>
              </div>
            </mat-menu>
          </div>
        }
      } @else {
        <div class="not-found">
          <i class="fa-solid fa-search" aria-hidden="true"></i>
          <h3>{{ 'suggestion.notFound' | translate }}</h3>
          <button mat-flat-button color="primary" routerLink="/admin/suggestions">
            {{ 'suggestion.backToQueue' | translate }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .suggestion-review {
      padding: var(--ft-spacing-md);
      max-width: 900px;
      margin: 0 auto;

      @media (min-width: 768px) {
        padding: var(--ft-spacing-lg);
      }

      &__header {
        margin-bottom: var(--ft-spacing-lg);
      }

      &__title-row {
        display: flex;
        align-items: flex-start;
        gap: var(--ft-spacing-sm);

        h1 {
          margin: 0 0 var(--ft-spacing-xs);
          font-size: 1.5rem;
          font-weight: 700;
          color: #2D2D2D;
          font-family: 'Cinzel', serif;
        }
      }

      &__content {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-lg);
      }
    }

    .back-button {
      color: #187573;
      margin-top: 4px;
    }

    .loading-state, .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--ft-spacing-xxl);
      text-align: center;

      i {
        font-size: 48px;
        color: #6B6B6B;
        opacity: 0.5;
        margin-bottom: var(--ft-spacing-md);
      }

      h3 {
        margin: 0 0 var(--ft-spacing-md);
        color: #2D2D2D;
      }
    }

    .detail-card, .evidence-card, .comments-card, .history-card, .actions-card {
      mat-card-header {
        margin-bottom: var(--ft-spacing-md);
      }

      mat-card-title {
        font-size: 1rem;
        font-weight: 600;
        color: #2D2D2D;
      }
    }

    .people-section {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-lg);
      padding: var(--ft-spacing-md) 0;
      flex-wrap: wrap;
    }

    .person-box {
      flex: 1;
      min-width: 200px;

      &__label {
        display: block;
        font-size: 0.75rem;
        color: #6B6B6B;
        text-transform: uppercase;
        margin-bottom: var(--ft-spacing-xs);
      }

      &__info {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
      }
    }

    .person-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #E6F5F5;
      display: flex;
      align-items: center;
      justify-content: center;

      i {
        color: #187573;
        font-size: 18px;
      }
    }

    .person-details {
      display: flex;
      flex-direction: column;
    }

    .person-name {
      font-weight: 600;
      color: #2D2D2D;
    }

    .person-link {
      font-size: 0.813rem;
      color: #187573;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .relationship-arrow {
      color: #C17E3E;
      font-size: 20px;
    }

    mat-divider {
      margin: var(--ft-spacing-md) 0;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-md) 0;
    }

    .metadata-item {
      &__label {
        display: block;
        font-size: 0.75rem;
        color: #6B6B6B;
        text-transform: uppercase;
        margin-bottom: 4px;
      }

      &__value {
        color: #2D2D2D;
        font-weight: 500;
      }
    }

    .rationale-section, .source-section {
      padding: var(--ft-spacing-sm) 0;

      h4 {
        margin: 0 0 var(--ft-spacing-xs);
        font-size: 0.875rem;
        font-weight: 600;
        color: #2D2D2D;
      }

      p {
        margin: 0;
        color: #4B5563;
        line-height: 1.6;
      }
    }

    .evidence-content {
      padding: var(--ft-spacing-sm);

      p {
        margin: 0 0 var(--ft-spacing-sm);
      }
    }

    .evidence-link {
      display: inline-flex;
      align-items: center;
      gap: var(--ft-spacing-xs);
      color: #187573;
      text-decoration: none;
      font-size: 0.875rem;

      &:hover {
        text-decoration: underline;
      }
    }

    mat-expansion-panel-header {
      mat-panel-title {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);

        i {
          color: #C17E3E;
        }
      }
    }

    .comments-list {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-md);
      margin-bottom: var(--ft-spacing-lg);
    }

    .comment-item {
      padding: var(--ft-spacing-md);
      background: #F9FAFB;
      border-radius: var(--ft-radius-md);
      border-left: 3px solid #E5E7EB;

      &--admin {
        background: #EFF6FF;
        border-left-color: #3B82F6;
      }
    }

    .comment-header {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-sm);
      margin-bottom: var(--ft-spacing-xs);
      flex-wrap: wrap;
    }

    .comment-author {
      font-weight: 600;
      color: #2D2D2D;
    }

    .admin-chip {
      font-size: 0.65rem;
      min-height: 18px;
      padding: 2px 6px;
      background: #3B82F6 !important;
      color: white !important;
    }

    .comment-date {
      font-size: 0.75rem;
      color: #6B6B6B;
    }

    .comment-text {
      margin: 0;
      color: #4B5563;
    }

    .no-comments {
      color: #6B6B6B;
      text-align: center;
      padding: var(--ft-spacing-lg);
    }

    .add-comment-form {
      display: flex;
      gap: var(--ft-spacing-sm);
      align-items: flex-start;

      mat-form-field {
        flex: 1;
      }
    }

    .full-width {
      width: 100%;
    }

    .history-item {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-md);
      flex-wrap: wrap;
    }

    .history-action {
      font-weight: 600;
      color: #2D2D2D;
    }

    .history-by, .history-date {
      font-size: 0.875rem;
      color: #6B6B6B;
    }

    .reviewer-notes {
      margin-top: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      background: #FFF9F5;
      border-radius: var(--ft-radius-md);

      strong {
        display: block;
        margin-bottom: var(--ft-spacing-xs);
        color: #2D2D2D;
      }

      p {
        margin: 0;
        color: #4B5563;
      }
    }

    .admin-actions {
      margin-top: var(--ft-spacing-lg);
    }

    .action-buttons {
      display: flex;
      gap: var(--ft-spacing-md);
      flex-wrap: wrap;

      button {
        min-width: 140px;

        i {
          margin-inline-end: var(--ft-spacing-xs);
        }
      }
    }

    .rollback-section {
      margin-top: var(--ft-spacing-lg);
      padding-top: var(--ft-spacing-lg);
      border-top: 1px solid #F4E4D7;
    }

    .rollback-form {
      padding: var(--ft-spacing-md);
      min-width: 280px;
    }

    .status-chip {
      font-size: 0.75rem;
      min-height: 22px;
      padding: 2px 10px;

      &--pending {
        background: #FEF3C7 !important;
        color: #92400E !important;
      }

      &--approved {
        background: #D1FAE5 !important;
        color: #065F46 !important;
      }

      &--rejected {
        background: #FEE2E2 !important;
        color: #991B1B !important;
      }

      &--info {
        background: #DBEAFE !important;
        color: #1E40AF !important;
      }

      &--withdrawn {
        background: #F3F4F6 !important;
        color: #4B5563 !important;
      }
    }

    mat-spinner {
      display: inline-block;
    }
  `]
})
export class SuggestionReviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly suggestionService = inject(SuggestionService);
  private readonly authService = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);

  readonly SuggestionStatus = SuggestionStatus;

  suggestion = signal<SuggestionDetail | null>(null);
  loading = signal(true);
  processing = signal(false);
  addingComment = signal(false);
  currentAction = signal<'approve' | 'reject' | 'info' | null>(null);
  showRejectReason = signal(false);
  rollbackReason = '';

  actionForm: FormGroup;
  commentForm: FormGroup;

  constructor() {
    this.actionForm = this.fb.group({
      notes: [''],
      reason: ['']
    });

    this.commentForm = this.fb.group({
      text: ['', [Validators.required, Validators.minLength(5)]]
    });
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.loadSuggestion(id);
      }
    });

    // Check for action query param
    this.route.queryParams.subscribe(params => {
      if (params['action'] === 'reject') {
        this.showRejectReason.set(true);
      }
    });
  }

  loadSuggestion(id: string): void {
    this.loading.set(true);
    this.suggestionService.getSuggestion(id).subscribe({
      next: (suggestion) => {
        this.suggestion.set(suggestion);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load suggestion:', err);
        this.loading.set(false);
      }
    });
  }

  isAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';
  }

  canTakeAction(): boolean {
    const status = this.suggestion()?.status;
    return status === SuggestionStatus.Pending || status === SuggestionStatus.NeedsInfo;
  }

  goBack(): void {
    if (this.isAdmin()) {
      this.router.navigate(['/admin/suggestions']);
    } else {
      this.router.navigate(['/suggestions/my']);
    }
  }

  approve(): void {
    if (this.processing()) return;

    this.processing.set(true);
    this.currentAction.set('approve');

    const notes = this.actionForm.get('notes')?.value;
    this.suggestionService.approveSuggestion(this.suggestion()!.id, notes).subscribe({
      next: (updated) => {
        this.suggestion.set(updated);
        this.processing.set(false);
        this.currentAction.set(null);
        this.snackBar.open(this.i18n.t('suggestion.approveSuccess'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: (err) => {
        console.error('Failed to approve:', err);
        this.processing.set(false);
        this.currentAction.set(null);
        this.snackBar.open(this.i18n.t('suggestion.approveError'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  reject(): void {
    if (this.processing()) return;

    // Show reason field if not already visible
    if (!this.showRejectReason()) {
      this.showRejectReason.set(true);
      return;
    }

    const reason = this.actionForm.get('reason')?.value;
    if (!reason) {
      this.snackBar.open(this.i18n.t('suggestion.reasonRequired'), this.i18n.t('common.close'), { duration: 3000 });
      return;
    }

    this.processing.set(true);
    this.currentAction.set('reject');

    const notes = this.actionForm.get('notes')?.value;
    this.suggestionService.rejectSuggestion(this.suggestion()!.id, reason, notes).subscribe({
      next: (updated) => {
        this.suggestion.set(updated);
        this.processing.set(false);
        this.currentAction.set(null);
        this.showRejectReason.set(false);
        this.snackBar.open(this.i18n.t('suggestion.rejectSuccess'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: (err) => {
        console.error('Failed to reject:', err);
        this.processing.set(false);
        this.currentAction.set(null);
        this.snackBar.open(this.i18n.t('suggestion.rejectError'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  requestMoreInfo(): void {
    if (this.processing()) return;

    // Show reason field if not already visible
    if (!this.showRejectReason()) {
      this.showRejectReason.set(true);
      return;
    }

    const reason = this.actionForm.get('reason')?.value;
    if (!reason) {
      this.snackBar.open(this.i18n.t('suggestion.reasonRequired'), this.i18n.t('common.close'), { duration: 3000 });
      return;
    }

    this.processing.set(true);
    this.currentAction.set('info');

    const notes = this.actionForm.get('notes')?.value;
    this.suggestionService.requestMoreInfo(this.suggestion()!.id, reason, notes).subscribe({
      next: (updated) => {
        this.suggestion.set(updated);
        this.processing.set(false);
        this.currentAction.set(null);
        this.showRejectReason.set(false);
        this.snackBar.open(this.i18n.t('suggestion.infoRequestSuccess'), this.i18n.t('common.close'), { duration: 3000 });
      },
      error: (err) => {
        console.error('Failed to request info:', err);
        this.processing.set(false);
        this.currentAction.set(null);
        this.snackBar.open(this.i18n.t('suggestion.infoRequestError'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  rollback(): void {
    if (this.processing() || !this.rollbackReason) return;

    this.processing.set(true);

    this.suggestionService.rollbackSuggestion(this.suggestion()!.id, this.rollbackReason).subscribe({
      next: () => {
        this.processing.set(false);
        this.snackBar.open(this.i18n.t('suggestion.rollbackSuccess'), this.i18n.t('common.close'), { duration: 3000 });
        this.goBack();
      },
      error: (err) => {
        console.error('Failed to rollback:', err);
        this.processing.set(false);
        this.snackBar.open(this.i18n.t('suggestion.rollbackError'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  addComment(): void {
    if (!this.commentForm.valid || this.addingComment()) return;

    this.addingComment.set(true);

    this.suggestionService.addComment(this.suggestion()!.id, {
      content: this.commentForm.get('text')?.value
    }).subscribe({
      next: (comment) => {
        // Reload suggestion to get updated comments
        this.loadSuggestion(this.suggestion()!.id);
        this.commentForm.reset();
        this.addingComment.set(false);
      },
      error: (err) => {
        console.error('Failed to add comment:', err);
        this.addingComment.set(false);
        this.snackBar.open(this.i18n.t('suggestion.commentError'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  getTypeLabel(type: SuggestionType): string {
    switch (type) {
      case SuggestionType.AddPerson: return 'suggestion.types.addPerson';
      case SuggestionType.UpdatePerson: return 'suggestion.types.updatePerson';
      case SuggestionType.AddParent: return 'suggestion.types.addParent';
      case SuggestionType.AddChild: return 'suggestion.types.addChild';
      case SuggestionType.AddSpouse: return 'suggestion.types.addSpouse';
      case SuggestionType.RemoveRelationship: return 'suggestion.types.removeRelationship';
      case SuggestionType.MergePerson: return 'suggestion.types.mergePerson';
      case SuggestionType.SplitPerson: return 'suggestion.types.splitPerson';
      default: return 'common.unknown';
    }
  }

  getTargetPersonLabel(): string {
    const type = this.suggestion()?.type;
    switch (type) {
      case SuggestionType.AddParent: return 'suggestion.labels.child';
      case SuggestionType.AddChild: return 'suggestion.labels.parent';
      case SuggestionType.MergePerson: return 'suggestion.labels.keepPerson';
      case SuggestionType.UpdatePerson: return 'suggestion.labels.personToUpdate';
      default: return 'suggestion.labels.person';
    }
  }

  getSecondaryPersonLabel(): string {
    const type = this.suggestion()?.type;
    switch (type) {
      case SuggestionType.AddParent: return 'suggestion.labels.parentToAdd';
      case SuggestionType.AddChild: return 'suggestion.labels.childToAdd';
      case SuggestionType.AddSpouse: return 'suggestion.labels.spouseToAdd';
      case SuggestionType.MergePerson: return 'suggestion.labels.duplicatePerson';
      default: return 'suggestion.labels.relatedPerson';
    }
  }

  getStatusLabel(status: SuggestionStatus): string {
    switch (status) {
      case SuggestionStatus.Pending: return 'suggestion.status.pending';
      case SuggestionStatus.Approved: return 'suggestion.status.approved';
      case SuggestionStatus.Rejected: return 'suggestion.status.rejected';
      case SuggestionStatus.NeedsInfo: return 'suggestion.status.needsInfo';
      case SuggestionStatus.Withdrawn: return 'suggestion.status.withdrawn';
      default: return 'common.unknown';
    }
  }

  getStatusClass(status: SuggestionStatus): string {
    switch (status) {
      case SuggestionStatus.Pending: return 'pending';
      case SuggestionStatus.Approved: return 'approved';
      case SuggestionStatus.Rejected: return 'rejected';
      case SuggestionStatus.NeedsInfo: return 'info';
      case SuggestionStatus.Withdrawn: return 'withdrawn';
      default: return '';
    }
  }

  getConfidenceLabel(level: ConfidenceLevel): string {
    switch (level) {
      case ConfidenceLevel.Certain: return 'suggestion.confidence.certain';
      case ConfidenceLevel.Probable: return 'suggestion.confidence.probable';
      case ConfidenceLevel.Possible: return 'suggestion.confidence.possible';
      case ConfidenceLevel.Uncertain: return 'suggestion.confidence.uncertain';
      default: return 'common.unknown';
    }
  }

  getEvidenceIcon(type: number): string {
    switch (type) {
      case 0: return 'fa-file-alt'; // Document
      case 1: return 'fa-image'; // Photo
      case 2: return 'fa-link'; // Link
      case 3: return 'fa-quote-left'; // OralHistory
      case 4: return 'fa-file'; // Other
      default: return 'fa-file';
    }
  }

  formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString(this.i18n.currentLang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
