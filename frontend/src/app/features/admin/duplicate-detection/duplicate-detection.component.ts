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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DuplicateDetectionService } from '../../../core/services/duplicate-detection.service';
import { FamilyTreeService } from '../../../core/services/family-tree.service';
import { TreeContextService } from '../../../core/services/tree-context.service';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService, TranslatePipe } from '../../../core/i18n';
import { FamilyTreeListItem } from '../../../core/models/family-tree.models';
import {
  DuplicateCandidate,
  DuplicateScanResult,
  DuplicateSummaryResult,
  DuplicateSummaryItem,
  getMatchTypeLabel,
  getMatchTypeIcon,
  getConfidenceClass,
  getSexIcon,
  getLifeSpan
} from '../../../core/models/duplicate-detection.models';

@Component({
  selector: 'app-duplicate-detection',
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
    MatDialogModule,
    MatTooltipModule,
    TranslatePipe
  ],
  template: `
    <div class="duplicate-detection-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/admin" class="back-link">
            <i class="fas fa-arrow-left"></i>
          </a>
          <h1>{{ 'admin.duplicateDetection.title' | translate }}</h1>
          @if (scanResult()?.total) {
            <span class="total-badge">{{ scanResult()!.total }}</span>
          }
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar">
        <mat-select
          [(ngModel)]="selectedTreeId"
          (selectionChange)="onTreeChange()"
          placeholder="{{ 'admin.duplicateDetection.tree' | translate }}"
          class="filter-select">
          @if (isSuperAdmin()) {
            <mat-option [value]="null">
              {{ 'admin.duplicateDetection.allTrees' | translate }}
            </mat-option>
          }
          @for (tree of trees(); track tree.id) {
            <mat-option [value]="tree.id">{{ tree.name }}</mat-option>
          }
        </mat-select>

        <mat-select
          [(ngModel)]="selectedTargetTreeId"
          placeholder="{{ 'admin.duplicateDetection.compareWith' | translate }}"
          class="filter-select">
          <mat-option [value]="null">
            {{ 'admin.duplicateDetection.sameTree' | translate }}
          </mat-option>
          @for (tree of trees(); track tree.id) {
            @if (tree.id !== selectedTreeId) {
              <mat-option [value]="tree.id">{{ tree.name }}</mat-option>
            }
          }
        </mat-select>

        <mat-select
          [(ngModel)]="selectedMode"
          placeholder="{{ 'admin.duplicateDetection.detectionMode' | translate }}"
          class="filter-select">
          <mat-option value="auto">{{ 'admin.duplicateDetection.allStrategies' | translate }}</mat-option>
          <mat-option value="name_exact">{{ 'admin.duplicateDetection.exactName' | translate }}</mat-option>
          <mat-option value="name_similar">{{ 'admin.duplicateDetection.similarName' | translate }}</mat-option>
          <mat-option value="mother_surn">{{ 'admin.duplicateDetection.motherSurn' | translate }}</mat-option>
          <mat-option value="shared_parent">{{ 'admin.duplicateDetection.sharedParent' | translate }}</mat-option>
        </mat-select>

        <mat-select
          [(ngModel)]="minConfidence"
          placeholder="{{ 'admin.duplicateDetection.minConfidence' | translate }}"
          class="filter-select confidence-select">
          <mat-option [value]="50">50%+</mat-option>
          <mat-option [value]="60">60%+</mat-option>
          <mat-option [value]="70">70%+</mat-option>
          <mat-option [value]="80">80%+</mat-option>
          <mat-option [value]="90">90%+</mat-option>
        </mat-select>

        <button
          mat-raised-button
          color="primary"
          (click)="scan()"
          [disabled]="scanning() || (!selectedTreeId && !isSuperAdmin())"
          class="scan-button">
          @if (scanning()) {
            <mat-spinner diameter="20"></mat-spinner>
            {{ 'admin.duplicateDetection.scanning' | translate }}
          } @else {
            <i class="fas fa-search"></i>
            {{ 'admin.duplicateDetection.scan' | translate }}
          }
        </button>
      </div>

      <!-- Summary Cards -->
      @if (summary() && summary()!.byMatchType.length > 0) {
        <div class="summary-grid">
          @for (item of summary()!.byMatchType; track item.matchType) {
            <div
              class="summary-card"
              [class.active]="selectedMode === item.matchType"
              (click)="filterByMatchType(item.matchType)">
              <div class="summary-icon">
                <i class="fas {{ getMatchTypeIcon(item.matchType) }}"></i>
              </div>
              <div class="summary-content">
                <div class="summary-label">{{ getMatchTypeLabel(item.matchType) }}</div>
                <div class="summary-count">{{ item.candidateCount }}</div>
                <div class="summary-confidence">
                  Avg: {{ item.avgConfidence | number:'1.0-0' }}%
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Loading State -->
      @if (scanning()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>{{ 'admin.duplicateDetection.scanning' | translate }}...</p>
        </div>
      }

      <!-- Empty State -->
      @if (hasScanned() && !scanning() && (!scanResult() || scanResult()!.items.length === 0)) {
        <div class="empty-state">
          <i class="fas fa-check-circle"></i>
          <h3>{{ 'admin.duplicateDetection.noDuplicatesFound' | translate }}</h3>
          <p>{{ 'admin.duplicateDetection.readyToScan' | translate }}</p>
        </div>
      }

      <!-- Candidate Cards -->
      @if (scanResult() && scanResult()!.items.length > 0) {
        <div class="candidates-list">
          @for (candidate of scanResult()!.items; track candidate.personAId + candidate.personBId) {
            @if (!resolvingPairs().has(candidate.personAId + candidate.personBId)) {
              <div class="candidate-card" [class]="'confidence-' + getConfidenceClass(candidate.confidence)">
                <div class="card-header">
                  <span class="match-type">
                    <i class="fas {{ getMatchTypeIcon(candidate.matchType) }}"></i>
                    {{ getMatchTypeLabel(candidate.matchType) }}
                  </span>
                  <span class="confidence-badge">{{ candidate.confidence }}%</span>
                </div>

                <div class="persons-comparison">
                  <!-- Person A -->
                  <div class="person-card">
                    <div class="person-header">
                      <i class="fas {{ getSexIcon(candidate.personASex) }}"></i>
                      <span class="person-name">{{ candidate.personAName || candidate.personANameArabic || 'Unknown' }}</span>
                    </div>
                    @if (candidate.personANameEnglish && candidate.personANameEnglish !== candidate.personAName) {
                      <div class="person-alt-name">{{ candidate.personANameEnglish }}</div>
                    }
                    <div class="person-details">
                      <span class="lifespan">{{ getLifeSpan(candidate.personABirthDate, candidate.personADeathDate) }}</span>
                      @if (candidate.personAOrgName) {
                        <span class="tree-name">{{ candidate.personAOrgName }}</span>
                      }
                    </div>
                    @if (candidate.surnameA) {
                      <div class="surname-info">
                        <small>{{ 'admin.duplicateDetection.surnameA' | translate }}: {{ candidate.surnameA }}</small>
                      </div>
                    }
                  </div>

                  <div class="comparison-divider">
                    <i class="fas fa-exchange-alt"></i>
                  </div>

                  <!-- Person B -->
                  <div class="person-card">
                    <div class="person-header">
                      <i class="fas {{ getSexIcon(candidate.personBSex) }}"></i>
                      <span class="person-name">{{ candidate.personBName || candidate.personBNameArabic || 'Unknown' }}</span>
                    </div>
                    @if (candidate.personBNameEnglish && candidate.personBNameEnglish !== candidate.personBName) {
                      <div class="person-alt-name">{{ candidate.personBNameEnglish }}</div>
                    }
                    <div class="person-details">
                      <span class="lifespan">{{ getLifeSpan(candidate.personBBirthDate, candidate.personBDeathDate) }}</span>
                      @if (candidate.personBOrgName) {
                        <span class="tree-name">{{ candidate.personBOrgName }}</span>
                      }
                    </div>
                    @if (candidate.surnameB) {
                      <div class="surname-info">
                        <small>{{ 'admin.duplicateDetection.surnameB' | translate }}: {{ candidate.surnameB }}</small>
                      </div>
                    }
                  </div>
                </div>

                <!-- Evidence -->
                @if (candidate.sharedParentCount > 0) {
                  <div class="evidence-info">
                    <i class="fas fa-users"></i>
                    {{ 'admin.duplicateDetection.sharedParents' | translate }}: {{ candidate.sharedParentCount }}
                  </div>
                }

                <!-- Actions -->
                <div class="card-actions">
                  <button
                    mat-button
                    color="warn"
                    (click)="rejectPair(candidate)"
                    matTooltip="Not the same person">
                    <i class="fas fa-times"></i> Reject
                  </button>
                  <button
                    mat-button
                    color="accent"
                    (click)="approvePair(candidate)"
                    matTooltip="Mark as same person (keep both records)">
                    <i class="fas fa-link"></i> Link
                  </button>
                  <button
                    mat-raised-button
                    color="primary"
                    (click)="mergePair(candidate)"
                    matTooltip="Merge into one record">
                    <i class="fas fa-object-group"></i> Merge
                  </button>
                </div>
              </div>
            }
          }
        </div>

        <!-- Paginator -->
        @if (scanResult()!.total > pageSize) {
          <mat-paginator
            [length]="scanResult()!.total"
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
    .duplicate-detection-container {
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
      min-width: 180px;
    }

    .confidence-select {
      min-width: 100px;
    }

    .scan-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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

    .summary-icon {
      font-size: 1.5rem;
      color: #C17E3E;
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

    .summary-confidence {
      font-size: 0.8rem;
      color: #888;
    }

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

    .candidates-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .candidate-card {
      background: white;
      border: 2px solid #F4E4D7;
      border-radius: 8px;
      padding: 1rem;
    }

    .candidate-card.confidence-high {
      border-left: 4px solid #28a745;
    }

    .candidate-card.confidence-medium {
      border-left: 4px solid #ffc107;
    }

    .candidate-card.confidence-low {
      border-left: 4px solid #dc3545;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .match-type {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #C17E3E;
      font-weight: 500;
    }

    .confidence-badge {
      background: #187573;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }

    .persons-comparison {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .person-card {
      flex: 1;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }

    .person-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .person-name {
      font-weight: 600;
      color: #333;
    }

    .person-alt-name {
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 0.25rem;
    }

    .person-details {
      display: flex;
      gap: 1rem;
      font-size: 0.85rem;
      color: #666;
    }

    .surname-info {
      margin-top: 0.5rem;
      color: #888;
    }

    .comparison-divider {
      display: flex;
      align-items: center;
      color: #ccc;
      font-size: 1.5rem;
    }

    .evidence-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #f0f9f9;
      border-radius: 4px;
      color: #187573;
      margin-bottom: 1rem;
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    @media (max-width: 768px) {
      .persons-comparison {
        flex-direction: column;
      }

      .comparison-divider {
        transform: rotate(90deg);
        padding: 0.5rem 0;
      }

      .filter-bar {
        flex-direction: column;
      }

      .filter-select {
        width: 100%;
      }
    }
  `]
})
export class DuplicateDetectionComponent implements OnInit {
  private readonly duplicateService = inject(DuplicateDetectionService);
  private readonly treeService = inject(FamilyTreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly i18n = inject(I18nService);

  // Signals
  trees = signal<FamilyTreeListItem[]>([]);
  scanning = signal(false);
  hasScanned = signal(false);
  scanResult = signal<DuplicateScanResult | null>(null);
  summary = signal<DuplicateSummaryResult | null>(null);
  resolvingPairs = signal<Set<string>>(new Set());

  // Filters
  selectedTreeId: string | null = null;
  selectedTargetTreeId: string | null = null;
  selectedMode = 'auto';
  minConfidence = 50;
  currentPage = 1;
  pageSize = 25;

  // Computed
  isSuperAdmin = computed(() => {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin';
  });

  // Expose helpers to template
  getMatchTypeLabel = getMatchTypeLabel;
  getMatchTypeIcon = getMatchTypeIcon;
  getConfidenceClass = getConfidenceClass;
  getSexIcon = getSexIcon;
  getLifeSpan = getLifeSpan;

  ngOnInit(): void {
    this.loadTrees();
  }

  private loadTrees(): void {
    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.trees.set(trees);
        // Auto-select first tree for non-SuperAdmin
        if (!this.isSuperAdmin() && trees.length > 0) {
          this.selectedTreeId = trees[0].id;
        }
      },
      error: (err) => console.error('Failed to load trees:', err)
    });
  }

  onTreeChange(): void {
    this.selectedTargetTreeId = null;
    this.scanResult.set(null);
    this.summary.set(null);
    this.hasScanned.set(false);
  }

  filterByMatchType(matchType: string): void {
    if (this.selectedMode === matchType) {
      this.selectedMode = 'auto';
    } else {
      this.selectedMode = matchType;
    }
    this.currentPage = 1;
    this.scan();
  }

  scan(): void {
    this.scanning.set(true);
    this.hasScanned.set(true);

    this.duplicateService.scan({
      treeId: this.selectedTreeId || undefined,
      targetTreeId: this.selectedTargetTreeId || undefined,
      mode: this.selectedMode,
      minConfidence: this.minConfidence,
      page: this.currentPage,
      pageSize: this.pageSize
    }).subscribe({
      next: (result) => {
        this.scanResult.set(result);
        this.scanning.set(false);
        this.loadSummary();
      },
      error: (err) => {
        console.error('Scan failed:', err);
        this.scanning.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.duplicateDetection.scanFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  private loadSummary(): void {
    this.duplicateService.getSummary(
      this.selectedTreeId || undefined,
      this.selectedTargetTreeId || undefined,
      'auto',
      this.minConfidence
    ).subscribe({
      next: (result) => this.summary.set(result),
      error: (err) => console.error('Failed to load summary:', err)
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.scan();
  }

  approvePair(candidate: DuplicateCandidate): void {
    const key = candidate.personAId + candidate.personBId;
    this.markResolving(key);

    this.duplicateService.approveLink(candidate.personAId, candidate.personBId).subscribe({
      next: () => {
        this.snackBar.open(
          this.i18n.t('admin.duplicateDetection.linked'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.removeFromResults(candidate);
      },
      error: (err) => {
        this.unmarkResolving(key);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.duplicateDetection.resolveFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  rejectPair(candidate: DuplicateCandidate): void {
    const key = candidate.personAId + candidate.personBId;
    this.markResolving(key);

    this.duplicateService.reject(candidate.personAId, candidate.personBId).subscribe({
      next: () => {
        this.snackBar.open(
          this.i18n.t('admin.duplicateDetection.rejected'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.removeFromResults(candidate);
      },
      error: (err) => {
        this.unmarkResolving(key);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.duplicateDetection.resolveFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  mergePair(candidate: DuplicateCandidate): void {
    const personAName = candidate.personAName || candidate.personANameArabic || 'Person A';
    const personBName = candidate.personBName || candidate.personBNameArabic || 'Person B';

    // Simple confirm dialog - ask which to keep
    const keepA = confirm(
      `${this.i18n.t('admin.duplicateDetection.mergeConfirm')}\n\n` +
      `Keep "${personAName}" and merge "${personBName}" into it?\n\n` +
      `Click OK to keep ${personAName}, Cancel to keep ${personBName}`
    );

    const keepPersonId = keepA ? candidate.personAId : candidate.personBId;
    const key = candidate.personAId + candidate.personBId;
    this.markResolving(key);

    this.duplicateService.merge(
      candidate.personAId,
      candidate.personBId,
      keepPersonId
    ).subscribe({
      next: () => {
        this.snackBar.open(
          this.i18n.t('admin.duplicateDetection.merged'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.removeFromResults(candidate);
      },
      error: (err) => {
        this.unmarkResolving(key);
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.duplicateDetection.resolveFailed'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  private markResolving(key: string): void {
    const current = new Set(this.resolvingPairs());
    current.add(key);
    this.resolvingPairs.set(current);
  }

  private unmarkResolving(key: string): void {
    const current = new Set(this.resolvingPairs());
    current.delete(key);
    this.resolvingPairs.set(current);
  }

  private removeFromResults(candidate: DuplicateCandidate): void {
    const current = this.scanResult();
    if (!current) return;

    const newItems = current.items.filter(
      c => !(c.personAId === candidate.personAId && c.personBId === candidate.personBId)
    );

    this.scanResult.set({
      ...current,
      items: newItems,
      total: current.total - 1
    });

    // Update summary
    this.loadSummary();
  }
}
