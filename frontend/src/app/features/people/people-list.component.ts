import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
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
import { TreeContextService } from '../../core/services/tree-context.service';
import { TreeService } from '../../core/services/tree.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName, SearchScript } from '../../core/models/search.models';
import { RootPersonSummary } from '../../core/models/tree.models';
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
  templateUrl: './people-list.component.html',
  styleUrls: ['./people-list.component.scss']
})
export class PeopleListComponent implements OnInit, OnDestroy {
  // Use new efficient search service
  private readonly searchService = inject(PersonSearchService);
  private readonly personService = inject(PersonService);
  private readonly mediaService = inject(PersonMediaService);
  private readonly treeContext = inject(TreeContextService);
  private readonly treeService = inject(TreeService);
  private readonly authService = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  // Track if we've already retried after clearing tree selection
  private hasRetriedAfterClearingTree = false;

  // Avatar cache: personId -> object URL
  private avatarCache = new Map<string, string>();
  private avatarLoading = new Set<string>();

  // Ancestor avatar cache: personId -> object URL
  private ancestorAvatarCache = new Map<string, string>();
  private ancestorAvatarLoading = new Set<string>();

  // Expose enum to template
  readonly Sex = Sex;

  // Founding ancestors hero state
  rootPersons = signal<RootPersonSummary[]>([]);
  treeName = signal<string>('');
  loadingAncestors = signal(false);
  heroCollapsed = signal(false);

  // Tree/Town context — always visible when a tree is selected
  currentTreeName = computed(() => {
    // Prefer the tree name from root-persons API (includes all scripts)
    const apiTreeName = this.treeName();
    if (apiTreeName) return apiTreeName;
    // Fallback to tree context selected tree
    return this.treeContext.selectedTree()?.name || '';
  });

  currentTownName = computed(() => {
    const tree = this.treeContext.selectedTree();
    return tree?.townName || this.treeContext.selectedTown()?.name || this.authService.getSelectedTownName() || '';
  });

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

  // Reload people list when the selected tree changes
  private previousTreeId: string | null = null;
  private rootPersonsLoaded = false;
  private treeChangeEffect = effect(() => {
    const currentTreeId = this.treeContext.effectiveTreeId();
    if (this.previousTreeId !== null && currentTreeId !== this.previousTreeId) {
      // Tree changed - full reload
      this.currentPage.set(1);
      this.people.set([]);
      this.avatarCache.forEach(url => URL.revokeObjectURL(url));
      this.avatarCache.clear();
      this.avatarLoading.clear();
      this.ancestorAvatarCache.forEach(url => URL.revokeObjectURL(url));
      this.ancestorAvatarCache.clear();
      this.ancestorAvatarLoading.clear();
      this.hasRetriedAfterClearingTree = false;
      this.loadPeople();
      this.loadRootPersons();
    } else if (currentTreeId && !this.rootPersonsLoaded) {
      // Initial tree assignment (previousTreeId was null) - load ancestors
      this.loadRootPersons();
    }
    this.previousTreeId = currentTreeId;
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
    this.loadRootPersons();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Revoke avatar object URLs to prevent memory leaks
    this.avatarCache.forEach(url => URL.revokeObjectURL(url));
    this.avatarCache.clear();
    this.ancestorAvatarCache.forEach(url => URL.revokeObjectURL(url));
    this.ancestorAvatarCache.clear();
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
        // Handle 403 Forbidden - likely caused by stale tree selection in localStorage
        if (error.status === 403 && !this.hasRetriedAfterClearingTree) {
          console.warn('403 Forbidden - clearing tree selection and retrying');
          this.hasRetriedAfterClearingTree = true;
          this.treeContext.selectTree(null);
          this.loadPeople(append);
          return;
        }

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

  /**
   * Get location name (town or country fallback) based on current language
   */
  getLocationDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();

    // Try town first
    let townName = '';
    if (lang === 'ar') {
      townName = person.townNameAr || person.townNameEn || person.townName || '';
    } else if (lang === 'nob') {
      townName = person.townName || person.townNameEn || person.townNameAr || '';
    } else {
      townName = person.townNameEn || person.townName || person.townNameAr || '';
    }

    if (townName) return townName;

    // Fallback to country
    if (lang === 'ar') {
      return person.countryNameAr || person.countryNameEn || '';
    }
    return person.countryNameEn || person.countryNameAr || '';
  }

  // ========================================================================
  // FOUNDING ANCESTORS HERO SECTION
  // ========================================================================

  /**
   * Load root persons (founding ancestors) for the current tree
   */
  loadRootPersons(): void {
    const treeId = this.treeContext.effectiveTreeId();
    if (!treeId) {
      this.rootPersons.set([]);
      this.treeName.set('');
      return;
    }

    this.loadingAncestors.set(true);
    this.rootPersonsLoaded = true;

    this.treeService.getRootPersons(treeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.rootPersons.set(response.rootPersons);
          this.treeName.set(response.treeName || '');
          this.loadingAncestors.set(false);

          // Load avatars for root persons
          response.rootPersons.forEach(person => {
            if (person.avatarMediaId) {
              this.loadAncestorAvatar(person.id, person.avatarMediaId);
            }
          });
        },
        error: (err) => {
          console.error('Failed to load root persons:', err);
          this.loadingAncestors.set(false);
        }
      });
  }

  /**
   * Load avatar for a root person and cache it
   */
  loadAncestorAvatar(personId: string, avatarMediaId: string): void {
    if (this.ancestorAvatarCache.has(personId)) return;
    if (this.ancestorAvatarLoading.has(personId)) return;

    this.ancestorAvatarLoading.add(personId);

    this.mediaService.getMediaById(avatarMediaId).subscribe({
      next: (media) => {
        const objectUrl = this.mediaService.createObjectUrl(
          media.base64Data,
          media.mimeType || 'image/jpeg'
        );
        this.ancestorAvatarCache.set(personId, objectUrl);
        this.ancestorAvatarLoading.delete(personId);
      },
      error: () => {
        this.ancestorAvatarLoading.delete(personId);
      }
    });
  }

  /**
   * Get cached avatar URL for a root person
   */
  getAncestorAvatarUrl(personId: string): string | null {
    return this.ancestorAvatarCache.get(personId) || null;
  }

  /**
   * Get localized name for a root person, with tree name as family name.
   * Root persons have no parents, so we append the tree name to form a full name.
   * e.g. "Ahmed" + tree "Sab" → "Ahmed Sab"
   */
  getAncestorName(person: RootPersonSummary): string {
    const lang = this.i18n.currentLang();
    let firstName = '';
    switch (lang) {
      case 'ar':
        firstName = person.nameArabic || person.primaryName;
        break;
      case 'nob':
        firstName = person.nameNobiin || person.primaryName;
        break;
      case 'en':
      default:
        firstName = person.nameEnglish || person.primaryName;
        break;
    }

    // Extract the relevant part of the tree name for the current language.
    // Tree name may contain mixed scripts e.g. "Sab ساب" — extract only the matching script.
    const fullTreeName = this.treeName();
    if (!fullTreeName) return firstName;

    const familyName = this.extractLocalizedTreeName(fullTreeName, lang);
    if (familyName && !firstName.includes(familyName)) {
      return `${firstName} ${familyName}`;
    }
    return firstName;
  }

  /**
   * Extract the language-appropriate part of a tree name.
   * e.g. "Sab ساب" → "ساب" for Arabic, "Sab" for English
   */
  private extractLocalizedTreeName(treeName: string, lang: string): string {
    const parts = treeName.split(/\s+/);
    if (parts.length <= 1) return treeName;

    // Check if the name has mixed scripts (Latin + Arabic/Coptic)
    const arabicParts = parts.filter(p => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(p));
    const latinParts = parts.filter(p => /[a-zA-Z]/.test(p));
    const copticParts = parts.filter(p => /[\u2C80-\u2CFF]/.test(p));

    if (lang === 'ar' && arabicParts.length > 0) {
      return arabicParts.join(' ');
    }
    if (lang === 'nob' && copticParts.length > 0) {
      return copticParts.join(' ');
    }
    if (latinParts.length > 0) {
      return latinParts.join(' ');
    }

    // Fallback: return the full name
    return treeName;
  }

  /**
   * Get gender CSS class for root person avatar
   */
  getGenderClass(sex: Sex): string {
    switch (sex) {
      case Sex.Male:
        return 'male';
      case Sex.Female:
        return 'female';
      default:
        return 'unknown';
    }
  }

  /**
   * Navigate to tree diagram view for a specific ancestor
   */
  viewAncestor(person: RootPersonSummary): void {
    this.router.navigate(['/tree'], { queryParams: { personId: person.id } });
  }

  /**
   * Navigate to tree view, centered on the first root ancestor
   */
  viewTree(): void {
    const roots = this.rootPersons();
    if (roots.length > 0) {
      this.router.navigate(['/tree'], { queryParams: { personId: roots[0].id } });
    } else {
      this.router.navigate(['/tree']);
    }
  }

  /**
   * Toggle hero section collapse
   */
  toggleHero(): void {
    this.heroCollapsed.update(v => !v);
  }
}