import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { FamilyTreeService } from '../../core/services/family-tree.service';
import { PersonMediaService } from '../../core/services/person-media.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { PersonListItem, FamilyTreeDetail } from '../../core/models/family-tree.models';

@Component({
  selector: 'app-tree-people-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="tree-people-container">
      <!-- Loading State -->
      @if (loading() && people().length === 0) {
        <div class="loading-container">
          <div class="spinner"></div>
          <p>{{ i18n.t('common.loading') }}</p>
        </div>
      }

      <!-- Error State -->
      @if (error()) {
        <div class="error-container">
          <p class="error-message">{{ error() }}</p>
          <button class="btn btn-primary" (click)="loadPeople()">
            {{ i18n.t('common.retry') }}
          </button>
        </div>
      }

      <!-- Content -->
      @if (!error()) {
        <div class="content">
          <!-- Header -->
          <header class="page-header">
            <div class="breadcrumb">
              <a routerLink="/towns">{{ i18n.t('towns.title') }}</a>
              <span class="separator">/</span>
              @if (treeDetail()) {
                <a [routerLink]="['/towns', townId, 'overview']">{{ treeDetail()!.townName }}</a>
                <span class="separator">/</span>
                <a [routerLink]="['/towns', townId, 'trees', treeId]">{{ treeDetail()!.name }}</a>
                <span class="separator">/</span>
              }
              <span>{{ i18n.t('tree.people') }}</span>
            </div>
            <h1>{{ i18n.t('tree.peopleInTree') }}</h1>
            @if (treeDetail()) {
              <p class="subtitle">{{ treeDetail()!.name }} - {{ totalCount() }} {{ i18n.t('common.people') }}</p>
            }
          </header>

          <!-- Toolbar -->
          <div class="toolbar">
            <div class="search-box">
              <input
                type="text"
                [placeholder]="i18n.t('common.search')"
                [(ngModel)]="searchQuery"
                (ngModelChange)="onSearchChange($event)"
                class="search-input"
              >
              @if (searchQuery) {
                <button class="clear-search" (click)="clearSearch()">×</button>
              }
            </div>

            <div class="filters">
              <select [(ngModel)]="sexFilter" (ngModelChange)="onFilterChange()" class="filter-select">
                <option value="">{{ i18n.t('filter.allGenders') }}</option>
                <option value="Male">{{ i18n.t('common.male') }}</option>
                <option value="Female">{{ i18n.t('common.female') }}</option>
              </select>

              <select [(ngModel)]="statusFilter" (ngModelChange)="onFilterChange()" class="filter-select">
                <option value="">{{ i18n.t('filter.allStatus') }}</option>
                <option value="living">{{ i18n.t('filter.living') }}</option>
                <option value="deceased">{{ i18n.t('filter.deceased') }}</option>
              </select>

              <select [(ngModel)]="sortBy" (ngModelChange)="onFilterChange()" class="filter-select">
                <option value="name">{{ i18n.t('sort.byName') }}</option>
                <option value="birthDate">{{ i18n.t('sort.byBirthDate') }}</option>
                <option value="createdAt">{{ i18n.t('sort.byDateAdded') }}</option>
              </select>
            </div>

            @if (isUserRole()) {
              <button class="btn btn-primary" (click)="suggestPerson()">
                {{ i18n.t('suggestion.suggestPerson') }}
              </button>
            }
          </div>

          <!-- People Grid -->
          @if (people().length > 0) {
            <div class="people-grid">
              @for (person of people(); track person.id) {
                <div class="person-card" (click)="viewPerson(person)">
                  <div class="person-avatar" [class.male]="person.sex === 'Male'" [class.female]="person.sex === 'Female'">
                    @if (getAvatarUrl(person.id)) {
                      <img [src]="getAvatarUrl(person.id)" [alt]="getPersonName(person)" class="avatar-image">
                    } @else {
                      <span class="avatar-initials">{{ getInitials(person) }}</span>
                    }
                  </div>
                  <div class="person-info">
                    <h3 class="person-name">{{ getPersonName(person) }}</h3>
                    @if (hasSecondaryName(person)) {
                      <p class="secondary-name">{{ getSecondaryName(person) }}</p>
                    }
                    <div class="person-dates">
                      @if (person.birthDate) {
                        <span class="birth">{{ formatDate(person.birthDate) }}</span>
                      }
                      @if (person.birthDate && person.deathDate) {
                        <span class="separator">-</span>
                      }
                      @if (person.deathDate) {
                        <span class="death">{{ formatDate(person.deathDate) }}</span>
                      }
                      @if (!person.deathDate && person.birthDate) {
                        <span class="living-badge">{{ i18n.t('common.living') }}</span>
                      }
                    </div>
                    <div class="person-stats">
                      @if (person.relationshipsCount > 0) {
                        <span class="stat" title="{{ i18n.t('common.relationships') }}">
                          🔗 {{ person.relationshipsCount }}
                        </span>
                      }
                      @if (person.mediaCount > 0) {
                        <span class="stat" title="{{ i18n.t('common.media') }}">
                          📷 {{ person.mediaCount }}
                        </span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          }

          <!-- Empty State -->
          @if (!loading() && people().length === 0) {
            <div class="empty-state">
              <p>{{ i18n.t('people.noResults') }}</p>
              @if (searchQuery || sexFilter || statusFilter) {
                <button class="btn btn-secondary" (click)="clearFilters()">
                  {{ i18n.t('filter.clearFilters') }}
                </button>
              }
            </div>
          }

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="pagination">
              <button
                class="btn btn-secondary"
                [disabled]="currentPage() === 1"
                (click)="goToPage(currentPage() - 1)">
                {{ i18n.t('common.previous') }}
              </button>
              <span class="page-info">
                {{ i18n.t('common.page') }} {{ currentPage() }} {{ i18n.t('common.of') }} {{ totalPages() }}
              </span>
              <button
                class="btn btn-secondary"
                [disabled]="currentPage() === totalPages()"
                (click)="goToPage(currentPage() + 1)">
                {{ i18n.t('common.next') }}
              </button>
            </div>
          }

          <!-- Loading More Indicator -->
          @if (loading() && people().length > 0) {
            <div class="loading-more">
              <div class="spinner-small"></div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tree-people-container {
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

    .spinner-small {
      width: 24px;
      height: 24px;
      border: 2px solid #e5e7eb;
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

    .page-header {
      margin-bottom: 1.5rem;
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

    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.5rem 0;
    }

    .subtitle {
      color: #6b7280;
      margin: 0;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: white;
      border-radius: 0.5rem;
      border: 1px solid #e5e7eb;
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 200px;
    }

    .search-input {
      width: 100%;
      padding: 0.5rem 2rem 0.5rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    .search-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .clear-search {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #9ca3af;
      cursor: pointer;
    }

    .filters {
      display: flex;
      gap: 0.5rem;
    }

    .filter-select {
      padding: 0.5rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      background: white;
    }

    .people-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .person-card {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .person-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .person-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: #e5e7eb;
      overflow: hidden;
    }

    .person-avatar.male {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    }

    .person-avatar.female {
      background: linear-gradient(135deg, #ec4899, #be185d);
    }

    .avatar-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initials {
      font-size: 1.25rem;
      font-weight: 600;
      color: white;
    }

    .person-info {
      flex: 1;
      min-width: 0;
    }

    .person-name {
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.25rem 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .secondary-name {
      font-size: 0.75rem;
      color: #6b7280;
      margin: 0 0 0.25rem 0;
    }

    .person-dates {
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
    }

    .person-dates .separator {
      margin: 0 0.25rem;
    }

    .living-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      background: #dcfce7;
      color: #166534;
      border-radius: 9999px;
      font-size: 0.625rem;
      margin-left: 0.5rem;
    }

    .person-stats {
      display: flex;
      gap: 0.75rem;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      background: #f9fafb;
      border-radius: 0.5rem;
      color: #6b7280;
    }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-top: 2rem;
    }

    .page-info {
      color: #6b7280;
      font-size: 0.875rem;
    }

    .loading-more {
      display: flex;
      justify-content: center;
      padding: 1rem;
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

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #d1d5db;
    }

    @media (max-width: 768px) {
      .tree-people-container {
        padding: 1rem;
      }

      .toolbar {
        flex-direction: column;
        align-items: stretch;
      }

      .search-box {
        min-width: 100%;
      }

      .filters {
        flex-wrap: wrap;
      }

      .people-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TreePeopleListComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly treeService = inject(FamilyTreeService);
  private readonly mediaService = inject(PersonMediaService);
  private readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  // Avatar cache
  private avatarCache = new Map<string, string>();
  private avatarLoading = new Set<string>();

  // Route params
  townId: string | null = null;
  treeId: string | null = null;

  // State
  treeDetail = signal<FamilyTreeDetail | null>(null);
  people = signal<PersonListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  totalCount = signal(0);
  currentPage = signal(1);
  totalPages = signal(1);
  pageSize = 24;

  // Filters
  searchQuery = '';
  sexFilter = '';
  statusFilter = '';
  sortBy = 'name';

  ngOnInit(): void {
    this.townId = this.route.snapshot.paramMap.get('townId');
    this.treeId = this.route.snapshot.paramMap.get('treeId');

    if (this.treeId) {
      this.loadTreeDetails();
      this.loadPeople();
    } else {
      this.error.set(this.i18n.t('error.invalidTreeId'));
      this.loading.set(false);
    }

    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage.set(1);
      this.loadPeople();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Revoke avatar URLs
    this.avatarCache.forEach(url => URL.revokeObjectURL(url));
    this.avatarCache.clear();
  }

  loadTreeDetails(): void {
    if (!this.treeId) return;

    this.treeService.getTreeDetails(this.treeId).subscribe({
      next: (detail) => {
        this.treeDetail.set(detail);
      },
      error: (err) => {
        console.error('Failed to load tree details:', err);
      }
    });
  }

  loadPeople(): void {
    if (!this.treeId) return;

    this.loading.set(true);
    this.error.set(null);

    this.treeService.getTreePeople(this.treeId, {
      page: this.currentPage(),
      pageSize: this.pageSize,
      search: this.searchQuery || undefined,
      sex: this.sexFilter || undefined,
      isLiving: this.statusFilter === 'living' ? true : this.statusFilter === 'deceased' ? false : undefined,
      sortBy: this.sortBy,
      sortOrder: 'asc'
    }).subscribe({
      next: (response) => {
        this.people.set(response.people);
        this.totalCount.set(response.totalCount);
        this.totalPages.set(response.totalPages);
        this.loading.set(false);

        // Load avatars
        response.people.forEach(person => {
          if (person.avatarMediaId) {
            this.loadAvatar(person.id, person.avatarMediaId);
          }
        });
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('error.generic'));
        this.loading.set(false);
      }
    });
  }

  loadAvatar(personId: string, avatarMediaId: string): void {
    if (this.avatarCache.has(personId)) return;
    if (this.avatarLoading.has(personId)) return;

    this.avatarLoading.add(personId);

    this.mediaService.getMediaById(avatarMediaId).subscribe({
      next: (media) => {
        const objectUrl = this.mediaService.createObjectUrl(
          media.base64Data,
          media.mimeType || 'image/jpeg'
        );
        this.avatarCache.set(personId, objectUrl);
        this.avatarLoading.delete(personId);
      },
      error: () => {
        this.avatarLoading.delete(personId);
      }
    });
  }

  getAvatarUrl(personId: string): string | null {
    return this.avatarCache.get(personId) || null;
  }

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchSubject.next('');
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadPeople();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.sexFilter = '';
    this.statusFilter = '';
    this.sortBy = 'name';
    this.currentPage.set(1);
    this.loadPeople();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadPeople();
  }

  getPersonName(person: PersonListItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && person.nameArabic) {
      return person.nameArabic;
    }
    if (lang === 'nob' && person.nameNobiin) {
      return person.nameNobiin;
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || this.i18n.t('common.unknown');
  }

  hasSecondaryName(person: PersonListItem): boolean {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') {
      return !!(person.nameEnglish || person.nameNobiin);
    }
    return !!person.nameArabic;
  }

  getSecondaryName(person: PersonListItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') {
      return person.nameEnglish || person.nameNobiin || '';
    }
    return person.nameArabic || '';
  }

  getInitials(person: PersonListItem): string {
    const name = this.getPersonName(person);
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return dateStr;
    }
  }

  isUserRole(): boolean {
    return this.authService.hasSystemRole('User');
  }

  viewPerson(person: PersonListItem): void {
    this.router.navigate(['/people', person.id]);
  }

  suggestPerson(): void {
    this.router.navigate(['/suggestions/new'], {
      queryParams: { treeId: this.treeId, type: 'add-person' }
    });
  }
}
