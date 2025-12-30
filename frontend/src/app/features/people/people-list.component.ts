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
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonListItem, Sex, PersonSearchRequest } from '../../core/models/person.models';
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
                  [class.ft-avatar--unknown]="person.sex === Sex.Unknown">
                  {{ getInitials(person.primaryName) }}
                </div>
                
                <!-- Content -->
                <div class="ft-person-card__content">
                  <h3 class="ft-person-card__name">{{ person.primaryName || ('common.unknown' | translate) }}</h3>
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
                    @if (person.birthPlace) {
                      <span class="ft-person-card__meta-item">
                        <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                        {{ person.birthPlace }}
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
                    @if (!person.deathDate) {
                      <span class="ft-badge ft-badge--success">{{ 'people.living' | translate }}</span>
                    }
                    @if (person.needsReview) {
                      <span class="ft-badge ft-badge--warning">Review</span>
                    }
                    @if (person.isVerified) {
                      <span class="ft-badge ft-badge--primary">
                        <i class="fa-solid fa-circle-check" aria-hidden="true" style="font-size: 12px;"></i>
                      </span>
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
                      <span>{{ 'people.editPerson' | translate }}</span>
                    </button>
                    <button mat-menu-item (click)="viewInTree(person)">
                      <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                      <span>{{ 'nav.familyTree' | translate }}</span>
                    </button>
                    <mat-divider></mat-divider>
                    <button mat-menu-item class="text-error" (click)="deletePerson(person)">
                      <i class="fa-solid fa-trash" aria-hidden="true" style="color: var(--ft-error);"></i>
                      <span>{{ 'people.deletePerson' | translate }}</span>
                    </button>
                  </mat-menu>
                </div>
              </div>
            }
          </div>
          
          <!-- Load More -->
          @if (hasMore()) {
            <div class="people-page__load-more">
              <button 
                mat-stroked-button 
                (click)="loadMore()"
                [disabled]="loadingMore()">
                @if (loadingMore()) {
                  <span class="ft-spinner ft-spinner--sm"></span>
                } @else {
                  {{ 'common.next' | translate }}
                }
              </button>
            </div>
          }
        }
      </div>
      
      <!-- FAB Button (Mobile) -->
      <button
        mat-fab
        color="primary"
        class="ft-btn--fab d-desktop-none"
        [matTooltip]="'people.addPerson' | translate"
        (click)="openPersonForm()">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  `,
  styles: [`
    .people-page {
      &__header {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-sm);
        margin-bottom: var(--ft-spacing-lg);
        
        @media (min-width: 768px) {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
      }
      
      &__title-section {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-xs);
        
        @media (min-width: 768px) {
          flex-direction: row;
          align-items: baseline;
          gap: var(--ft-spacing-md);
        }
      }
      
      &__count {
        font-size: 0.875rem;
        color: var(--ft-on-surface-variant);
      }
      
      &__toolbar {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-md);
        margin-bottom: var(--ft-spacing-lg);
        
        @media (min-width: 768px) {
          flex-direction: row;
          align-items: center;
          
          .ft-search {
            max-width: 400px;
          }
        }
      }
      
      &__content {
        padding-bottom: calc(var(--ft-spacing-xxl) + 56px); // Space for FAB
        
        @media (min-width: 768px) {
          padding-bottom: var(--ft-spacing-lg);
        }
      }
      
      &__load-more {
        display: flex;
        justify-content: center;
        padding: var(--ft-spacing-lg) 0;
      }
    }
    
    .people-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--ft-spacing-md);
      
      @media (min-width: 576px) {
        grid-template-columns: repeat(2, 1fr);
      }
      
      @media (min-width: 992px) {
        grid-template-columns: repeat(3, 1fr);
      }
      
      @media (min-width: 1400px) {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    
    .ft-person-card__badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ft-spacing-xs);
      margin-top: var(--ft-spacing-sm);
    }
    
    i.fa-solid.ft-chip__icon {
      font-size: 14px;
      margin-inline-end: 4px;
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
  private readonly personService = inject(PersonService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();
  
  // Expose enum to template
  readonly Sex = Sex;
  
  // State
  people = signal<PersonListItem[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = 20;
  searchQuery = '';
  
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
    ).subscribe(() => {
      this.currentPage.set(1);
      this.loadPeople();
    });
    
    this.loadPeople();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  loadPeople(append = false): void {
    if (append) {
      this.loadingMore.set(true);
    } else {
      this.loading.set(true);
    }
    
    const filters = this.filters();
    const request: PersonSearchRequest = {
      page: this.currentPage(),
      pageSize: this.pageSize,
      nameQuery: this.searchQuery || undefined,
      sex: filters.sex ?? undefined,
    };
    
    // Apply status filter
    if (filters.status === 'living') {
      // Living = no death date (we'll filter client-side since API might not support this directly)
    } else if (filters.status === 'deceased') {
      // Deceased = has death date
    }
    
    this.personService.searchPeople(request).subscribe({
      next: (response) => {
        if (append) {
          this.people.update(p => [...p, ...response.items]);
        } else {
          this.people.set(response.items);
        }
        this.totalCount.set(response.totalCount);
        this.loading.set(false);
        this.loadingMore.set(false);
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
    this.searchSubject.next('');
  }
  
  setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    this.filters.update(f => ({ ...f, [key]: value }));
    this.currentPage.set(1);
    this.loadPeople();
  }
  
  clearFilters(): void {
    this.searchQuery = '';
    this.filters.set({ sex: null, status: 'all' });
    this.currentPage.set(1);
    this.loadPeople();
  }
  
  loadMore(): void {
    this.currentPage.update(p => p + 1);
    this.loadPeople(true);
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
  
  openPersonForm(person?: PersonListItem): void {
    const dialogRef = this.dialog.open(PersonFormDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      panelClass: 'ft-dialog',
      data: { person }
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
  
  viewPerson(person: PersonListItem): void {
    this.router.navigate(['/people', person.id]);
  }
  
  editPerson(person: PersonListItem): void {
    this.openPersonForm(person);
  }
  
  viewInTree(person: PersonListItem): void {
    this.router.navigate(['/tree'], { queryParams: { personId: person.id } });
  }

  viewPersonMedia(person: PersonListItem, event: Event): void {
    event.stopPropagation(); // Prevent card click from triggering
    this.router.navigate(['/people', person.id], { queryParams: { tab: 'media' } });
  }

  deletePerson(person: PersonListItem): void {
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
