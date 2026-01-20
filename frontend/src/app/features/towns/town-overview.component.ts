import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { TownService } from '../../core/services/town.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TownStatistics, FamilyTreeSummary } from '../../core/models/town.models';

@Component({
  selector: 'app-town-overview',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="town-overview-container">
      <!-- Loading State -->
      @if (loading()) {
        <div class="loading-container">
          <div class="spinner"></div>
          <p>{{ i18n.t('common.loading') }}</p>
        </div>
      }

      <!-- Error State -->
      @if (error()) {
        <div class="error-container">
          <p class="error-message">{{ error() }}</p>
          <button class="btn btn-primary" (click)="loadStatistics()">
            {{ i18n.t('common.retry') }}
          </button>
        </div>
      }

      <!-- Content -->
      @if (!loading() && !error() && statistics()) {
        <div class="overview-content">
          <!-- Town Header -->
          <header class="town-header">
            <div class="breadcrumb">
              <a routerLink="/towns">{{ i18n.t('towns.title') }}</a>
              <span class="separator">/</span>
              <span>{{ getTownDisplayName() }}</span>
            </div>
            <h1>{{ getTownDisplayName() }}</h1>
            @if (statistics()!.townNameEn && statistics()!.townNameAr) {
              <p class="town-names">
                <span class="name-en">{{ statistics()!.townNameEn }}</span>
                <span class="separator">|</span>
                <span class="name-ar" dir="rtl">{{ statistics()!.townNameAr }}</span>
              </p>
            }
          </header>

          <!-- Statistics Cards -->
          <section class="statistics-section">
            <h2>{{ i18n.t('towns.statistics') }}</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value">{{ statistics()!.totalFamilyTrees }}</div>
                <div class="stat-label">{{ i18n.t('towns.familyTrees') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">{{ statistics()!.totalPeople }}</div>
                <div class="stat-label">{{ i18n.t('towns.people') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">{{ statistics()!.totalFamilies }}</div>
                <div class="stat-label">{{ i18n.t('towns.families') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">{{ statistics()!.totalRelationships }}</div>
                <div class="stat-label">{{ i18n.t('towns.relationships') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">{{ statistics()!.totalMediaFiles }}</div>
                <div class="stat-label">{{ i18n.t('towns.mediaFiles') }}</div>
              </div>
            </div>
          </section>

          <!-- Family Trees List -->
          <section class="trees-section">
            <h2>{{ i18n.t('towns.familyTreesInTown') }}</h2>

            @if (statistics()!.familyTrees.length === 0) {
              <div class="empty-state">
                <p>{{ i18n.t('towns.noTreesInTown') }}</p>
              </div>
            } @else {
              <div class="trees-grid">
                @for (tree of statistics()!.familyTrees; track tree.id) {
                  <div class="tree-card" (click)="navigateToTree(tree.id)">
                    <div class="tree-header">
                      @if (tree.coverImageUrl) {
                        <img [src]="tree.coverImageUrl" [alt]="tree.name" class="tree-cover">
                      } @else {
                        <div class="tree-cover-placeholder">
                          <span class="tree-initial">{{ tree.name.charAt(0) }}</span>
                        </div>
                      }
                    </div>
                    <div class="tree-body">
                      <h3 class="tree-name">{{ tree.name }}</h3>
                      @if (tree.description) {
                        <p class="tree-description">{{ tree.description }}</p>
                      }
                      <div class="tree-stats">
                        <div class="tree-stat">
                          <span class="stat-icon">👤</span>
                          <span>{{ tree.peopleCount }} {{ i18n.t('common.people') }}</span>
                        </div>
                        <div class="tree-stat gender-breakdown">
                          <span class="male">♂ {{ tree.maleCount }}</span>
                          <span class="female">♀ {{ tree.femaleCount }}</span>
                        </div>
                        <div class="tree-stat">
                          <span class="stat-icon">👨‍👩‍👦</span>
                          <span>{{ tree.familiesCount }} {{ i18n.t('common.families') }}</span>
                        </div>
                        <div class="tree-stat">
                          <span class="stat-icon">📷</span>
                          <span>{{ tree.mediaFilesCount }} {{ i18n.t('common.media') }}</span>
                        </div>
                      </div>
                      <div class="tree-meta">
                        <span class="created-date">
                          {{ i18n.t('common.created') }}: {{ formatDate(tree.createdAt) }}
                        </span>
                      </div>
                    </div>
                    <div class="tree-actions">
                      <button class="btn btn-primary btn-sm" (click)="navigateToTreeDetails(tree.id, $event)">
                        {{ i18n.t('common.viewDetails') }}
                      </button>
                      <button class="btn btn-secondary btn-sm" (click)="navigateToTree(tree.id, $event)">
                        {{ i18n.t('common.viewTree') }}
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .town-overview-container {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .loading-container, .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: 1rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #dc2626;
      text-align: center;
    }

    .town-header {
      margin-bottom: 2rem;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .breadcrumb a {
      color: #3b82f6;
      text-decoration: none;
    }

    .breadcrumb a:hover {
      text-decoration: underline;
    }

    .breadcrumb .separator {
      color: #9ca3af;
    }

    .town-header h1 {
      font-size: 2rem;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }

    .town-names {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.5rem;
      color: #6b7280;
    }

    .statistics-section {
      margin-bottom: 2.5rem;
    }

    .statistics-section h2, .trees-section h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 1rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }

    .stat-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1.25rem;
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #3b82f6;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      background: #f9fafb;
      border-radius: 0.5rem;
      color: #6b7280;
    }

    .trees-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }

    .tree-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }

    .tree-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .tree-header {
      height: 120px;
      overflow: hidden;
    }

    .tree-cover {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .tree-cover-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    }

    .tree-initial {
      font-size: 3rem;
      font-weight: 700;
      color: white;
    }

    .tree-body {
      padding: 1rem;
    }

    .tree-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.5rem 0;
    }

    .tree-description {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0 0 1rem 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .tree-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      font-size: 0.875rem;
      color: #374151;
    }

    .tree-stat {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .stat-icon {
      font-size: 1rem;
    }

    .gender-breakdown {
      gap: 0.5rem;
    }

    .gender-breakdown .male {
      color: #3b82f6;
    }

    .gender-breakdown .female {
      color: #ec4899;
    }

    .tree-meta {
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: #9ca3af;
    }

    .tree-actions {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background-color 0.2s;
      border: none;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #d1d5db;
    }

    @media (max-width: 768px) {
      .town-overview-container {
        padding: 1rem;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .trees-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TownOverviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private townService = inject(TownService);
  private authService = inject(AuthService);
  i18n = inject(I18nService);

  statistics = signal<TownStatistics | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  private townId: string | null = null;

  ngOnInit() {
    this.townId = this.route.snapshot.paramMap.get('townId');
    if (this.townId) {
      this.loadStatistics();
    } else {
      this.error.set(this.i18n.t('towns.invalidTownId'));
      this.loading.set(false);
    }
  }

  loadStatistics() {
    if (!this.townId) return;

    this.loading.set(true);
    this.error.set(null);

    this.townService.getTownStatistics(this.townId).subscribe({
      next: (stats) => {
        this.statistics.set(stats);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('towns.failedLoadStatistics'));
        this.loading.set(false);
      }
    });
  }

  getTownDisplayName(): string {
    const stats = this.statistics();
    if (!stats) return '';

    const lang = this.i18n.currentLang();
    if (lang === 'ar' && stats.townNameAr) {
      return stats.townNameAr;
    }
    if (lang === 'en' && stats.townNameEn) {
      return stats.townNameEn;
    }
    return stats.townName;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  }

  navigateToTree(treeId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.router.navigate(['/tree', treeId]);
  }

  navigateToTreeDetails(treeId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.router.navigate(['/towns', this.townId, 'trees', treeId]);
  }
}
