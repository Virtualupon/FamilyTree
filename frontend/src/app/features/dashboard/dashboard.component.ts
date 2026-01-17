import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { PersonSearchService } from '../../core/services/person-search.service';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { RelationshipService } from '../../core/services/relationship.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName } from '../../core/models/search.models';
import { User } from '../../core/models/auth.models';
import { PersonFormDialogComponent } from '../people/person-form-dialog.component';

interface QuickAction {
  icon: string;
  labelKey: string;
  route?: string;
  action?: () => void;
  color: string;
}

interface StatCard {
  icon: string;
  labelKey: string;
  value: number | string;
  color: string;
  route?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatRippleModule,
    TranslatePipe
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly searchService = inject(PersonSearchService);
  private readonly treeService = inject(FamilyTreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly Sex = Sex;

  currentUser = signal<User | null>(null);
  recentPeople = signal<SearchPersonItem[]>([]);
  loadingRecent = signal(true);
  hasNoTrees = signal(false);
  checkingTrees = signal(true);
  stats = signal<StatCard[]>([
    { icon: 'users', labelKey: 'dashboard.totalPeople', value: '-', color: '#187573', route: '/people' }, // $nubian-teal
    { icon: 'mars', labelKey: 'people.male', value: '-', color: '#187573', route: '/people?sex=male' }, // $nubian-teal
    { icon: 'venus', labelKey: 'people.female', value: '-', color: '#C17E3E', route: '/people?sex=female' }, // $nubian-gold
    { icon: 'people-roof', labelKey: 'dashboard.totalFamilies', value: '-', color: '#2D7A3E', route: '/families' } // $nubian-green
  ]);

  quickActions: QuickAction[] = [
    { icon: 'user-plus', labelKey: 'people.addPerson', action: () => this.openAddPerson(), color: '#187573' }, // $nubian-teal
    { icon: 'sitemap', labelKey: 'nav.familyTree', route: '/tree', color: '#2D7A3E' }, // $nubian-green
    { icon: 'users', labelKey: 'nav.people', route: '/people', color: '#C17E3E' }, // $nubian-gold
    { icon: 'images', labelKey: 'nav.media', route: '/media', color: '#E85D35' } // $nubian-orange
  ];

  // Track previous tree ID to detect changes
  private previousTreeId: string | null = null;

  // Effect to reload data when selected tree changes
  private treeChangeEffect = effect(() => {
    const currentTreeId = this.treeContext.effectiveTreeId();
    if (this.previousTreeId !== null && currentTreeId !== this.previousTreeId) {
      // Tree changed, reload data
      this.reloadDashboardData();
    }
    this.previousTreeId = currentTreeId;
  });

  ngOnInit(): void {
    this.currentUser.set(this.authService.getCurrentUser());
    
    // Check for tree ID in route params (from /trees/:id)
    this.route.params.subscribe(params => {
      const treeId = params['id'];
      if (treeId) {
        // Set this tree as the active context
        this.treeContext.selectTree(treeId);
      }
      this.checkUserTrees();
    });
  }

  private reloadDashboardData(): void {
    // Reset stats
    this.stats.set([
      { icon: 'users', labelKey: 'dashboard.totalPeople', value: '-', color: '#187573', route: '/people' }, // $nubian-teal
      { icon: 'mars', labelKey: 'people.male', value: '-', color: '#187573', route: '/people?sex=male' }, // $nubian-teal
      { icon: 'venus', labelKey: 'people.female', value: '-', color: '#C17E3E', route: '/people?sex=female' }, // $nubian-gold
      { icon: 'people-roof', labelKey: 'dashboard.totalFamilies', value: '-', color: '#2D7A3E', route: '/families' } // $nubian-green
    ]);
    this.recentPeople.set([]);

    // Reload if we have a valid tree
    if (this.treeContext.effectiveTreeId()) {
      this.hasNoTrees.set(false);
      this.loadRecentPeople();
      this.loadStats();
    }
  }

  private checkUserTrees(): void {
    this.checkingTrees.set(true);
    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.checkingTrees.set(false);
        // For admins, also check if they have assigned trees
        const user = this.authService.getCurrentUser();
        const isAdmin = user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';

        if (trees.length === 0 && !isAdmin) {
          this.hasNoTrees.set(true);
          this.loadingRecent.set(false);
        } else if (this.treeContext.effectiveTreeId()) {
          // Admin with selected tree or regular user with membership
          this.hasNoTrees.set(false);
          this.loadRecentPeople();
          this.loadStats();
        } else if (isAdmin) {
          // Admin without selected tree - wait for selection
          this.hasNoTrees.set(false);
          this.loadingRecent.set(false);
        } else {
          this.hasNoTrees.set(true);
          this.loadingRecent.set(false);
        }
      },
      error: () => {
        this.checkingTrees.set(false);
        this.hasNoTrees.set(true);
        this.loadingRecent.set(false);
      }
    });
  }
  
  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return this.i18n.t('dashboard.goodMorning');
    if (hour < 17) return this.i18n.t('dashboard.goodAfternoon');
    return this.i18n.t('dashboard.goodEvening');
  }
  
  loadRecentPeople(): void {
    this.loadingRecent.set(true);
    // Use search() with empty request for loading recent people (no search term required)
    this.searchService.search({ page: 1, pageSize: 5 }).subscribe({
      next: (response) => {
        this.recentPeople.set(response.items);
        this.loadingRecent.set(false);
      },
      error: (err) => {
        console.error('Failed to load recent people:', err);
        this.loadingRecent.set(false);
      }
    });
  }
  
  loadStats(): void {
    const treeId = this.treeContext.effectiveTreeId() || undefined;

    // Use search() with empty request for getting total counts (no search term required)
    this.searchService.search({ page: 1, pageSize: 1 }).subscribe({
      next: (response) => {
        this.stats.update(stats => {
          const updated = [...stats];
          updated[0] = { ...updated[0], value: response.total };
          return updated;
        });

        // Load male count
        this.searchService.search({ page: 1, pageSize: 1, sex: Sex.Male }).subscribe(res => {
          this.stats.update(stats => {
            const updated = [...stats];
            updated[1] = { ...updated[1], value: res.total };
            return updated;
          });
        });

        // Load female count
        this.searchService.search({ page: 1, pageSize: 1, sex: Sex.Female }).subscribe(res => {
          this.stats.update(stats => {
            const updated = [...stats];
            updated[2] = { ...updated[2], value: res.total };
            return updated;
          });
        });
      }
    });
    
    // Load family/union count
    this.relationshipService.searchUnions({ treeId, page: 1, pageSize: 1 }).subscribe({
      next: (response) => {
        this.stats.update(stats => {
          const updated = [...stats];
          updated[3] = { ...updated[3], value: response.totalCount };
          return updated;
        });
      },
      error: (err) => {
        console.error('Failed to load family count:', err);
      }
    });
  }
  
  handleAction(action: QuickAction): void {
    if (action.route) {
      this.router.navigate([action.route]);
    } else if (action.action) {
      action.action();
    }
  }
  
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
  
  openAddPerson(): void {
    const dialogRef = this.dialog.open(PersonFormDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      panelClass: 'ft-dialog',
      data: {}
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecentPeople();
        this.loadStats();
        this.snackBar.open(
          this.i18n.t('personForm.createSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      }
    });
  }
  
  viewPerson(person: SearchPersonItem): void {
    this.router.navigate(['/people', person.id]);
  }

  // Helper to get display name in user's preferred language
  getPersonDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') return person.nameArabic || person.nameEnglish || person.primaryName || unknown;
    if (lang === 'nob') return person.nameNobiin || person.nameEnglish || person.primaryName || unknown;
    return person.nameEnglish || person.nameArabic || person.primaryName || unknown;
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