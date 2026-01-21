import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatRippleModule } from '@angular/material/core';

import { I18nService, TranslatePipe } from '../../core/i18n';
import { SuggestionService } from '../../core/services/suggestion.service';
import {
  SuggestionSummary,
  SuggestionStatus,
  SuggestionType,
  SuggestionStats
} from '../../core/models/suggestion.models';
import { SuggestionWizardDialogComponent } from './suggestion-wizard-dialog.component';

@Component({
  selector: 'app-my-suggestions',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatTabsModule,
    MatChipsModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatRippleModule,
    TranslatePipe
  ],
  template: `
    <div class="my-suggestions">
      <!-- Header -->
      <header class="my-suggestions__header">
        <div class="my-suggestions__title-row">
          <button mat-icon-button routerLink="/dashboard" class="back-button">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h1>{{ 'suggestion.mySuggestions' | translate }}</h1>
        </div>
        <button mat-flat-button color="primary" (click)="openWizard()">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          {{ 'suggestion.newSuggestion' | translate }}
        </button>
      </header>

      <!-- Stats Summary -->
      @if (stats()) {
        <div class="stats-summary">
          <div class="stats-summary__item stats-summary__item--pending">
            <span class="stats-summary__value">{{ stats()!.pendingCount }}</span>
            <span class="stats-summary__label">{{ 'suggestion.status.pending' | translate }}</span>
          </div>
          <div class="stats-summary__item stats-summary__item--approved">
            <span class="stats-summary__value">{{ stats()!.approvedCount }}</span>
            <span class="stats-summary__label">{{ 'suggestion.status.approved' | translate }}</span>
          </div>
          <div class="stats-summary__item stats-summary__item--rejected">
            <span class="stats-summary__value">{{ stats()!.rejectedCount }}</span>
            <span class="stats-summary__label">{{ 'suggestion.status.rejected' | translate }}</span>
          </div>
          <div class="stats-summary__item stats-summary__item--info">
            <span class="stats-summary__value">{{ stats()!.needsInfoCount }}</span>
            <span class="stats-summary__label">{{ 'suggestion.status.needsInfo' | translate }}</span>
          </div>
        </div>
      }

      <!-- Filter Tabs -->
      <mat-tab-group (selectedIndexChange)="onTabChange($event)" [selectedIndex]="selectedTabIndex()">
        <mat-tab [label]="'common.all' | translate"></mat-tab>
        <mat-tab [label]="'suggestion.status.pending' | translate"></mat-tab>
        <mat-tab [label]="'suggestion.status.approved' | translate"></mat-tab>
        <mat-tab [label]="'suggestion.status.rejected' | translate"></mat-tab>
        <mat-tab [label]="'suggestion.status.needsInfo' | translate"></mat-tab>
      </mat-tab-group>

      <!-- Suggestions List -->
      <div class="suggestions-list">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else if (suggestions().length === 0) {
          <div class="empty-state">
            <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
            <h3>{{ 'suggestion.noSuggestions' | translate }}</h3>
            <p>{{ 'suggestion.noSuggestionsHint' | translate }}</p>
            <button mat-flat-button color="primary" (click)="openWizard()">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              {{ 'suggestion.createFirst' | translate }}
            </button>
          </div>
        } @else {
          @for (suggestion of suggestions(); track suggestion.id) {
            <div
              class="suggestion-card"
              [class.suggestion-card--pending]="suggestion.status === SuggestionStatus.Pending"
              [class.suggestion-card--approved]="suggestion.status === SuggestionStatus.Approved"
              [class.suggestion-card--rejected]="suggestion.status === SuggestionStatus.Rejected"
              [class.suggestion-card--info]="suggestion.status === SuggestionStatus.NeedsInfo"
              matRipple
              (click)="viewSuggestion(suggestion)">
              <div class="suggestion-card__icon">
                <i class="fa-solid" [ngClass]="getTypeIcon(suggestion.type)" aria-hidden="true"></i>
              </div>
              <div class="suggestion-card__content">
                <div class="suggestion-card__header">
                  <span class="suggestion-card__type">{{ getTypeLabel(suggestion.type) | translate }}</span>
                  <mat-chip [class]="'status-chip status-chip--' + getStatusClass(suggestion.status)">
                    {{ getStatusLabel(suggestion.status) | translate }}
                  </mat-chip>
                </div>
                <div class="suggestion-card__people">
                  @if (suggestion.targetPersonName) {
                    <span class="person-name">{{ suggestion.targetPersonName }}</span>
                  }
                  @if (suggestion.secondaryPersonName) {
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                    <span class="person-name">{{ suggestion.secondaryPersonName }}</span>
                  }
                </div>
                <div class="suggestion-card__meta">
                  @if (suggestion.townName || suggestion.townNameEn || suggestion.townNameAr) {
                    <span class="suggestion-card__town">
                      <i class="fa-solid fa-city" aria-hidden="true"></i>
                      {{ getTownDisplayName(suggestion) }}
                    </span>
                  }
                  @if (suggestion.treeName) {
                    <span class="suggestion-card__tree">
                      <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                      {{ suggestion.treeName }}
                    </span>
                  }
                  <span class="suggestion-card__date">{{ formatDate(suggestion.createdAt) }}</span>
                  @if (suggestion.commentCount > 0) {
                    <span class="suggestion-card__notes">
                      <i class="fa-solid fa-comment" aria-hidden="true"></i>
                      {{ suggestion.commentCount }}
                    </span>
                  }
                </div>
              </div>
              <i class="fa-solid fa-chevron-right suggestion-card__arrow" aria-hidden="true"></i>
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
    .my-suggestions {
      padding: var(--ft-spacing-md);

      @media (min-width: 768px) {
        padding: var(--ft-spacing-lg);
      }

      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ft-spacing-lg);
        gap: var(--ft-spacing-md);
        flex-wrap: wrap;
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

    .stats-summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--ft-spacing-sm);
      margin-bottom: var(--ft-spacing-lg);

      @media (min-width: 768px) {
        grid-template-columns: repeat(4, 1fr);
      }

      &__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ft-spacing-md);
        background: white;
        border-radius: var(--ft-radius-md);
        border: 1px solid #F4E4D7;

        &--pending { border-left: 3px solid #EAB308; }
        &--approved { border-left: 3px solid #22C55E; }
        &--rejected { border-left: 3px solid #EF4444; }
        &--info { border-left: 3px solid #3B82F6; }
      }

      &__value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #2D2D2D;
        font-family: 'Cinzel', serif;
      }

      &__label {
        font-size: 0.75rem;
        color: #6B6B6B;
        text-transform: uppercase;
      }
    }

    mat-tab-group {
      margin-bottom: var(--ft-spacing-lg);
    }

    .suggestions-list {
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
        color: #187573;
        opacity: 0.5;
        margin-bottom: var(--ft-spacing-md);
      }

      h3 {
        margin: 0 0 var(--ft-spacing-sm);
        color: #2D2D2D;
      }

      p {
        margin: 0 0 var(--ft-spacing-lg);
        color: #6B6B6B;
      }
    }

    .suggestion-card {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-md);
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
      &--approved { border-left: 3px solid #22C55E; }
      &--rejected { border-left: 3px solid #EF4444; }
      &--info { border-left: 3px solid #3B82F6; }

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
      }

      &__town {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        color: #8B5A2B;

        i { font-size: 11px; }
      }

      &__tree {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        color: #187573;

        i { font-size: 11px; }
      }

      &__notes {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        color: #3B82F6;
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
export class MySuggestionsComponent implements OnInit {
  private readonly suggestionService = inject(SuggestionService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly SuggestionStatus = SuggestionStatus;

  suggestions = signal<SuggestionSummary[]>([]);
  stats = signal<SuggestionStats | null>(null);
  loading = signal(true);
  totalCount = signal(0);
  currentPage = signal(1);
  selectedTabIndex = signal(0);
  pageSize = 20;

  private statusFilter: SuggestionStatus | undefined = undefined;

  ngOnInit(): void {
    this.loadStats();
    this.loadSuggestions();
  }

  loadStats(): void {
    this.suggestionService.getMyStatistics().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (err) => console.error('Failed to load stats:', err)
    });
  }

  loadSuggestions(): void {
    this.loading.set(true);
    this.suggestionService.getMySuggestions(this.statusFilter, this.currentPage(), this.pageSize).subscribe({
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
      case 0: this.statusFilter = undefined; break;
      case 1: this.statusFilter = SuggestionStatus.Pending; break;
      case 2: this.statusFilter = SuggestionStatus.Approved; break;
      case 3: this.statusFilter = SuggestionStatus.Rejected; break;
      case 4: this.statusFilter = SuggestionStatus.NeedsInfo; break;
    }

    this.loadSuggestions();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize = event.pageSize;
    this.loadSuggestions();
  }

  openWizard(): void {
    const dialogRef = this.dialog.open(SuggestionWizardDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      panelClass: 'ft-dialog',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadStats();
        this.loadSuggestions();
      }
    });
  }

  viewSuggestion(suggestion: SuggestionSummary): void {
    this.router.navigate(['/suggestions', suggestion.id]);
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
