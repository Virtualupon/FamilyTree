import { Component, OnInit, OnDestroy, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/services/auth.service';
import { PersonSearchService } from '../../core/services/person-search.service';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { TownService } from '../../core/services/town.service';
import { RelationshipService } from '../../core/services/relationship.service';
import { SuggestionService } from '../../core/services/suggestion.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName } from '../../core/models/search.models';
import { User, OrgRole } from '../../core/models/auth.models';
import { FamilyTreeListItem } from '../../core/models/family-tree.models';
import { SuggestionStats, SuggestionStatus } from '../../core/models/suggestion.models';
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
    MatBadgeModule,
    MatProgressSpinnerModule,
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
  private readonly townService = inject(TownService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly suggestionService = inject(SuggestionService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly Sex = Sex;
  readonly OrgRole = OrgRole;

  currentUser = signal<User | null>(null);
  recentPeople = signal<SearchPersonItem[]>([]);
  loadingRecent = signal(true);
  hasNoTrees = signal(false);
  checkingTrees = signal(true);
  suggestionStats = signal<SuggestionStats | null>(null);
  pendingReviewCount = signal<number>(0);

  // Town trees for regular users
  townTrees = signal<FamilyTreeListItem[]>([]);
  loadingTownTrees = signal(false);

  // Computed: Get selected town name from current user
  selectedTownName = computed(() => {
    const user = this.currentUser();
    return user?.selectedTownName || null;
  });

  // Computed: Check if user is a regular User (not Admin/SuperAdmin)
  isRegularUser = computed(() => {
    const user = this.currentUser();
    return user?.systemRole === 'User';
  });

  // Computed: Check if we should show town trees section
  showTownTreesSection = computed(() => {
    const user = this.currentUser();
    // Show for regular users who have selected a town but don't have a tree selected
    return user?.systemRole === 'User' && user?.selectedTownId && !this.treeContext.effectiveTreeId();
  });

  // Computed: Check if user can create trees (not regular Users)
  canCreateTree = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    // Only Developer/SuperAdmin/Admin can create trees, not regular Users
    return user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin';
  });

  // Computed: Check if user is a Viewer (read-only)
  isViewer = computed(() => {
    const user = this.currentUser();
    if (!user) return true;
    // System admins are never viewers
    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin') return false;
    // Check org role
    return user.role === OrgRole.Viewer;
  });

  // Computed: Check if user can edit (Contributor or higher)
  canEdit = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin') return true;
    return user.role >= OrgRole.Contributor;
  });

  // Computed: Check if user is admin (can review suggestions)
  isAdmin = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin';
  });

  stats = signal<StatCard[]>([
    { icon: 'users', labelKey: 'dashboard.totalPeople', value: '-', color: '#187573', route: '/people' }, // $nubian-teal
    { icon: 'mars', labelKey: 'people.male', value: '-', color: '#187573', route: '/people?sex=male' }, // $nubian-teal
    { icon: 'venus', labelKey: 'people.female', value: '-', color: '#C17E3E', route: '/people?sex=female' }, // $nubian-gold
    { icon: 'people-roof', labelKey: 'dashboard.totalFamilies', value: '-', color: '#2D7A3E', route: '/families' } // $nubian-green
  ]);

  // Dynamic quick actions based on role
  quickActions = computed<QuickAction[]>(() => {
    const baseActions: QuickAction[] = [
      { icon: 'sitemap', labelKey: 'nav.familyTree', route: '/tree', color: '#2D7A3E' }, // $nubian-green
      { icon: 'users', labelKey: 'nav.people', route: '/people', color: '#C17E3E' }, // $nubian-gold
      { icon: 'images', labelKey: 'nav.media', route: '/media', color: '#E85D35' } // $nubian-orange
    ];

    if (this.isViewer()) {
      // Viewers get "Suggest Relationship" instead of "Add Person"
      return [
        { icon: 'lightbulb', labelKey: 'suggestion.suggestRelationship', action: () => this.openSuggestionWizard(), color: '#187573' },
        ...baseActions,
        { icon: 'clipboard-list', labelKey: 'suggestion.mySuggestions', route: '/suggestions/my', color: '#6B7280' }
      ];
    } else {
      // Editors and above get "Add Person"
      const actions: QuickAction[] = [
        { icon: 'user-plus', labelKey: 'people.addPerson', action: () => this.openAddPerson(), color: '#187573' },
        ...baseActions
      ];

      // Admins also see review queue link
      if (this.isAdmin()) {
        actions.push({ icon: 'inbox', labelKey: 'suggestion.reviewQueue', route: '/admin/suggestions', color: '#DC2626' });
      }

      return actions;
    }
  });

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

    // Load suggestion stats for viewers
    this.loadSuggestionStats();
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
    this.suggestionStats.set(null);

    const user = this.authService.getCurrentUser();
    const isAdmin = user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';

    // For Admin/SuperAdmin - load town stats if town selected
    if (isAdmin) {
      const townId = this.treeContext.selectedTownId();
      if (townId) {
        this.loadTownStats(townId);
      }
    }

    // Reload if we have a valid tree
    if (this.treeContext.effectiveTreeId()) {
      this.hasNoTrees.set(false);
      this.loadRecentPeople();
      this.loadStats();
      this.loadSuggestionStats();
    }
  }

  private loadSuggestionStats(): void {
    // Load user's suggestion statistics
    this.suggestionService.getMyStatistics().subscribe({
      next: (stats) => {
        this.suggestionStats.set(stats);
      },
      error: (err) => {
        console.error('Failed to load suggestion stats:', err);
      }
    });

    // For admins, also load pending review count
    if (this.isAdmin()) {
      this.suggestionService.getSuggestionQueue({ status: SuggestionStatus.Pending, pageSize: 1 }).subscribe({
        next: (response) => {
          this.pendingReviewCount.set(response.totalCount);
        },
        error: (err) => {
          console.error('Failed to load pending count:', err);
        }
      });
    }
  }

  private checkUserTrees(): void {
    this.checkingTrees.set(true);
    const user = this.authService.getCurrentUser();
    const isAdmin = user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';
    const isRegularUser = user?.systemRole === 'User';

    // For Admin/SuperAdmin - they have assigned towns, auto-select happens in TreeContextService
    if (isAdmin) {
      this.checkingTrees.set(false);
      this.hasNoTrees.set(false);

      // Wait a tick for TreeContextService to auto-select town/trees
      setTimeout(() => {
        const townId = this.treeContext.selectedTownId();
        const treeId = this.treeContext.effectiveTreeId();

        if (townId) {
          // Load stats for the selected town
          this.loadTownStats(townId);
        }

        if (treeId) {
          // Load recent people and stats for selected tree
          this.loadRecentPeople();
          this.loadStats();
        } else {
          this.loadingRecent.set(false);
        }
      }, 100);
      return;
    }

    // For regular users with a selected town, check if there are trees in the town
    // They don't need to be members to view trees - they just need a selected town
    if (isRegularUser && user?.selectedTownId) {
      // User has selected a town - they can browse trees in that town
      this.checkingTrees.set(false);
      this.hasNoTrees.set(false);

      // Always load town-level statistics for regular users
      this.loadTownStats(user.selectedTownId);
      this.loadTownTrees(user.selectedTownId);

      // Load data if we have an effective tree ID (from membership or selection)
      if (this.treeContext.effectiveTreeId()) {
        this.loadRecentPeople();
      } else {
        // No tree selected yet - just stop the loading indicator
        this.loadingRecent.set(false);
      }
      return;
    }

    // For regular users without town selection, check membership
    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.checkingTrees.set(false);

        if (trees.length === 0) {
          // Regular user with no trees and no town - show prompt
          this.hasNoTrees.set(true);
          this.loadingRecent.set(false);
        } else if (this.treeContext.effectiveTreeId()) {
          // Regular user with membership
          this.hasNoTrees.set(false);
          this.loadRecentPeople();
          this.loadStats();
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

  /**
   * Load aggregated statistics for a town (for regular users viewing all trees in their town)
   */
  loadTownStats(townId: string): void {
    this.townService.getTownStatistics(townId).subscribe({
      next: (townStats) => {
        // Calculate male/female totals from all family trees
        let maleCount = 0;
        let femaleCount = 0;
        if (townStats.familyTrees) {
          townStats.familyTrees.forEach(tree => {
            maleCount += tree.maleCount || 0;
            femaleCount += tree.femaleCount || 0;
          });
        }

        // Update stats with town-level data
        this.stats.set([
          { icon: 'users', labelKey: 'dashboard.totalPeople', value: townStats.totalPeople, color: '#187573', route: '/people' },
          { icon: 'mars', labelKey: 'people.male', value: maleCount, color: '#187573', route: '/people?sex=male' },
          { icon: 'venus', labelKey: 'people.female', value: femaleCount, color: '#C17E3E', route: '/people?sex=female' },
          { icon: 'people-roof', labelKey: 'dashboard.totalFamilies', value: townStats.totalFamilies, color: '#2D7A3E', route: '/families' }
        ]);
      },
      error: (err) => {
        console.error('Failed to load town statistics:', err);
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

  // Helper to get full lineage name (Person + Father + Grandfather)
  getPersonDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    const parts: string[] = [];

    // Get person's name based on language
    let name: string | null = null;
    let fatherName: string | null = null;
    let grandfatherName: string | null = null;

    if (lang === 'ar') {
      name = person.nameArabic || person.nameEnglish || person.primaryName;
      fatherName = person.fatherNameArabic || person.fatherNameEnglish;
      grandfatherName = person.grandfatherNameArabic || person.grandfatherNameEnglish;
    } else if (lang === 'nob') {
      name = person.nameNobiin || person.nameEnglish || person.primaryName;
      fatherName = person.fatherNameNobiin || person.fatherNameEnglish;
      grandfatherName = person.grandfatherNameNobiin || person.grandfatherNameEnglish;
    } else {
      name = person.nameEnglish || person.nameArabic || person.primaryName;
      fatherName = person.fatherNameEnglish || person.fatherNameArabic;
      grandfatherName = person.grandfatherNameEnglish || person.grandfatherNameArabic;
    }

    // Build lineage string
    if (name) parts.push(name);
    if (fatherName) parts.push(fatherName);
    if (grandfatherName) parts.push(grandfatherName);

    return parts.join(' ') || unknown;
  }

  // Get location name (town or country fallback) based on current language
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

  openSuggestionWizard(): void {
    // Navigate to suggestion creation (will be replaced with dialog later)
    this.router.navigate(['/suggestions/new']);
  }

  viewMySuggestions(): void {
    this.router.navigate(['/suggestions/my']);
  }

  viewSuggestionQueue(): void {
    this.router.navigate(['/admin/suggestions']);
  }

  /**
   * Load family trees for the selected town
   */
  loadTownTrees(townId: string): void {
    this.loadingTownTrees.set(true);
    this.townService.getTownTrees(townId).subscribe({
      next: (trees) => {
        this.townTrees.set(trees);
        this.loadingTownTrees.set(false);
      },
      error: (err) => {
        console.error('Failed to load town trees:', err);
        this.townTrees.set([]);
        this.loadingTownTrees.set(false);
      }
    });
  }

  /**
   * Select a tree and load its data
   */
  selectFamilyTree(tree: FamilyTreeListItem): void {
    // Set the tree in context
    this.treeContext.selectTree(tree.id);

    // Navigate to People list to browse the tree's members
    this.router.navigate(['/people']);
  }
}