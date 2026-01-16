import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';

import { PersonService } from '../../core/services/person.service';
import { PersonSearchService } from '../../core/services/person-search.service';
import { PersonMediaService } from '../../core/services/person-media.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName, SearchScript } from '../../core/models/search.models';
import { EmptyStateComponent, SkeletonComponent, ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components';
import { PersonFormDialogComponent } from './person-form-dialog.component';

interface FilterState {
  sex: Sex | null;
  status: 'all' | 'living' | 'deceased';
}

@Component({
  selector: 'app-people-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatMenuModule,
    MatRippleModule,
    MatTooltipModule,
    MatBadgeModule,
    MatDividerModule,
    TranslatePipe,
    EmptyStateComponent,
    SkeletonComponent
  ],
  template: `
    <div class="ft-page people-page">
      <!-- Header -->
      <header class="people-page__header">
        <div class="people-page__title-section">
          <h1 class="ft-page__title">{{ 'people.title' | translate }}</h1>
          @if (totalCount() > 0) {
            <span class="people-page__count">{{ 'people.totalCount' | translate: { count: totalCount() } }}</span>
          }
          @if (searchDuration() > 0) {
            <span class="people-page__duration">({{ searchDuration() }}ms)</span>
          }
        </div>
        
        <button 
          mat-flat-button 
          color="primary" 
          class="people-page__add-btn d-mobile-none"
          (click)="openPersonForm()">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          {{ 'people.addPerson' | translate }}
        </button>
      </header>
      
      <!-- Search & Filters -->
      <div class="people-page__toolbar">
        <div class="ft-search">
          <i class="fa-solid fa-magnifying-glass ft-search__icon" aria-hidden="true"></i>
          <input
            type="text"
            class="ft-search__input"
            [placeholder]="'people.searchPlaceholder' | translate"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)">
          @if (detectedScript() !== 'auto') {
            <span class="ft-search__script-hint">{{ detectedScript() }}</span>
          }
          @if (searchQuery) {
            <button class="ft-search__clear" (click)="clearSearch()">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          }
        </div>
        
        <div class="ft-filter-group">
          <!-- Sex Filter -->
          <button 
            class="ft-chip"
            [class.ft-chip--active]="filters().sex === null"
            (click)="setFilter('sex', null)">
            {{ 'common.all' | translate }}
          </button>
          <button
            class="ft-chip"
            [class.ft-chip--active]="filters().sex === Sex.Male"
            (click)="setFilter('sex', Sex.Male)">
            <i class="fa-solid fa-mars ft-chip__icon" aria-hidden="true"></i>
            {{ 'people.male' | translate }}
          </button>
          <button
            class="ft-chip"
            [class.ft-chip--active]="filters().sex === Sex.Female"
            (click)="setFilter('sex', Sex.Female)">
            <i class="fa-solid fa-venus ft-chip__icon" aria-hidden="true"></i>
            {{ 'people.female' | translate }}
          </button>
          
          <!-- Status Filter -->
          <button 
            class="ft-chip"
            [class.ft-chip--active]="filters().status === 'living'"
            (click)="setFilter('status', filters().status === 'living' ? 'all' : 'living')">
            {{ 'people.living' | translate }}
          </button>
          <button 
            class="ft-chip"
            [class.ft-chip--active]="filters().status === 'deceased'"
            (click)="setFilter('status', filters().status === 'deceased' ? 'all' : 'deceased')">
            {{ 'people.deceased' | translate }}
          </button>
        </div>
      </div>
      
      <!-- Content -->
      <div class="people-page__content">
        @if (loading()) {
          <!-- Loading Skeletons -->
          <div class="people-grid">
            @for (i of [1,2,3,4,5,6]; track i) {
              <app-skeleton type="person-card" [class]="'ft-fade-in ft-stagger-' + i"></app-skeleton>
            }
          </div>
        } @else if (people().length === 0) {
          <!-- Empty State -->
          <app-empty-state
            icon="fa-users"
            [title]="hasActiveFilters() ? ('common.noResults' | translate) : ('people.noPeople' | translate)"
            [description]="hasActiveFilters() ? '' : ('people.addFirst' | translate)">
            @if (!hasActiveFilters()) {
              <button mat-flat-button color="primary" (click)="openPersonForm()">
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {{ 'people.addPerson' | translate }}
              </button>
            } @else {
              <button mat-stroked-button (click)="clearFilters()">
                {{ 'common.filter' | translate }} {{ 'common.cancel' | translate }}
              </button>
            }
          </app-empty-state>
        } @else {
          <!-- People Grid -->
          <div class="people-grid">
            @for (person of people(); track person.id; let i = $index) {
              <div 
                class="ft-person-card ft-fade-in"
                [class]="'ft-stagger-' + (i % 10 + 1)"
                matRipple
                (click)="viewPerson(person)">
                
                <!-- Avatar -->
                <div 
                  class="ft-avatar ft-avatar--lg"
                  [class.ft-avatar--male]="person.sex === Sex.Male"
                  [class.ft-avatar--female]="person.sex === Sex.Female"
                  [class.ft-avatar--unknown]="person.sex === Sex.Unknown"
                  [class.ft-avatar--has-image]="getAvatarUrl(person.id)">
                  @if (getAvatarUrl(person.id)) {
                    <img [src]="getAvatarUrl(person.id)" [alt]="getPersonOwnName(person)" class="ft-avatar__img">
                  } @else {
                    {{ getInitials(getPersonOwnName(person)) }}
                  }
                </div>
                
                <!-- Content -->
                <div class="ft-person-card__content">
                  <h3 class="ft-person-card__name">{{ getPersonName(person) || ('common.unknown' | translate) }}</h3>

                  <!-- Show secondary names if available -->
                  @if (hasSecondaryNames(person)) {
                    <div class="ft-person-card__alt-names">
                      @for (name of getSecondaryNames(person); track $index) {
                        <span class="ft-person-card__alt-name">{{ name }}</span>
                      }
                    </div>
                  }
                  
                  <div class="ft-person-card__meta">
                    @if (person.birthDate) {
                      <span class="ft-person-card__meta-item">
                        <i class="fa-solid fa-cake-candles" aria-hidden="true"></i>
                        {{ formatDate(person.birthDate) }}
                      </span>
                    }
                    @if (person.deathDate) {
                      <span class="ft-person-card__meta-item">
                        <i class="fa-solid fa-clock" aria-hidden="true"></i>
                        {{ formatDate(person.deathDate) }}
                      </span>
                    }
                    @if (person.birthPlaceName) {
                      <span class="ft-person-card__meta-item">
                        <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                        {{ person.birthPlaceName }}
                      </span>
                    }
                  </div>
                  
                  <!-- Relationship counts -->
                  <div class="ft-person-card__counts">
                    @if (person.parentsCount > 0) {
                      <span class="ft-badge ft-badge--info" matTooltip="Parents">
                        <i class="fa-solid fa-user-tie" aria-hidden="true"></i> {{ person.parentsCount }}
                      </span>
                    }
                    @if (person.childrenCount > 0) {
                      <span class="ft-badge ft-badge--info" matTooltip="Children">
                        <i class="fa-solid fa-child" aria-hidden="true"></i> {{ person.childrenCount }}
                      </span>
                    }
                    @if (person.spousesCount > 0) {
                      <span class="ft-badge ft-badge--info" matTooltip="Spouses">
                        <i class="fa-solid fa-heart" aria-hidden="true"></i> {{ person.spousesCount }}
                      </span>
                    }
                  </div>
                  
                  <!-- Badges -->
                  <div class="ft-person-card__badges">
                    @if (person.mediaCount > 0) {
                      <span class="ft-badge ft-badge--media ft-badge--clickable"
                            [matTooltip]="person.mediaCount + ' media files - Click to view'"
                            (click)="viewPersonMedia(person, $event)">
                        <i class="fa-solid fa-camera" aria-hidden="true" style="font-size: 12px;"></i>
                        {{ person.mediaCount }}
                      </span>
                    }
                    @if (person.isLiving) {
                      <span class="ft-badge ft-badge--success">{{ 'people.living' | translate }}</span>
                    }
                  </div>
                </div>
                
                <!-- Actions Menu -->
                <div class="ft-person-card__actions" (click)="$event.stopPropagation()">
                  <button mat-icon-button [matMenuTriggerFor]="personMenu">
                    <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
                  </button>
                  <mat-menu #personMenu="matMenu">
                    <button mat-menu-item (click)="viewPerson(person)">
                      <i class="fa-solid fa-eye" aria-hidden="true"></i>
                      <span>{{ 'people.viewProfile' | translate }}</span>
                    </button>
                    <button mat-menu-item (click)="editPerson(person)">
                      <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                      <span>{{ 'common.edit' | translate }}</span>
                    </button>
                    <button mat-menu-item (click)="viewInTree(person)">
                      <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                      <span>{{ 'people.viewInTree' | translate }}</span>
                    </button>
                    <mat-divider></mat-divider>
                    <button mat-menu-item class="text-error" (click)="deletePerson(person)">
                      <i class="fa-solid fa-trash" aria-hidden="true"></i>
                      <span>{{ 'common.delete' | translate }}</span>
                    </button>
                  </mat-menu>
                </div>
              </div>
            }
          </div>
          
          <!-- Load More -->
          @if (hasMore()) {
            <div class="people-page__load-more">
              <button mat-stroked-button (click)="loadMore()" [disabled]="loadingMore()">
                @if (loadingMore()) {
                  <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                }
                {{ 'common.loadMore' | translate }}
              </button>
            </div>
          }
        }
      </div>
      
      <!-- Mobile FAB -->
      <button 
        mat-fab 
        color="primary" 
        class="people-page__fab d-desktop-none"
        (click)="openPersonForm()">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  `,
  styles: [`
    .people-page {
      &__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--ft-spacing-lg);
      }
      
      &__title-section {
        display: flex;
        align-items: baseline;
        gap: var(--ft-spacing-sm);
      }
      
      &__count {
        color: var(--ft-text-secondary);
        font-size: var(--ft-font-size-sm);
      }
      
      &__duration {
        color: var(--ft-text-tertiary);
        font-size: var(--ft-font-size-xs);
      }
      
      &__toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ft-spacing-md);
        margin-bottom: var(--ft-spacing-lg);
      }
      
      &__content {
        min-height: 300px;
      }
      
      &__load-more {
        display: flex;
        justify-content: center;
        padding: var(--ft-spacing-xl) 0;
      }
      
      &__fab {
        position: fixed;
        bottom: calc(var(--ft-spacing-xl) + 56px);
        right: var(--ft-spacing-lg);
        z-index: 100;
      }
    }
    
    .people-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: var(--ft-spacing-md);
    }
    
    .ft-search__script-hint {
      font-size: var(--ft-font-size-xs);
      color: var(--ft-primary);
      background: var(--ft-primary-light);
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: var(--ft-spacing-xs);
    }
    
    .ft-person-card__alt-names {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ft-spacing-xs);
      margin-top: var(--ft-spacing-xs);
    }
    
    .ft-person-card__alt-name {
      font-size: var(--ft-font-size-xs);
      color: var(--ft-text-secondary);
      direction: auto;
    }
    
    .ft-person-card__counts {
      display: flex;
      gap: var(--ft-spacing-xs);
      margin-top: var(--ft-spacing-xs);
    }
    
    mat-divider {
      margin: var(--ft-spacing-xs) 0;
    }
    
    .text-error {
      color: var(--ft-error) !important;
    }
  `]
})
export class PeopleListComponent implements OnInit, OnDestroy {
  // Use new efficient search service
  private readonly searchService = inject(PersonSearchService);
  private readonly personService = inject(PersonService);
  private readonly mediaService = inject(PersonMediaService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();
  
  // Avatar cache: personId -> object URL
  private avatarCache = new Map<string, string>();
  private avatarLoading = new Set<string>();
  
  // Expose enum to template
  readonly Sex = Sex;
  
  // State - using new SearchPersonItem type
  people = signal<SearchPersonItem[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = 20;
  searchQuery = '';
  searchDuration = signal(0);
  detectedScript = signal<SearchScript>('auto');
  
  filters = signal<FilterState>({
    sex: null,
    status: 'all'
  });
  
  // Search debounce
  private searchSubject = new Subject<string>();
  
  // Computed
  hasMore = computed(() => this.people().length < this.totalCount());
  
  hasActiveFilters = computed(() => {
    const f = this.filters();
    return this.searchQuery.length > 0 || f.sex !== null || f.status !== 'all';
  });
  
  ngOnInit(): void {
    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((query) => {
      // Detect script for UI hint
      this.detectedScript.set(this.searchService.detectScript(query));
      this.currentPage.set(1);
      this.loadPeople();
    });
    
    this.loadPeople();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Revoke avatar object URLs to prevent memory leaks
    this.avatarCache.forEach(url => URL.revokeObjectURL(url));
    this.avatarCache.clear();
  }
  
  loadPeople(append = false): void {
    if (append) {
      this.loadingMore.set(true);
    } else {
      this.loading.set(true);
    }
    
    const filters = this.filters();
    
    // Use new efficient search service
    this.searchService.search({
      query: this.searchQuery || undefined,
      sex: filters.sex ?? undefined,
      isLiving: filters.status === 'living' ? true : filters.status === 'deceased' ? false : undefined,
      page: this.currentPage(),
      pageSize: this.pageSize
    }).subscribe({
      next: (response) => {
        if (append) {
          this.people.update(p => [...p, ...response.items]);
        } else {
          this.people.set(response.items);
        }
        this.totalCount.set(response.total);
        this.searchDuration.set(response.searchDurationMs || 0);
        this.loading.set(false);
        this.loadingMore.set(false);
        
        // Load avatars for people with avatarMediaId
        response.items.forEach(person => {
          if (person.avatarMediaId) {
            this.loadAvatar(person.id, person.avatarMediaId);
          }
        });
      },
      error: (error) => {
        console.error('Failed to load people:', error);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }
  
  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }
  
  clearSearch(): void {
    this.searchQuery = '';
    this.detectedScript.set('auto');
    this.searchSubject.next('');
  }
  
  setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    this.filters.update(f => ({ ...f, [key]: value }));
    this.currentPage.set(1);
    this.loadPeople();
  }
  
  clearFilters(): void {
    this.searchQuery = '';
    this.detectedScript.set('auto');
    this.filters.set({ sex: null, status: 'all' });
    this.currentPage.set(1);
    this.loadPeople();
  }
  
  loadMore(): void {
    this.currentPage.update(p => p + 1);
    this.loadPeople(true);
  }
  
  // Helper to get full lineage name (Person + Father + Grandfather)
  getPersonName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();

    // Get person's name based on language
    let personName = '';
    if (lang === 'ar' && person.nameArabic) {
      personName = person.nameArabic;
    } else if (lang === 'nob' && person.nameNobiin) {
      personName = person.nameNobiin;
    } else {
      personName = person.nameEnglish || person.nameArabic || person.primaryName || '';
    }

    // Get father's name based on language
    let fatherName = '';
    if (lang === 'ar' && person.fatherNameArabic) {
      fatherName = person.fatherNameArabic;
    } else if (lang === 'nob' && person.fatherNameNobiin) {
      fatherName = person.fatherNameNobiin;
    } else {
      fatherName = person.fatherNameEnglish || person.fatherNameArabic || '';
    }

    // Get grandfather's name based on language
    let grandfatherName = '';
    if (lang === 'ar' && person.grandfatherNameArabic) {
      grandfatherName = person.grandfatherNameArabic;
    } else if (lang === 'nob' && person.grandfatherNameNobiin) {
      grandfatherName = person.grandfatherNameNobiin;
    } else {
      grandfatherName = person.grandfatherNameEnglish || person.grandfatherNameArabic || '';
    }

    // Build full name: "Name Father Grandfather"
    const parts = [personName, fatherName, grandfatherName].filter(p => p);
    return parts.join(' ') || this.i18n.t('common.unknown');
  }

  // Get just the person's own name (for initials, etc.)
  getPersonOwnName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && person.nameArabic) {
      return person.nameArabic;
    }
    if (lang === 'nob' && person.nameNobiin) {
      return person.nameNobiin;
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || this.i18n.t('common.unknown');
  }

  // Check if person has secondary names to display
  hasSecondaryNames(person: SearchPersonItem): boolean {
    return this.getSecondaryNames(person).length > 0;
  }

  // Get secondary names (names NOT in user's current display language)
  getSecondaryNames(person: SearchPersonItem): string[] {
    const lang = this.i18n.currentLang();
    const names: string[] = [];

    // Add names that are NOT the primary display language
    if (lang !== 'ar' && person.nameArabic) {
      names.push(person.nameArabic);
    }
    if (lang !== 'en' && person.nameEnglish) {
      names.push(person.nameEnglish);
    }
    if (lang !== 'nob' && person.nameNobiin) {
      names.push(person.nameNobiin);
    }

    return names;
  }

  /**
   * Load avatar for a person and cache it
   */
  loadAvatar(personId: string, avatarMediaId: string | null | undefined): void {
    if (!avatarMediaId) return;
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

  /**
   * Get cached avatar URL for a person
   */
  getAvatarUrl(personId: string): string | null {
    return this.avatarCache.get(personId) || null;
  }
  
  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  
  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return dateStr;
    }
  }
  
  openPersonForm(person?: SearchPersonItem): void {
    const dialogRef = this.dialog.open(PersonFormDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      panelClass: 'ft-dialog',
      data: { person: person ? { id: person.id, primaryName: this.getPersonName(person) } : undefined }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPeople();
        const message = person 
          ? this.i18n.t('personForm.updateSuccess')
          : this.i18n.t('personForm.createSuccess');
        this.snackBar.open(message, this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }
  
  viewPerson(person: SearchPersonItem): void {
    this.router.navigate(['/people', person.id]);
  }
  
  editPerson(person: SearchPersonItem): void {
    this.openPersonForm(person);
  }
  
  viewInTree(person: SearchPersonItem): void {
    this.router.navigate(['/tree'], { queryParams: { personId: person.id } });
  }

  viewPersonMedia(person: SearchPersonItem, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/people', person.id], { queryParams: { tab: 'media' } });
  }

  deletePerson(person: SearchPersonItem): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: this.i18n.t('people.deletePerson'),
        message: this.i18n.t('people.deleteConfirm'),
        confirmText: this.i18n.t('common.delete'),
        cancelText: this.i18n.t('common.cancel'),
        confirmColor: 'warn',
        icon: 'warning'
      } as ConfirmDialogData
    });
    
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.personService.deletePerson(person.id).subscribe({
          next: () => {
            this.people.update(p => p.filter(item => item.id !== person.id));
            this.totalCount.update(c => c - 1);
            this.snackBar.open(
              this.i18n.t('personForm.deleteSuccess'), 
              this.i18n.t('common.close'), 
              { duration: 3000 }
            );
          },
          error: (error) => {
            console.error('Failed to delete person:', error);
            this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
          }
        });
      }
    });
  }
}