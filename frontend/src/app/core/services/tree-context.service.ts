import { Injectable, signal, computed, inject } from '@angular/core';
import { FamilyTreeService } from './family-tree.service';
import { TownService } from './town.service';
import { AuthService } from './auth.service';
import { FamilyTreeListItem } from '../models/family-tree.models';
import { TownListItem } from '../models/town.models';

/**
 * TreeContext manages the currently selected tree for the user.
 *
 * - Regular users: automatically use their tree membership (from token)
 * - Admin: can select from assigned trees + member trees
 * - SuperAdmin: can select from ALL trees
 */
@Injectable({
  providedIn: 'root'
})
export class TreeContextService {
  private readonly authService = inject(AuthService);
  private readonly treeService = inject(FamilyTreeService);
  private readonly townService = inject(TownService);

  private readonly STORAGE_KEY = 'selected_tree_id';
  private readonly TOWN_STORAGE_KEY = 'selected_town_id';

  // All available trees for this user
  availableTrees = signal<FamilyTreeListItem[]>([]);

  // All available towns
  availableTowns = signal<TownListItem[]>([]);

  // Currently selected tree
  selectedTreeId = signal<string | null>(this.loadStoredTreeId());

  // Currently selected town
  selectedTownId = signal<string | null>(this.loadStoredTownId());

  // Loading state
  loading = signal(false);
  loadingTowns = signal(false);

  // Computed: selected tree object
  selectedTree = computed(() => {
    const treeId = this.selectedTreeId();
    if (!treeId) return null;
    return this.availableTrees().find(t => t.id === treeId) || null;
  });

  // Computed: selected town object
  selectedTown = computed(() => {
    const townId = this.selectedTownId();
    if (!townId) return null;
    return this.availableTowns().find(t => t.id === townId) || null;
  });

  // Computed: trees filtered by selected town
  treesInSelectedTown = computed(() => {
    const townId = this.selectedTownId();
    if (!townId) return this.availableTrees();
    // Filter trees by town - requires trees to have townId property
    // For now, return all trees since FamilyTreeListItem doesn't have townId yet
    return this.availableTrees();
  });

  // Computed: whether user needs to select a tree
  needsTreeSelection = computed(() => {
    const user = this.authService.getCurrentUser();
    if (!user) return false;

    // Developer/SuperAdmin/Admin without a selected tree and no token orgId needs to select
    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin') {
      return !this.selectedTreeId() && !user.orgId;
    }

    return false;
  });

  // Computed: whether to show tree selector (for admins)
  showTreeSelector = computed(() => {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    return user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin';
  });

  // Computed: effective tree ID to use for API calls
  effectiveTreeId = computed(() => {
    const selectedId = this.selectedTreeId();
    if (selectedId) return selectedId;

    // Fall back to token orgId for regular users
    const user = this.authService.getCurrentUser();
    return user?.orgId || null;
  });

  constructor() {
    // Load trees and towns when auth state changes
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        // With HttpOnly cookies, the interceptor handles token refresh on 401.
        // Just load data — if the token is expired, the interceptor will refresh it.
        this.loadAvailableTrees();
        this.loadAvailableTowns();
      } else {
        this.clearState();
      }
    });
  }

  private clearState(): void {
    this.availableTrees.set([]);
    this.availableTowns.set([]);
    this.selectedTreeId.set(null);
    this.selectedTownId.set(null);
  }

  /**
   * Load available trees based on user role
   */
  loadAvailableTrees(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    this.loading.set(true);

    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin') {
      // Developer/SuperAdmin: load all trees
      this.treeService.getMyTrees().subscribe({
        next: (trees) => {
          this.availableTrees.set(trees);
          this.autoSelectTree(trees);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        }
      });
    } else if (user.systemRole === 'Admin') {
      // Admin: load member trees (admin controller requires SuperAdmin+ so use getMyTrees)
      this.treeService.getMyTrees().subscribe({
        next: (trees) => {
          this.availableTrees.set(trees);
          this.autoSelectTree(trees);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        }
      });
    } else {
      // Regular user: load member trees
      this.treeService.getMyTrees().subscribe({
        next: (trees) => {
          this.availableTrees.set(trees);
          this.autoSelectTree(trees);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        }
      });
    }
  }

  /**
   * Auto-select a tree if none is selected
   */
  private autoSelectTree(trees: FamilyTreeListItem[]): void {
    const currentSelection = this.selectedTreeId();

    // If current selection is still valid, keep it
    if (currentSelection && trees.some(t => t.id === currentSelection)) {
      return;
    }

    // Try to use token orgId
    const user = this.authService.getCurrentUser();
    if (user?.orgId && trees.some(t => t.id === user.orgId)) {
      this.selectTree(user.orgId);
      return;
    }

    // Auto-select first tree if only one available
    if (trees.length === 1) {
      this.selectTree(trees[0].id);
      return;
    }

    // Clear selection if current selection is invalid
    if (currentSelection && !trees.some(t => t.id === currentSelection)) {
      this.selectedTreeId.set(null);
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Select a tree
   */
  selectTree(treeId: string | null): void {
    this.selectedTreeId.set(treeId);
    if (treeId) {
      localStorage.setItem(this.STORAGE_KEY, treeId);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Load stored tree ID from localStorage
   */
  private loadStoredTreeId(): string | null {
    return localStorage.getItem(this.STORAGE_KEY);
  }

  /**
   * Check if user has access to any trees
   */
  hasAnyTrees(): boolean {
    return this.availableTrees().length > 0;
  }

  // ========================================================================
  // TOWN CONTEXT
  // ========================================================================

  // Signal for admin's assigned towns
  assignedTowns = signal<{ id: string; name: string; nameEn: string | null; nameAr: string | null; nameLocal: string | null; treeCount: number }[]>([]);

  // Computed: whether to show town selector (for admins with assigned towns)
  showTownSelector = computed(() => {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin') return true;
    if (user.systemRole === 'Admin') return this.assignedTowns().length > 0;
    return false;
  });

  /**
   * Load available towns based on user role
   * - Admin: load only assigned towns
   * - SuperAdmin: load all towns
   */
  loadAvailableTowns(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    this.loadingTowns.set(true);

    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin') {
      // Developer/SuperAdmin: load all towns
      this.townService.getTowns({ page: 1, pageSize: 1000 }).subscribe({
        next: (result) => {
          this.availableTowns.set(result.items);
          // Also set as assigned towns for UI consistency
          this.assignedTowns.set(result.items.map(t => ({
            id: t.id,
            name: t.name,
            nameEn: t.nameEn || null,
            nameAr: t.nameAr || null,
            nameLocal: t.nameLocal || null,
            treeCount: t.treeCount || 0
          })));
          this.autoSelectTown(result.items);
          this.loadingTowns.set(false);
        },
        error: () => {
          this.availableTowns.set([]);
          this.assignedTowns.set([]);
          this.loadingTowns.set(false);
        }
      });
    } else if (user.systemRole === 'Admin') {
      // Admin: load assigned towns via auth endpoint (admin controller requires SuperAdmin+)
      this.authService.getMyTowns().subscribe({
        next: (response) => {
          const towns = response.assignedTowns.map(t => ({
            id: t.id,
            name: t.name,
            nameEn: t.nameEn || null,
            nameAr: t.nameAr || null,
            nameLocal: null as string | null,
            treeCount: t.treeCount || 0
          }));
          this.assignedTowns.set(towns);
          // Also populate availableTowns for compatibility
          this.availableTowns.set(towns.map(t => ({
            id: t.id,
            name: t.name,
            nameEn: t.nameEn || undefined,
            nameAr: t.nameAr || undefined,
            nameLocal: t.nameLocal || undefined,
            country: '',
            treeCount: t.treeCount,
            createdAt: new Date().toISOString()
          })));

          // Auto-select first town for Admin
          const currentTownId = this.selectedTownId();
          if (currentTownId && towns.some(t => t.id === currentTownId)) {
            // Current selection is valid - load trees for it
            this.loadTreesForTown(currentTownId);
          } else if (towns.length > 0 && !currentTownId) {
            // No selection - auto-select first town
            this.selectTown(towns[0].id);
            this.loadTreesForTown(towns[0].id);
          }

          this.loadingTowns.set(false);
        },
        error: () => {
          this.assignedTowns.set([]);
          this.availableTowns.set([]);
          this.loadingTowns.set(false);
        }
      });
    } else {
      // Regular users: don't load towns
      this.availableTowns.set([]);
      this.assignedTowns.set([]);
      this.loadingTowns.set(false);
    }
  }

  /**
   * Auto-select a town if none is selected (for Admin/SuperAdmin)
   */
  private autoSelectTown(towns: TownListItem[]): void {
    const currentSelection = this.selectedTownId();

    // If current selection is still valid, keep it
    if (currentSelection && towns.some(t => t.id === currentSelection)) {
      // Load trees for the selected town
      this.loadTreesForTown(currentSelection);
      return;
    }

    // Clear selection if current selection is invalid
    if (currentSelection && !towns.some(t => t.id === currentSelection)) {
      this.selectedTownId.set(null);
      localStorage.removeItem(this.TOWN_STORAGE_KEY);
    }

    // Auto-select first town for Admin/SuperAdmin
    const user = this.authService.getCurrentUser();
    if (user && (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin')) {
      if (towns.length > 0 && !this.selectedTownId()) {
        this.selectTown(towns[0].id);
        // Load trees for the auto-selected town
        this.loadTreesForTown(towns[0].id);
      }
    }
  }

  /**
   * Select a town (filters available trees)
   */
  selectTown(townId: string | null): void {
    this.selectedTownId.set(townId);
    if (townId) {
      localStorage.setItem(this.TOWN_STORAGE_KEY, townId);
    } else {
      localStorage.removeItem(this.TOWN_STORAGE_KEY);
    }
  }

  /**
   * Load stored town ID from localStorage
   */
  private loadStoredTownId(): string | null {
    return localStorage.getItem(this.TOWN_STORAGE_KEY);
  }

  /**
   * Clear town selection
   */
  clearTownSelection(): void {
    this.selectTown(null);
  }

  /**
   * Check if any towns are available
   */
  hasAnyTowns(): boolean {
    return this.availableTowns().length > 0;
  }

  /**
   * Get trees for a specific town
   */
  loadTreesForTown(townId: string): void {
    this.loading.set(true);
    this.townService.getTownTrees(townId).subscribe({
      next: (trees) => {
        // Convert to FamilyTreeListItem format if needed
        this.availableTrees.set(trees);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }
}
