import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';

import { PersonService } from '../../core/services/person.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonListItem, Sex } from '../../core/models/person.models';
import { SkeletonComponent } from '../../shared/components';

@Component({
  selector: 'app-person-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    TranslatePipe,
    SkeletonComponent
  ],
  template: `
    <div class="person-selector">
      <!-- Handle -->
      <div class="person-selector__handle"></div>
      
      <!-- Header -->
      <div class="person-selector__header">
        <h3 class="person-selector__title">{{ 'tree.selectPerson' | translate }}</h3>
        <button mat-icon-button (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <!-- Search -->
      <div class="person-selector__search">
        <div class="ft-search">
          <mat-icon class="ft-search__icon">search</mat-icon>
          <input
            type="text"
            class="ft-search__input"
            [placeholder]="'people.searchPlaceholder' | translate"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            autocomplete="off"
            autofocus>
          @if (searchQuery) {
            <button class="ft-search__clear" (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      </div>
      
      <!-- Results -->
      <div class="person-selector__content">
        @if (loading()) {
          <div class="person-selector__list">
            @for (i of [1,2,3,4,5]; track i) {
              <app-skeleton type="person-card"></app-skeleton>
            }
          </div>
        } @else if (people().length === 0) {
          <div class="person-selector__empty">
            <mat-icon>person_search</mat-icon>
            <p>{{ 'common.noResults' | translate }}</p>
          </div>
        } @else {
          <div class="person-selector__list">
            @for (person of people(); track person.id) {
              <div 
                class="person-selector__item"
                matRipple
                (click)="selectPerson(person)">
                
                <div 
                  class="person-selector__avatar"
                  [class.person-selector__avatar--male]="person.sex === Sex.Male"
                  [class.person-selector__avatar--female]="person.sex === Sex.Female">
                  {{ getInitials(person.primaryName) }}
                </div>
                
                <div class="person-selector__info">
                  <div class="person-selector__name">{{ person.primaryName || ('common.unknown' | translate) }}</div>
                  <div class="person-selector__meta">
                    @if (person.birthDate) {
                      <span>{{ formatYear(person.birthDate) }}</span>
                    }
                    @if (person.birthDate && person.deathDate) {
                      <span>-</span>
                    }
                    @if (person.deathDate) {
                      <span>{{ formatYear(person.deathDate) }}</span>
                    }
                    @if (person.birthPlace) {
                      <span class="person-selector__place">
                        <mat-icon>place</mat-icon>
                        {{ person.birthPlace }}
                      </span>
                    }
                  </div>
                </div>
                
                <mat-icon class="person-selector__arrow">chevron_right</mat-icon>
              </div>
            }
          </div>
          
          <!-- Load More -->
          @if (hasMore()) {
            <div class="person-selector__load-more">
              <button 
                mat-stroked-button 
                (click)="loadMore()"
                [disabled]="loadingMore()">
                @if (loadingMore()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  {{ 'common.next' | translate }}
                }
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .person-selector {
      display: flex;
      flex-direction: column;
      max-height: 80vh;
      background: var(--ft-surface);
      border-radius: var(--ft-radius-xl) var(--ft-radius-xl) 0 0;
      
      &__handle {
        display: flex;
        justify-content: center;
        padding: var(--ft-spacing-sm);
        
        &::after {
          content: '';
          width: 40px;
          height: 4px;
          background: var(--ft-border);
          border-radius: var(--ft-radius-full);
        }
      }
      
      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--ft-spacing-md) var(--ft-spacing-md);
      }
      
      &__title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
      }
      
      &__search {
        padding: 0 var(--ft-spacing-md) var(--ft-spacing-md);
      }
      
      &__content {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 0 var(--ft-spacing-md) var(--ft-spacing-md);
        max-height: 60vh;
      }
      
      &__list {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-sm);
      }
      
      &__item {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-md);
        padding: var(--ft-spacing-md);
        background: var(--ft-surface-variant);
        border-radius: var(--ft-radius-lg);
        cursor: pointer;
        transition: all var(--ft-transition-fast);
        
        &:hover {
          background: var(--ft-border);
        }
        
        &:active {
          transform: scale(0.98);
        }
      }
      
      &__avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        font-weight: 600;
        background: var(--ft-unknown-light);
        color: var(--ft-unknown);
        flex-shrink: 0;
        
        &--male {
          background: var(--ft-male-light);
          color: var(--ft-male);
        }
        
        &--female {
          background: var(--ft-female-light);
          color: var(--ft-female);
        }
      }
      
      &__info {
        flex: 1;
        min-width: 0;
      }
      
      &__name {
        font-weight: 600;
        font-size: 1rem;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      &__meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ft-spacing-xs);
        font-size: 0.813rem;
        color: var(--ft-on-surface-variant);
      }
      
      &__place {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        
        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }
      
      &__arrow {
        color: var(--ft-on-surface-variant);
        flex-shrink: 0;
      }
      
      &__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ft-spacing-xxl);
        text-align: center;
        color: var(--ft-on-surface-variant);
        
        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
          margin-bottom: var(--ft-spacing-md);
          opacity: 0.5;
        }
        
        p {
          margin: 0;
        }
      }
      
      &__load-more {
        display: flex;
        justify-content: center;
        padding: var(--ft-spacing-md) 0;
      }
    }
  `]
})
export class PersonSelectorComponent implements OnInit, OnDestroy {
  private readonly bottomSheetRef = inject(MatBottomSheetRef<PersonSelectorComponent>);
  private readonly personService = inject(PersonService);
  private readonly i18n = inject(I18nService);
  private readonly destroy$ = new Subject<void>();
  
  readonly Sex = Sex;
  
  people = signal<PersonListItem[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = 20;
  searchQuery = '';
  
  private searchSubject = new Subject<string>();
  
  hasMore = () => this.people().length < this.totalCount();
  
  ngOnInit(): void {
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
    
    this.personService.searchPeople({
      page: this.currentPage(),
      pageSize: this.pageSize,
      nameQuery: this.searchQuery || undefined
    }).subscribe({
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
  
  loadMore(): void {
    this.currentPage.update(p => p + 1);
    this.loadPeople(true);
  }
  
  selectPerson(person: PersonListItem): void {
    this.bottomSheetRef.dismiss(person);
  }
  
  close(): void {
    this.bottomSheetRef.dismiss();
  }
  
  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  
  formatYear(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }
}
