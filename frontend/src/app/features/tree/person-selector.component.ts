import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';

import { PersonSearchService } from '../../core/services/person-search.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem } from '../../core/models/search.models';
import { SkeletonComponent } from '../../shared/components';
import { PersonNameAvatarComponent } from '../../shared/components/person-name-avatar/person-name-avatar.component';

@Component({
  selector: 'app-person-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    TranslatePipe,
    SkeletonComponent,
    PersonNameAvatarComponent
  ],
  templateUrl: './person-selector.component.html',
  styleUrls: ['./person-selector.component.scss']
})
export class PersonSelectorComponent implements OnInit, OnDestroy {
  private readonly bottomSheetRef = inject(MatBottomSheetRef<PersonSelectorComponent>);
  private readonly searchService = inject(PersonSearchService);
  private readonly i18n = inject(I18nService);
  private readonly destroy$ = new Subject<void>();
  
  readonly Sex = Sex;
  
  people = signal<SearchPersonItem[]>([]);
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

    const query = this.searchQuery || '';
    // Use search() for empty queries, quickSearch() for actual searches
    const searchObs = query.trim()
      ? this.searchService.quickSearch(query, this.currentPage(), this.pageSize)
      : this.searchService.search({ page: this.currentPage(), pageSize: this.pageSize });

    searchObs.subscribe({
      next: (response) => {
        if (append) {
          this.people.update(p => [...p, ...response.items]);
        } else {
          this.people.set(response.items);
        }
        this.totalCount.set(response.total);
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
  
  selectPerson(person: SearchPersonItem): void {
    this.bottomSheetRef.dismiss(person);
  }

  // Helper to get display name based on current language
  getPersonDisplayName(person: SearchPersonItem): string {
    if (!person) return '';

    const lang = this.i18n.currentLang();

    switch (lang) {
      case 'ar':
        return person.nameArabic || person.nameEnglish || person.primaryName || '';
      case 'nob':
        return person.nameNobiin || person.nameEnglish || person.primaryName || '';
      default: // 'en'
        return person.nameEnglish || person.nameArabic || person.primaryName || '';
    }
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
