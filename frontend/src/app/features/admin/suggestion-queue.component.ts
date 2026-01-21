import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatRippleModule } from '@angular/material/core';
import { MatBadgeModule } from '@angular/material/badge';

import { I18nService, TranslatePipe } from '../../core/i18n';
import { SuggestionService } from '../../core/services/suggestion.service';
import { AuthService } from '../../core/services/auth.service';
import {
  SuggestionSummary,
  SuggestionStatus,
  SuggestionType,
  SuggestionQueryParams,
  PendingByTown
} from '../../core/models/suggestion.models';

@Component({
  selector: 'app-suggestion-queue',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatTabsModule,
    MatChipsModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatMenuModule,
    MatRippleModule,
    MatBadgeModule,
    TranslatePipe
  ],
  template: `
    <div class="suggestion-queue">
      <!-- Header -->
      <header class="suggestion-queue__header">
        <div class="suggestion-queue__title-row">
          <button mat-icon-button routerLink="/admin" class="back-button">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h1>{{ 'suggestion.reviewQueue' | translate }}</h1>
          @if (pendingCount() > 0) {
            <span class="pending-badge">{{ pendingCount() }}</span>
          }
        </div>
      </header>

      <!-- Filters -->
      <div class="filters">
        <!-- Town Filter (for SuperAdmin) -->
        @if (isSuperAdmin()) {
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>{{ 'suggestion.filterByTown' | translate }}</mat-label>
            <mat-select [(value)]="selectedTownId" (selectionChange)="onFilterChange()">
              <mat-option [value]="null">{{ 'common.all' | translate }}</mat-option>
              @for (town of pendingByTown(); track town.townId) {
                <mat-option [value]="town.townId">
                  {{ town.townName }}
                  <span class="town-count">({{ town.pendingCount }})</span>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <!-- Type Filter -->
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>{{ 'suggestion.filterByType' | translate }}</mat-label>
          <mat-select [(value)]="selectedType" (selectionChange)="onFilterChange()">
            <mat-option [value]="null">{{ 'common.all' | translate }}</mat-option>
            @for (type of suggestionTypes; track type.value) {
              <mat-option [value]="type.value">{{ type.labelKey | translate }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <!-- Status Tabs -->
      <mat-tab-group (selectedIndexChange)="onTabChange($event)" [selectedIndex]="selectedTabIndex()">
        <mat-tab>
          <ng-template mat-tab-label>
            {{ 'suggestion.status.pending' | translate }}
            @if (pendingCount() > 0) {
              <span class="tab-badge tab-badge--pending">{{ pendingCount() }}</span>
            }
          </ng-template>
        </mat-tab>
        <mat-tab [label]="'suggestion.status.needsInfo' | translate"></mat-tab>
        <mat-tab [label]="'suggestion.status.approved' | translate"></mat-tab>
        <mat-tab [label]="'suggestion.status.rejected' | translate"></mat-tab>
        <mat-tab [label]="'common.all' | translate"></mat-tab>
      </mat-tab-group>

      <!-- Queue List -->
      <div class="queue-list">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else if (suggestions().length === 0) {
          <div class="empty-state">
            <i class="fa-solid fa-inbox" aria-hidden="true"></i>
            <h3>{{ 'suggestion.noSuggestionsInQueue' | translate }}</h3>
            <p>{{ 'suggestion.queueEmptyMessage' | translate }}</p>
          </div>
        } @else {
          @for (suggestion of suggestions(); track suggestion.id) {
            <div
              class="queue-card"
              [class.queue-card--pending]="suggestion.status === SuggestionStatus.Pending"
              [class.queue-card--info]="suggestion.status === SuggestionStatus.NeedsInfo"
              [class.queue-card--approved]="suggestion.status === SuggestionStatus.Approved"
              [class.queue-card--rejected]="suggestion.status === SuggestionStatus.Rejected"
              matRipple
              (click)="reviewSuggestion(suggestion)">
              <div class="queue-card__main">
                <div class="queue-card__icon">
                  <i class="fa-solid" [ngClass]="getTypeIcon(suggestion.type)" aria-hidden="true"></i>
                </div>
                <div class="queue-card__content">
                  <div class="queue-card__header">
                    <span class="queue-card__type">{{ getTypeLabel(suggestion.type) | translate }}</span>
                    <mat-chip [class]="'status-chip status-chip--' + getStatusClass(suggestion.status)">
                      {{ getStatusLabel(suggestion.status) | translate }}
                    </mat-chip>
                  </div>
                  <div class="queue-card__people">
                    @if (suggestion.targetPersonName) {
                      <span class="person-name">{{ suggestion.targetPersonName }}</span>
                    }
                    @if (suggestion.secondaryPersonName) {
                      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                      <span class="person-name">{{ suggestion.secondaryPersonName }}</span>
                    }
                  </div>
                  <div class="queue-card__meta">
                    @if (suggestion.townName || suggestion.townNameEn || suggestion.townNameAr) {
                      <span class="queue-card__town">
                        <i class="fa-solid fa-city" aria-hidden="true"></i>
                        {{ getTownDisplayName(suggestion) }}
                      </span>
                    }
                    @if (suggestion.treeName) {
                      <span class="queue-card__tree">
                        <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                        {{ suggestion.treeName }}
                      </span>
                    }
                    <span class="queue-card__submitter">
                      <i class="fa-solid fa-user" aria-hidden="true"></i>
                      {{ suggestion.submitterName }}
                    </span>
                    <span class="queue-card__date">{{ formatDate(suggestion.createdAt) }}</span>
                  </div>
                </div>
              </div>
              <div class="queue-card__actions">
                @if (suggestion.status === SuggestionStatus.Pending) {
                  <button mat-icon-button color="primary" (click)="quickApprove(suggestion, $event)" title="Approve">
                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                  </button>
                  <button mat-icon-button color="warn" (click)="quickReject(suggestion, $event)" title="Reject">
                    <i class="fa-solid fa-times" aria-hidden="true"></i>
                  </button>
                }
                <i class="fa-solid fa-chevron-right queue-card__arrow" aria-hidden="true"></i>
              </div>
            </div>
          }

          <!-- Pagination -->
          <mat-paginator
            [length]="totalCount()"
            [pageSize]="pageSize"
            [pageIndex]="currentPage() - 1"
            [pageSizeOptions]="[10, 20, 50]"
            (page)="onPageChange($event)">
          </mat-paginator>
        }
      </div>
    </div>
  `,
  styles: [`
    .suggestion-queue {
      padding: var(--ft-spacing-md);

      @media (min-width: 768px) {
        padding: var(--ft-spacing-lg);
      }

      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ft-spacing-lg);
      }

      &__title-row {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);

        h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: #2D2D2D;
          font-family: 'Cinzel', serif;
        }
      }
    }

    .back-button {
      color: #187573;
    }

    .pending-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 8px;
      border-radius: 12px;
      background: #DC2626;
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .filters {
      display: flex;
      gap: var(--ft-spacing-md);
      margin-bottom: var(--ft-spacing-lg);
      flex-wrap: wrap;
    }

    .filter-field {
      min-width: 200px;
    }

    .town-count {
      color: #6B6B6B;
      font-size: 0.813rem;
    }

    .tab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      font-size: 0.7rem;
      font-weight: 700;
      margin-inline-start: var(--ft-spacing-xs);

      &--pending {
        background: #DC2626;
        color: white;
      }
    }

    mat-tab-group {
      margin-bottom: var(--ft-spacing-lg);
    }

    .queue-list {
      min-height: 300px;
    }

    .loading-state {
      display: flex;
      justify-content: center;
      padding: var(--ft-spacing-xxl);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--ft-spacing-xxl);
      text-align: center;

      i {
        font-size: 48px;
        color: #22C55E;
        opacity: 0.5;
        margin-bottom: var(--ft-spacing-md);
      }

      h3 {
        margin: 0 0 var(--ft-spacing-sm);
        color: #2D2D2D;
      }

      p {
        margin: 0;
        color: #6B6B6B;
      }
    }

    .queue-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--ft-spacing-md);
      background: white;
      border-radius: var(--ft-radius-lg);
      border: 1px solid #F4E4D7;
      margin-bottom: var(--ft-spacing-sm);
      cursor: pointer;
      transition: all var(--ft-transition-fast);

      &:hover {
        box-shadow: 0 4px 12px rgba(45, 45, 45, 0.1);
        transform: translateY(-1px);
      }

      &--pending { border-left: 3px solid #EAB308; }
      &--info { border-left: 3px solid #3B82F6; }
      &--approved { border-left: 3px solid #22C55E; }
      &--rejected { border-left: 3px solid #EF4444; }

      &__main {
        display: flex;
        align-items: flex-start;
        gap: var(--ft-spacing-md);
        flex: 1;
        min-width: 0;
      }

      &__icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #E6F5F5;
        flex-shrink: 0;

        i {
          color: #187573;
          font-size: 18px;
        }
      }

      &__content {
        flex: 1;
        min-width: 0;
      }

      &__header {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        margin-bottom: var(--ft-spacing-xs);
        flex-wrap: wrap;
      }

      &__type {
        font-weight: 600;
        color: #2D2D2D;
      }

      &__people {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        margin-bottom: var(--ft-spacing-xs);
        flex-wrap: wrap;

        .person-name {
          color: #187573;
          font-weight: 500;
        }

        i {
          color: #6B6B6B;
          font-size: 12px;
        }
      }

      &__meta {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-md);
        font-size: 0.813rem;
        color: #6B6B6B;
        flex-wrap: wrap;

        i {
          margin-inline-end: 4px;
        }
      }

      &__town {
        display: flex;
        align-items: center;
        color: #8B5A2B;

        i { font-size: 11px; }
      }

      &__tree {
        display: flex;
        align-items: center;
        color: #187573;

        i { font-size: 11px; }
      }

      &__actions {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
      }

      &__arrow {
        color: #C17E3E;
        flex-shrink: 0;
      }
    }

    .status-chip {
      font-size: 0.7rem;
      min-height: 20px;
      padding: 2px 8px;

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

    mat-paginator {
      margin-top: var(--ft-spacing-md);
    }
  `]
})
export class SuggestionQueueComponent implements OnInit {
  private readonly suggestionService = inject(SuggestionService);
  private readonly authService = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly SuggestionStatus = SuggestionStatus;

  suggestions = signal<SuggestionSummary[]>([]);
  pendingByTown = signal<PendingByTown[]>([]);
  loading = signal(true);
  totalCount = signal(0);
  pendingCount = signal(0);
  currentPage = signal(1);
  selectedTabIndex = signal(0);
  pageSize = 20;

  // Filters
  selectedTownId: string | null = null;
  selectedType: SuggestionType | null = null;
  private statusFilter: SuggestionStatus | undefined = SuggestionStatus.Pending;

  suggestionTypes = [
    { value: SuggestionType.AddPerson, labelKey: 'suggestion.types.addPerson' },
    { value: SuggestionType.UpdatePerson, labelKey: 'suggestion.types.updatePerson' },
    { value: SuggestionType.AddParent, labelKey: 'suggestion.types.addParent' },
    { value: SuggestionType.AddChild, labelKey: 'suggestion.types.addChild' },
    { value: SuggestionType.AddSpouse, labelKey: 'suggestion.types.addSpouse' },
    { value: SuggestionType.RemoveRelationship, labelKey: 'suggestion.types.removeRelationship' },
    { value: SuggestionType.MergePerson, labelKey: 'suggestion.types.mergePerson' },
    { value: SuggestionType.SplitPerson, labelKey: 'suggestion.types.splitPerson' }
  ];

  isSuperAdmin = computed(() => {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'SuperAdmin';
  });

  ngOnInit(): void {
    this.loadPendingByTown();
    this.loadSuggestions();
  }

  loadPendingByTown(): void {
    this.suggestionService.getPendingByTown().subscribe({
      next: (data) => {
        this.pendingByTown.set(data);
        // Calculate total pending
        const total = data.reduce((sum, t) => sum + t.pendingCount, 0);
        this.pendingCount.set(total);
      },
      error: (err) => console.error('Failed to load pending by town:', err)
    });
  }

  loadSuggestions(): void {
    this.loading.set(true);

    const params: SuggestionQueryParams = {
      status: this.statusFilter,
      type: this.selectedType ?? undefined,
      townId: this.selectedTownId ?? undefined,
      page: this.currentPage(),
      pageSize: this.pageSize
    };

    this.suggestionService.getSuggestionQueue(params).subscribe({
      next: (response) => {
        this.suggestions.set(response.items);
        this.totalCount.set(response.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load suggestions:', err);
        this.loading.set(false);
      }
    });
  }

  onTabChange(index: number): void {
    this.selectedTabIndex.set(index);
    this.currentPage.set(1);

    switch (index) {
      case 0: this.statusFilter = SuggestionStatus.Pending; break;
      case 1: this.statusFilter = SuggestionStatus.NeedsInfo; break;
      case 2: this.statusFilter = SuggestionStatus.Approved; break;
      case 3: this.statusFilter = SuggestionStatus.Rejected; break;
      case 4: this.statusFilter = undefined; break;
    }

    this.loadSuggestions();
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadSuggestions();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize = event.pageSize;
    this.loadSuggestions();
  }

  reviewSuggestion(suggestion: SuggestionSummary): void {
    this.router.navigate(['/admin/suggestions', suggestion.id]);
  }

  quickApprove(suggestion: SuggestionSummary, event: Event): void {
    event.stopPropagation();
    this.suggestionService.approveSuggestion(suggestion.id).subscribe({
      next: () => {
        this.loadSuggestions();
        this.loadPendingByTown();
      },
      error: (err) => console.error('Failed to approve:', err)
    });
  }

  quickReject(suggestion: SuggestionSummary, event: Event): void {
    event.stopPropagation();
    // For quick reject, we'll navigate to the review page
    this.router.navigate(['/admin/suggestions', suggestion.id], { queryParams: { action: 'reject' } });
  }

  getTypeIcon(type: SuggestionType): string {
    switch (type) {
      case SuggestionType.AddPerson: return 'fa-user-plus';
      case SuggestionType.UpdatePerson: return 'fa-pen';
      case SuggestionType.AddParent: return 'fa-arrow-up';
      case SuggestionType.AddChild: return 'fa-arrow-down';
      case SuggestionType.AddSpouse: return 'fa-heart';
      case SuggestionType.RemoveRelationship: return 'fa-link-slash';
      case SuggestionType.MergePerson: return 'fa-code-merge';
      case SuggestionType.SplitPerson: return 'fa-code-branch';
      default: return 'fa-question';
    }
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

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(this.i18n.currentLang(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getTownDisplayName(suggestion: SuggestionSummary): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') return suggestion.townNameAr || suggestion.townNameEn || suggestion.townName || '';
    if (lang === 'nob') return suggestion.townName || suggestion.townNameEn || suggestion.townNameAr || '';
    return suggestion.townNameEn || suggestion.townName || suggestion.townNameAr || '';
  }
}
