import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { FamilyTreeDetail, RecentPerson } from '../../core/models/family-tree.models';

@Component({
  selector: 'app-tree-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="tree-detail-container">
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
          <button class="btn btn-primary" (click)="loadTreeDetails()">
            {{ i18n.t('common.retry') }}
          </button>
        </div>
      }

      <!-- Content -->
      @if (!loading() && !error() && treeDetail()) {
        <div class="detail-content">
          <!-- Breadcrumb & Header -->
          <header class="tree-header">
            <div class="breadcrumb">
              <a routerLink="/towns">{{ i18n.t('towns.title') }}</a>
              <span class="separator">/</span>
              <a [routerLink]="['/towns', townId, 'overview']">{{ treeDetail()!.townName }}</a>
              <span class="separator">/</span>
              <span>{{ treeDetail()!.name }}</span>
            </div>

            <div class="header-content">
              @if (treeDetail()!.coverImageUrl) {
                <img [src]="treeDetail()!.coverImageUrl" [alt]="treeDetail()!.name" class="tree-cover-image">
              }
              <div class="header-info">
                <h1>{{ treeDetail()!.name }}</h1>
                @if (treeDetail()!.description) {
                  <p class="description">{{ treeDetail()!.description }}</p>
                }
                <div class="meta-info">
                  @if (treeDetail()!.ownerName) {
                    <span class="meta-item">
                      <span class="meta-icon">👤</span>
                      {{ i18n.t('tree.owner') }}: {{ treeDetail()!.ownerName }}
                    </span>
                  }
                  <span class="meta-item">
                    <span class="meta-icon">📅</span>
                    {{ i18n.t('common.created') }}: {{ formatDate(treeDetail()!.createdAt) }}
                  </span>
                  @if (treeDetail()!.isPublic) {
                    <span class="badge badge-public">{{ i18n.t('tree.public') }}</span>
                  } @else {
                    <span class="badge badge-private">{{ i18n.t('tree.private') }}</span>
                  }
                </div>
              </div>
            </div>

            <div class="header-actions">
              <button class="btn btn-primary" (click)="viewTree()">
                {{ i18n.t('tree.viewTree') }}
              </button>
              <button class="btn btn-secondary" (click)="viewPeople()">
                {{ i18n.t('tree.viewPeople') }}
              </button>
            </div>
          </header>

          <!-- Statistics Grid -->
          <section class="statistics-section">
            <h2>{{ i18n.t('tree.statistics') }}</h2>
            <div class="stats-grid">
              <!-- People Stats -->
              <div class="stat-card stat-large">
                <div class="stat-header">{{ i18n.t('tree.people') }}</div>
                <div class="stat-value">{{ treeDetail()!.statistics.totalPeople }}</div>
                <div class="stat-breakdown">
                  <span class="male">♂ {{ treeDetail()!.statistics.maleCount }}</span>
                  <span class="female">♀ {{ treeDetail()!.statistics.femaleCount }}</span>
                  @if (treeDetail()!.statistics.unknownGenderCount > 0) {
                    <span class="unknown">? {{ treeDetail()!.statistics.unknownGenderCount }}</span>
                  }
                </div>
              </div>

              <!-- Living/Deceased -->
              <div class="stat-card">
                <div class="stat-header">{{ i18n.t('tree.living') }}</div>
                <div class="stat-value">{{ treeDetail()!.statistics.livingCount }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-header">{{ i18n.t('tree.deceased') }}</div>
                <div class="stat-value">{{ treeDetail()!.statistics.deceasedCount }}</div>
              </div>

              <!-- Families & Relationships -->
              <div class="stat-card">
                <div class="stat-header">{{ i18n.t('tree.families') }}</div>
                <div class="stat-value">{{ treeDetail()!.statistics.familiesCount }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-header">{{ i18n.t('tree.relationships') }}</div>
                <div class="stat-value">{{ treeDetail()!.statistics.relationshipsCount }}</div>
              </div>

              <!-- Media -->
              <div class="stat-card">
                <div class="stat-header">{{ i18n.t('tree.mediaFiles') }}</div>
                <div class="stat-value">{{ treeDetail()!.statistics.mediaFilesCount }}</div>
                <div class="stat-breakdown">
                  <span>📷 {{ treeDetail()!.statistics.photosCount }}</span>
                  <span>📄 {{ treeDetail()!.statistics.documentsCount }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Notable People -->
          @if (treeDetail()!.statistics.oldestPerson || treeDetail()!.statistics.youngestPerson) {
            <section class="notable-section">
              <h2>{{ i18n.t('tree.notablePeople') }}</h2>
              <div class="notable-grid">
                @if (treeDetail()!.statistics.oldestPerson) {
                  <div class="notable-card" (click)="viewPerson(treeDetail()!.statistics.oldestPerson!)">
                    <div class="notable-label">{{ i18n.t('tree.oldest') }}</div>
                    <div class="person-info">
                      @if (treeDetail()!.statistics.oldestPerson!.avatarUrl) {
                        <img [src]="treeDetail()!.statistics.oldestPerson!.avatarUrl" class="person-avatar">
                      } @else {
                        <div class="person-avatar-placeholder">
                          {{ getPersonInitial(treeDetail()!.statistics.oldestPerson!) }}
                        </div>
                      }
                      <div class="person-details">
                        <span class="person-name">{{ getPersonDisplayName(treeDetail()!.statistics.oldestPerson!) }}</span>
                        <span class="person-dates">
                          {{ treeDetail()!.statistics.oldestPerson!.birthDate || '?' }}
                          @if (treeDetail()!.statistics.oldestPerson!.deathDate) {
                            - {{ treeDetail()!.statistics.oldestPerson!.deathDate }}
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                }
                @if (treeDetail()!.statistics.youngestPerson) {
                  <div class="notable-card" (click)="viewPerson(treeDetail()!.statistics.youngestPerson!)">
                    <div class="notable-label">{{ i18n.t('tree.youngest') }}</div>
                    <div class="person-info">
                      @if (treeDetail()!.statistics.youngestPerson!.avatarUrl) {
                        <img [src]="treeDetail()!.statistics.youngestPerson!.avatarUrl" class="person-avatar">
                      } @else {
                        <div class="person-avatar-placeholder">
                          {{ getPersonInitial(treeDetail()!.statistics.youngestPerson!) }}
                        </div>
                      }
                      <div class="person-details">
                        <span class="person-name">{{ getPersonDisplayName(treeDetail()!.statistics.youngestPerson!) }}</span>
                        <span class="person-dates">
                          {{ treeDetail()!.statistics.youngestPerson!.birthDate || '?' }}
                          @if (treeDetail()!.statistics.youngestPerson!.deathDate) {
                            - {{ treeDetail()!.statistics.youngestPerson!.deathDate }}
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Recent Activity -->
          <section class="activity-section">
            <div class="activity-columns">
              <!-- Recently Added -->
              @if (treeDetail()!.recentlyAddedPeople.length > 0) {
                <div class="activity-column">
                  <h3>{{ i18n.t('tree.recentlyAdded') }}</h3>
                  <div class="activity-list">
                    @for (person of treeDetail()!.recentlyAddedPeople; track person.id) {
                      <div class="activity-item" (click)="viewPerson(person)">
                        @if (person.avatarUrl) {
                          <img [src]="person.avatarUrl" class="activity-avatar">
                        } @else {
                          <div class="activity-avatar-placeholder">
                            {{ getPersonInitial(person) }}
                          </div>
                        }
                        <div class="activity-info">
                          <span class="activity-name">{{ getPersonDisplayName(person) }}</span>
                          <span class="activity-date">{{ formatDate(person.activityDate) }}</span>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Recently Updated -->
              @if (treeDetail()!.recentlyUpdatedPeople.length > 0) {
                <div class="activity-column">
                  <h3>{{ i18n.t('tree.recentlyUpdated') }}</h3>
                  <div class="activity-list">
                    @for (person of treeDetail()!.recentlyUpdatedPeople; track person.id) {
                      <div class="activity-item" (click)="viewPerson(person)">
                        @if (person.avatarUrl) {
                          <img [src]="person.avatarUrl" class="activity-avatar">
                        } @else {
                          <div class="activity-avatar-placeholder">
                            {{ getPersonInitial(person) }}
                          </div>
                        }
                        <div class="activity-info">
                          <span class="activity-name">{{ getPersonDisplayName(person) }}</span>
                          <span class="activity-date">{{ formatDate(person.activityDate) }}</span>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .tree-detail-container {
      padding: 1.5rem;
      max-width: 1200px;
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
    }

    .tree-header {
      margin-bottom: 2rem;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
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

    .header-content {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }

    .tree-cover-image {
      width: 200px;
      height: 150px;
      object-fit: cover;
      border-radius: 0.5rem;
    }

    .header-info {
      flex: 1;
    }

    .header-info h1 {
      font-size: 1.75rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.5rem 0;
    }

    .description {
      color: #6b7280;
      margin: 0 0 1rem 0;
    }

    .meta-info {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .badge {
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 9999px;
    }

    .badge-public {
      background: #dcfce7;
      color: #166534;
    }

    .badge-private {
      background: #fef3c7;
      color: #92400e;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .statistics-section, .notable-section, .activity-section {
      margin-bottom: 2rem;
    }

    h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 1rem;
    }

    h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.75rem;
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

    .stat-large {
      grid-column: span 2;
    }

    .stat-header {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #3b82f6;
    }

    .stat-breakdown {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 0.5rem;
      font-size: 0.875rem;
    }

    .stat-breakdown .male { color: #3b82f6; }
    .stat-breakdown .female { color: #ec4899; }
    .stat-breakdown .unknown { color: #6b7280; }

    .notable-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
    }

    .notable-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .notable-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .notable-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: #3b82f6;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .person-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .person-avatar, .activity-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
    }

    .person-avatar-placeholder, .activity-avatar-placeholder {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
    }

    .person-details, .activity-info {
      display: flex;
      flex-direction: column;
    }

    .person-name, .activity-name {
      font-weight: 500;
      color: #111827;
    }

    .person-dates, .activity-date {
      font-size: 0.8125rem;
      color: #6b7280;
    }

    .activity-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
    }

    .activity-column {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem;
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .activity-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .activity-item:hover {
      background: #f9fafb;
    }

    .activity-avatar, .activity-avatar-placeholder {
      width: 40px;
      height: 40px;
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
      .tree-detail-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
      }

      .tree-cover-image {
        width: 100%;
        height: 200px;
      }

      .stat-large {
        grid-column: span 1;
      }
    }
  `]
})
export class TreeDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private familyTreeService = inject(FamilyTreeService);
  private authService = inject(AuthService);
  i18n = inject(I18nService);

  treeDetail = signal<FamilyTreeDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  townId: string | null = null;
  private treeId: string | null = null;

  ngOnInit() {
    this.townId = this.route.snapshot.paramMap.get('townId');
    this.treeId = this.route.snapshot.paramMap.get('treeId');

    if (this.treeId) {
      this.loadTreeDetails();
    } else {
      this.error.set(this.i18n.t('tree.invalidTreeId'));
      this.loading.set(false);
    }
  }

  loadTreeDetails() {
    if (!this.treeId) return;

    this.loading.set(true);
    this.error.set(null);

    this.familyTreeService.getTreeDetails(this.treeId).subscribe({
      next: (detail) => {
        this.treeDetail.set(detail);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('tree.failedLoadDetails'));
        this.loading.set(false);
      }
    });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  }

  getPersonDisplayName(person: RecentPerson): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && person.nameArabic) {
      return person.nameArabic;
    }
    if (lang === 'en' && person.nameEnglish) {
      return person.nameEnglish;
    }
    return person.primaryName || 'Unknown';
  }

  getPersonInitial(person: RecentPerson): string {
    const name = this.getPersonDisplayName(person);
    return name.charAt(0).toUpperCase();
  }

  viewTree() {
    if (this.treeId) {
      this.router.navigate(['/tree', this.treeId]);
    }
  }

  viewPeople() {
    if (this.treeId) {
      this.router.navigate(['/people'], { queryParams: { treeId: this.treeId } });
    }
  }

  viewPerson(person: RecentPerson) {
    if (person.id) {
      this.router.navigate(['/people', person.id]);
    }
  }
}
