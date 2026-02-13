import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

import { PredictionService } from '../../../core/services/prediction.service';
import { FamilyTreeService } from '../../../core/services/family-tree.service';
import { TreeContextService } from '../../../core/services/tree-context.service';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService, TranslatePipe } from '../../../core/i18n';
import { FamilyTreeListItem } from '../../../core/models/family-tree.models';
import {
  PredictionDto,
  PredictionScanResult,
  PagedPredictionResult,
  getRuleLabel,
  getRuleIcon,
  getPredictedTypeLabel,
  getPredictedTypeIcon,
  getConfidenceClass,
  getPersonDisplayName
} from '../../../core/models/prediction.models';

@Component({
  selector: 'app-predictions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatChipsModule,
    TranslatePipe
  ],
  template: `
    <div class="predictions-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/admin" class="back-link">
            <i class="fas fa-arrow-left"></i>
          </a>
          <h1>{{ 'admin.predictions.title' | translate }}</h1>
          @if (predictions()?.totalCount) {
            <span class="total-badge">{{ predictions()!.totalCount }}</span>
          }
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar">
        <mat-select
          [(ngModel)]="selectedTreeId"
          (selectionChange)="onTreeChange()"
          placeholder="{{ 'admin.predictions.tree' | translate }}"
          class="filter-select">
          @if (isSuperAdmin()) {
            <mat-option [value]="null">
              {{ 'admin.predictions.allTrees' | translate }}
            </mat-option>
          }
          @for (tree of trees(); track tree.id) {
            <mat-option [value]="tree.id">{{ tree.name }}</mat-option>
          }
        </mat-select>

        <mat-select
          [(ngModel)]="selectedStatus"
          placeholder="{{ 'admin.predictions.status' | translate }}"
          class="filter-select">
          <mat-option [value]="null">{{ 'admin.predictions.allStatuses' | translate }}</mat-option>
          <mat-option value="New">{{ 'admin.predictions.statusNew' | translate }}</mat-option>
          <mat-option value="Confirmed">{{ 'admin.predictions.statusConfirmed' | translate }}</mat-option>
          <mat-option value="Dismissed">{{ 'admin.predictions.statusDismissed' | translate }}</mat-option>
          <mat-option value="Applied">{{ 'admin.predictions.statusApplied' | translate }}</mat-option>
        </mat-select>

        <mat-select
          [(ngModel)]="selectedConfidence"
          placeholder="{{ 'admin.predictions.confidence' | translate }}"
          class="filter-select">
          <mat-option [value]="null">{{ 'admin.predictions.allConfidence' | translate }}</mat-option>
          <mat-option value="High">{{ 'admin.predictions.high' | translate }} (85%+)</mat-option>
          <mat-option value="Medium">{{ 'admin.predictions.medium' | translate }} (60-84%)</mat-option>
          <mat-option value="Low">{{ 'admin.predictions.low' | translate }} (&lt;60%)</mat-option>
        </mat-select>

        <mat-select
          [(ngModel)]="selectedRule"
          placeholder="{{ 'admin.predictions.rule' | translate }}"
          class="filter-select">
          <mat-option [value]="null">{{ 'admin.predictions.allRules' | translate }}</mat-option>
          <mat-option value="spouse_child_gap">{{ 'admin.predictions.ruleSpouseChildGap' | translate }}</mat-option>
          <mat-option value="missing_union">{{ 'admin.predictions.ruleMissingUnion' | translate }}</mat-option>
          <mat-option value="sibling_parent_gap">{{ 'admin.predictions.ruleSiblingParentGap' | translate }}</mat-option>
          <mat-option value="patronymic_name">{{ 'admin.predictions.rulePatronymicName' | translate }}</mat-option>
          <mat-option value="age_family">{{ 'admin.predictions.ruleAgeFamily' | translate }}</mat-option>
        </mat-select>

        <button
          mat-raised-button
          color="primary"
          (click)="scan()"
          [disabled]="scanning() || !selectedTreeId"
          class="scan-button">
          @if (scanning()) {
            <mat-spinner diameter="20"></mat-spinner>
            {{ 'admin.predictions.scanning' | translate }}
          } @else {
            <i class="fas fa-magnifying-glass-chart"></i>
            {{ 'admin.predictions.scan' | translate }}
          }
        </button>

        <button
          mat-stroked-button
          color="primary"
          (click)="loadPredictions()"
          [disabled]="loading() || !selectedTreeId"
          class="load-button">
          <i class="fas fa-list"></i>
          {{ 'admin.predictions.loadExisting' | translate }}
        </button>
      </div>

      <!-- Scan Result Summary -->
      @if (scanResult()) {
        <div class="summary-grid">
          <div class="summary-card"
               [class.active]="selectedConfidence === 'High'"
               (click)="filterByConfidence('High')">
            <div class="summary-icon summary-icon--high">
              <i class="fas fa-arrow-up"></i>
            </div>
            <div class="summary-content">
              <div class="summary-label">{{ 'admin.predictions.high' | translate }}</div>
              <div class="summary-count">{{ scanResult()!.highConfidence }}</div>
              <div class="summary-hint">85%+</div>
            </div>
          </div>

          <div class="summary-card"
               [class.active]="selectedConfidence === 'Medium'"
               (click)="filterByConfidence('Medium')">
            <div class="summary-icon summary-icon--medium">
              <i class="fas fa-minus"></i>
            </div>
            <div class="summary-content">
              <div class="summary-label">{{ 'admin.predictions.medium' | translate }}</div>
              <div class="summary-count">{{ scanResult()!.mediumConfidence }}</div>
              <div class="summary-hint">60-84%</div>
            </div>
          </div>

          <div class="summary-card"
               [class.active]="selectedConfidence === 'Low'"
               (click)="filterByConfidence('Low')">
            <div class="summary-icon summary-icon--low">
              <i class="fas fa-arrow-down"></i>
            </div>
            <div class="summary-content">
              <div class="summary-label">{{ 'admin.predictions.low' | translate }}</div>
              <div class="summary-count">{{ scanResult()!.lowConfidence }}</div>
              <div class="summary-hint">&lt;60%</div>
            </div>
          </div>

          <div class="summary-card summary-card--total">
            <div class="summary-icon">
              <i class="fas fa-chart-bar"></i>
            </div>
            <div class="summary-content">
              <div class="summary-label">{{ 'admin.predictions.total' | translate }}</div>
              <div class="summary-count">{{ scanResult()!.totalPredictions }}</div>
            </div>
          </div>
        </div>

        <!-- Bulk Accept Button -->
        @if (scanResult()!.highConfidence > 0) {
          <div class="bulk-actions">
            <button
              mat-raised-button
              color="accent"
              (click)="bulkAcceptHigh()"
              [disabled]="bulkAccepting()">
              @if (bulkAccepting()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <i class="fas fa-check-double"></i>
              }
              {{ 'admin.predictions.acceptAllHigh' | translate }} ({{ scanResult()!.highConfidence }})
            </button>
          </div>
        }
      }

      <!-- Loading State -->
      @if (scanning() || loading()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>
            @if (scanning()) {
              {{ 'admin.predictions.scanning' | translate }}...
            } @else {
              {{ 'admin.predictions.loadingPredictions' | translate }}...
            }
          </p>
        </div>
      }

      <!-- Empty State -->
      @if (!scanning() && !loading() && hasLoaded() && (!predictions() || predictions()!.items.length === 0)) {
        <div class="empty-state">
          <i class="fas fa-check-circle"></i>
          <h3>{{ 'admin.predictions.noPredictionsFound' | translate }}</h3>
          <p>{{ 'admin.predictions.noPredictionsHint' | translate }}</p>
        </div>
      }

      <!-- Prediction Cards -->
      @if (predictions() && predictions()!.items.length > 0 && !scanning() && !loading()) {
        <div class="predictions-list">
          @for (prediction of predictions()!.items; track prediction.id) {
            @if (!resolvingIds().has(prediction.id)) {
              <div class="prediction-card" [class]="'confidence-' + getConfidenceClass(prediction.confidence)">
                <div class="card-header">
                  <div class="card-header-left">
                    <span class="rule-badge">
                      <i class="fas {{ getRuleIcon(prediction.ruleId) }}"></i>
                      {{ getRuleLabel(prediction.ruleId) }}
                    </span>
                    <span class="type-badge">
                      <i class="fas {{ getPredictedTypeIcon(prediction.predictedType) }}"></i>
                      {{ getPredictedTypeLabel(prediction.predictedType) }}
                    </span>
                  </div>
                  <span class="confidence-badge" [class]="'confidence-badge--' + getConfidenceClass(prediction.confidence)">
                    {{ prediction.confidence | number:'1.0-0' }}%
                  </span>
                </div>

                <div class="persons-comparison">
                  <!-- Source Person -->
                  <div class="person-card" (click)="navigateToPerson(prediction.sourcePersonId)">
                    <div class="person-header">
                      <i class="fas fa-user"></i>
                      <span class="person-name">
                        {{ getDisplayName(prediction.sourcePersonName, prediction.sourcePersonNameArabic) }}
                      </span>
                    </div>
                    @if (prediction.sourcePersonNameArabic && prediction.sourcePersonName) {
                      <div class="person-alt-name">{{ prediction.sourcePersonNameArabic }}</div>
                    }
                  </div>

                  <div class="relation-arrow">
                    <i class="fas fa-arrow-right"></i>
                    <small>{{ getPredictedTypeLabel(prediction.predictedType) }}</small>
                  </div>

                  <!-- Target Person -->
                  <div class="person-card" (click)="navigateToPerson(prediction.targetPersonId)">
                    <div class="person-header">
                      <i class="fas fa-user"></i>
                      <span class="person-name">
                        {{ getDisplayName(prediction.targetPersonName, prediction.targetPersonNameArabic) }}
                      </span>
                    </div>
                    @if (prediction.targetPersonNameArabic && prediction.targetPersonName) {
                      <div class="person-alt-name">{{ prediction.targetPersonNameArabic }}</div>
                    }
                  </div>
                </div>

                <!-- Explanation -->
                <div class="explanation">
                  <i class="fas fa-info-circle"></i>
                  {{ prediction.explanation }}
                </div>

                <!-- Actions -->
                @if (prediction.status === 0) {
                  <div class="card-actions">
                    <button
                      mat-button
                      color="warn"
                      (click)="dismissPrediction(prediction)"
                      matTooltip="{{ 'admin.predictions.dismissTooltip' | translate }}">
                      <i class="fas fa-times"></i>
                      {{ 'admin.predictions.dismiss' | translate }}
                    </button>
                    <button
                      mat-raised-button
                      color="primary"
                      (click)="acceptPrediction(prediction)"
                      matTooltip="{{ 'admin.predictions.acceptTooltip' | translate }}">
                      <i class="fas fa-check"></i>
                      {{ 'admin.predictions.accept' | translate }}
                    </button>
                  </div>
                } @else {
                  <div class="card-status">
                    @if (prediction.status === 1 || prediction.status === 3) {
                      <mat-chip class="status-chip status-chip--accepted">
                        <i class="fas fa-check"></i> {{ 'admin.predictions.statusApplied' | translate }}
                      </mat-chip>
                    } @else if (prediction.status === 2) {
                      <mat-chip class="status-chip status-chip--dismissed">
                        <i class="fas fa-times"></i> {{ 'admin.predictions.statusDismissed' | translate }}
                      </mat-chip>
                    }
                  </div>
                }
              </div>
            }
          }
        </div>

        <!-- Paginator -->
        @if (predictions()!.totalCount > pageSize) {
          <mat-paginator
            [length]="predictions()!.totalCount"
            [pageSize]="pageSize"
            [pageIndex]="currentPage - 1"
            [pageSizeOptions]="[10, 25, 50]"
            (page)="onPageChange($event)"
            showFirstLastButtons>
          </mat-paginator>
        }
      }
    </div>
  `,
  styles: [`
    .predictions-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .back-link {
      color: #187573;
      font-size: 1.2rem;
      text-decoration: none;
    }

    h1 {
      margin: 0;
      color: #333;
      font-size: 1.5rem;
    }

    .total-badge {
      background: #187573;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.9rem;
    }

    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: #f8f8f8;
      border-radius: 8px;
    }

    .filter-select {
      min-width: 160px;
    }

    .scan-button, .load-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Summary Grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: white;
      border: 2px solid #F4E4D7;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .summary-card:hover {
      border-color: #187573;
    }

    .summary-card.active {
      border-color: #187573;
      background: #f0f9f9;
    }

    .summary-card--total {
      cursor: default;
      border-color: #187573;
    }

    .summary-icon {
      font-size: 1.5rem;
      color: #C17E3E;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }

    .summary-icon--high {
      background: #d4edda;
      color: #28a745;
    }

    .summary-icon--medium {
      background: #fff3cd;
      color: #ffc107;
    }

    .summary-icon--low {
      background: #f8d7da;
      color: #dc3545;
    }

    .summary-label {
      font-size: 0.85rem;
      color: #666;
    }

    .summary-count {
      font-size: 1.5rem;
      font-weight: 600;
      color: #187573;
    }

    .summary-hint {
      font-size: 0.75rem;
      color: #999;
    }

    /* Bulk Actions */
    .bulk-actions {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 1.5rem;
    }

    /* Loading / Empty States */
    .loading-state, .empty-state {
      text-align: center;
      padding: 3rem;
      color: #666;
    }

    .empty-state i {
      font-size: 4rem;
      color: #187573;
      margin-bottom: 1rem;
    }

    /* Prediction Cards */
    .predictions-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .prediction-card {
      background: white;
      border: 2px solid #F4E4D7;
      border-radius: 8px;
      padding: 1rem;
    }

    .prediction-card.confidence-high {
      border-left: 4px solid #28a745;
    }

    .prediction-card.confidence-medium {
      border-left: 4px solid #ffc107;
    }

    .prediction-card.confidence-low {
      border-left: 4px solid #dc3545;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .card-header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .rule-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #C17E3E;
      font-weight: 500;
      font-size: 0.9rem;
    }

    .type-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #666;
      font-size: 0.85rem;
      padding: 0.15rem 0.5rem;
      background: #f0f0f0;
      border-radius: 4px;
    }

    .confidence-badge {
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.9rem;
      color: white;
    }

    .confidence-badge--high {
      background: #28a745;
    }

    .confidence-badge--medium {
      background: #ffc107;
      color: #333;
    }

    .confidence-badge--low {
      background: #dc3545;
    }

    .persons-comparison {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      align-items: center;
    }

    .person-card {
      flex: 1;
      padding: 0.75rem 1rem;
      background: #fafafa;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .person-card:hover {
      background: #f0f9f9;
    }

    .person-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .person-header i {
      color: #187573;
    }

    .person-name {
      font-weight: 600;
      color: #333;
    }

    .person-alt-name {
      color: #666;
      font-size: 0.85rem;
      margin-top: 0.25rem;
      padding-left: 1.5rem;
    }

    .relation-arrow {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      color: #C17E3E;
      font-size: 1.2rem;
      flex-shrink: 0;
    }

    .relation-arrow small {
      font-size: 0.7rem;
      color: #888;
    }

    .explanation {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem;
      background: #f0f9f9;
      border-radius: 4px;
      color: #187573;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      line-height: 1.4;
    }

    .explanation i {
      margin-top: 0.15rem;
      flex-shrink: 0;
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .card-status {
      display: flex;
      justify-content: flex-end;
    }

    .status-chip--accepted {
      background: #d4edda !important;
      color: #28a745 !important;
    }

    .status-chip--dismissed {
      background: #f8d7da !important;
      color: #dc3545 !important;
    }

    @media (max-width: 768px) {
      .persons-comparison {
        flex-direction: column;
      }

      .relation-arrow {
        flex-direction: row;
        transform: rotate(90deg);
        padding: 0.5rem 0;
      }

      .filter-bar {
        flex-direction: column;
      }

      .filter-select {
        width: 100%;
      }

      .card-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }
    }
  `]
})
export class PredictionsComponent implements OnInit {
  private readonly predictionService = inject(PredictionService);
  private readonly treeService = inject(FamilyTreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  readonly i18n = inject(I18nService);

  // Signals
  trees = signal<FamilyTreeListItem[]>([]);
  scanning = signal(false);
  loading = signal(false);
  hasLoaded = signal(false);
  scanResult = signal<PredictionScanResult | null>(null);
  predictions = signal<PagedPredictionResult | null>(null);
  resolvingIds = signal<Set<string>>(new Set());
  bulkAccepting = signal(false);

  // Filters
  selectedTreeId: string | null = null;
  selectedStatus: string | null = null;
  selectedConfidence: string | null = null;
  selectedRule: string | null = null;
  currentPage = 1;
  pageSize = 25;

  // Computed
  isSuperAdmin = computed(() => {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin';
  });

  // Expose helpers to template
  getRuleLabel = getRuleLabel;
  getRuleIcon = getRuleIcon;
  getPredictedTypeLabel = getPredictedTypeLabel;
  getPredictedTypeIcon = getPredictedTypeIcon;
  getConfidenceClass = getConfidenceClass;

  ngOnInit(): void {
    this.loadTrees();
  }

  private loadTrees(): void {
    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.trees.set(trees);
        if (!this.isSuperAdmin() && trees.length > 0) {
          this.selectedTreeId = trees[0].id;
        }
      },
      error: (err) => console.error('Failed to load trees:', err)
    });
  }

  onTreeChange(): void {
    this.scanResult.set(null);
    this.predictions.set(null);
    this.hasLoaded.set(false);
  }

  filterByConfidence(level: string): void {
    if (this.selectedConfidence === level) {
      this.selectedConfidence = null;
    } else {
      this.selectedConfidence = level;
    }
    this.currentPage = 1;
    this.loadPredictions();
  }

  /**
   * Trigger a new scan for the selected tree.
   */
  scan(): void {
    if (!this.selectedTreeId) return;

    this.scanning.set(true);
    this.hasLoaded.set(true);

    this.predictionService.scan(this.selectedTreeId).subscribe({
      next: (result) => {
        this.scanResult.set(result);
        this.scanning.set(false);
        // Auto-load predictions list
        this.loadPredictions();
      },
      error: (err) => {
        console.error('Scan failed:', err);
        this.scanning.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.predictions.scanFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  /**
   * Load existing predictions with current filters.
   */
  loadPredictions(): void {
    if (!this.selectedTreeId) return;

    this.loading.set(true);
    this.hasLoaded.set(true);

    this.predictionService.getPredictions(this.selectedTreeId, {
      status: this.selectedStatus || undefined,
      confidenceLevel: this.selectedConfidence || undefined,
      ruleId: this.selectedRule || undefined,
      page: this.currentPage,
      pageSize: this.pageSize
    }).subscribe({
      next: (result) => {
        this.predictions.set(result);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load predictions:', err);
        this.loading.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.predictions.loadFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadPredictions();
  }

  /**
   * Accept a prediction — creates the actual relationship.
   */
  acceptPrediction(prediction: PredictionDto): void {
    this.markResolving(prediction.id);

    this.predictionService.accept(prediction.id).subscribe({
      next: () => {
        this.snackBar.open(
          this.i18n.t('admin.predictions.accepted'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.removeFromResults(prediction);
      },
      error: (err) => {
        this.unmarkResolving(prediction.id);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.predictions.acceptFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  /**
   * Dismiss a prediction with an optional reason.
   */
  dismissPrediction(prediction: PredictionDto): void {
    this.markResolving(prediction.id);

    this.predictionService.dismiss(prediction.id).subscribe({
      next: () => {
        this.snackBar.open(
          this.i18n.t('admin.predictions.dismissed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.removeFromResults(prediction);
      },
      error: (err) => {
        this.unmarkResolving(prediction.id);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.predictions.dismissFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  /**
   * Bulk accept all high-confidence predictions.
   */
  bulkAcceptHigh(): void {
    if (!this.selectedTreeId) return;

    if (!confirm(this.i18n.t('admin.predictions.confirmBulkAccept'))) return;

    this.bulkAccepting.set(true);

    this.predictionService.bulkAccept(this.selectedTreeId, 85).subscribe({
      next: (count) => {
        this.bulkAccepting.set(false);
        this.snackBar.open(
          this.i18n.t('admin.predictions.bulkAccepted', { count }),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
        // Reload to reflect changes
        this.loadPredictions();
      },
      error: (err) => {
        this.bulkAccepting.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.predictions.bulkAcceptFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  /**
   * Navigate to person detail page.
   */
  navigateToPerson(personId: string): void {
    window.open(`/people/${personId}`, '_blank');
  }

  /**
   * Get display name for a person based on current language.
   */
  getDisplayName(name: string | null, nameArabic: string | null): string {
    const lang = this.i18n.currentLang();
    return getPersonDisplayName(name, nameArabic, lang);
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private markResolving(id: string): void {
    const current = new Set(this.resolvingIds());
    current.add(id);
    this.resolvingIds.set(current);
  }

  private unmarkResolving(id: string): void {
    const current = new Set(this.resolvingIds());
    current.delete(id);
    this.resolvingIds.set(current);
  }

  private removeFromResults(prediction: PredictionDto): void {
    const current = this.predictions();
    if (!current) return;

    const newItems = current.items.filter(p => p.id !== prediction.id);

    this.predictions.set({
      ...current,
      items: newItems,
      totalCount: current.totalCount - 1
    });

    // Update scan result counts if available
    const sr = this.scanResult();
    if (sr) {
      const level = getConfidenceClass(prediction.confidence);
      this.scanResult.set({
        ...sr,
        totalPredictions: sr.totalPredictions - 1,
        highConfidence: level === 'high' ? sr.highConfidence - 1 : sr.highConfidence,
        mediumConfidence: level === 'medium' ? sr.mediumConfidence - 1 : sr.mediumConfidence,
        lowConfidence: level === 'low' ? sr.lowConfidence - 1 : sr.lowConfidence
      });
    }
  }
}
