import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TownService } from '../../core/services/town.service';
import { FamilyService } from '../../core/services/family.service';
import { AuthService } from '../../core/services/auth.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyTreeListItem, CreateFamilyTreeRequest } from '../../core/models/family-tree.models';
import { TownListItem } from '../../core/models/town.models';
import { FamilyListItem, FamilyWithMembers } from '../../core/models/family.models';
import { OrgRole, OrgRoleLabels } from '../../core/models/auth.models';
import { Sex } from '../../core/models/person.models';
import { GedcomImportDialogComponent } from './gedcom-import-dialog.component';
import { TreeDiagramModalComponent } from './tree-diagram-modal.component';

@Component({
  selector: 'app-tree-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslatePipe, GedcomImportDialogComponent, TreeDiagramModalComponent],
  templateUrl: './tree-list.component.html',
  styleUrls: ['./tree-list.component.scss']
})
export class TreeListComponent implements OnInit {
  private readonly treeContext = inject(TreeContextService);
  private readonly familyService = inject(FamilyService);

  // Expose Sex enum to template
  readonly Sex = Sex;

  trees = signal<FamilyTreeListItem[]>([]);
  towns = signal<TownListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // Family groups state
  families = signal<FamilyListItem[]>([]);
  loadingFamilies = signal(false);
  selectedFamilyId = signal<string | null>(null);
  selectedFamilyDetails = signal<FamilyWithMembers | null>(null);
  loadingMembers = signal(false);
  familySearchQuery = '';

  // Town dropdown state
  showTownDropdown = signal(false);
  availableTowns = signal<TownListItem[]>([]);

  // Check if user can create trees
  canCreateTree = computed(() => {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    // Developer, SuperAdmin, and Admin can create trees
    return user.systemRole === 'Developer' ||
           user.systemRole === 'SuperAdmin' ||
           user.systemRole === 'Admin';
  });

  searchQuery = '';
  selectedTownId: string | null = null;

  private _showCreateModal = false;
  get showCreateModal() { return this._showCreateModal; }
  set showCreateModal(value: boolean) {
    this._showCreateModal = value;
    // Auto-select the currently selected town when opening the modal
    if (value && this.selectedTownId && !this.newTree.townId) {
      this.newTree.townId = this.selectedTownId;
    }
  }

  showImportModal = false;
  showDiagramModal = false;
  selectedTreeForDiagram: { id: string; name: string } | null = null;
  creating = signal(false);
  createError = signal<string | null>(null);

  // HIERARCHY: Every tree MUST belong to a town
  newTree: CreateFamilyTreeRequest = {
    name: '',
    townId: '',  // REQUIRED - user must select a town
    description: '',
    isPublic: false,
    allowCrossTreeLinking: true
  };

  filteredTrees = computed(() => {
    let result = this.trees();

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(tree =>
        tree.name.toLowerCase().includes(query) ||
        (tree.description?.toLowerCase().includes(query))
      );
    }

    // HIERARCHY: Filter by town - trees are always under towns
    if (this.selectedTownId) {
      result = result.filter(tree => tree.townId === this.selectedTownId);
    }

    return result;
  });

  filteredFamilies = computed(() => {
    let result = this.families();

    if (this.familySearchQuery.trim()) {
      const query = this.familySearchQuery.toLowerCase();
      result = result.filter(family =>
        family.name.toLowerCase().includes(query) ||
        (family.nameEn?.toLowerCase().includes(query)) ||
        (family.nameAr?.toLowerCase().includes(query)) ||
        (family.nameLocal?.toLowerCase().includes(query))
      );
    }

    return result;
  });

  constructor(
    private treeService: FamilyTreeService,
    private townService: TownService,
    private authService: AuthService,
    private i18n: I18nService
  ) {}

  ngOnInit() {
    this.loadTrees();
    this.loadTowns();
    this.loadAvailableTowns();
  }

  loadTowns() {
    this.townService.getTowns({ page: 1, pageSize: 500 }).subscribe({
      next: (result) => {
        this.towns.set(result.items);
      },
      error: () => {
        this.towns.set([]);
      }
    });
  }

  loadAvailableTowns() {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin') {
      // Developer/SuperAdmin: load all towns
      this.townService.getTowns({ page: 1, pageSize: 500 }).subscribe({
        next: (result) => {
          this.availableTowns.set(result.items);
        }
      });
    } else if (user.systemRole === 'Admin') {
      // Admin: load assigned towns via auth endpoint (admin controller requires SuperAdmin+)
      this.authService.getMyTowns().subscribe({
        next: (response) => {
          this.availableTowns.set(response.assignedTowns.map(t => ({
            id: t.id,
            name: t.name,
            nameEn: t.nameEn || undefined,
            nameAr: t.nameAr || undefined,
            nameLocal: undefined,
            country: t.country || '',
            treeCount: t.treeCount || 0,
            createdAt: new Date().toISOString()
          })));
        },
        error: () => {
          this.availableTowns.set([]);
        }
      });
    } else {
      // Regular users: load all available towns via public endpoint
      this.authService.getAvailableTowns().subscribe({
        next: (towns) => {
          this.availableTowns.set(towns.map(t => ({
            id: t.id,
            name: t.name,
            nameEn: t.nameEn || undefined,
            nameAr: t.nameAr || undefined,
            nameLocal: undefined,
            country: t.country || '',
            treeCount: t.treeCount || 0,
            createdAt: new Date().toISOString()
          })));
        },
        error: () => {
          this.availableTowns.set([]);
        }
      });
    }
  }

  // Greeting based on time of day
  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return this.i18n.t('trees.goodMorning');
    if (hour < 18) return this.i18n.t('trees.goodAfternoon');
    return this.i18n.t('trees.goodEvening');
  }

  getUserFirstName(): string {
    const user = this.authService.getCurrentUser();
    return user?.firstName || user?.email?.split('@')[0] || '';
  }

  // Town dropdown
  toggleTownDropdown() {
    this.showTownDropdown.update(v => !v);
  }

  selectTown(town: TownListItem) {
    this.selectedTownId = town.id;
    this.showTownDropdown.set(false);
    this.selectedFamilyId.set(null);
    this.selectedFamilyDetails.set(null);
    this.loadFamiliesForTown(town.id);
  }

  getSelectedTownDisplayName(): string | null {
    if (!this.selectedTownId) return null;
    const town = this.availableTowns().find(t => t.id === this.selectedTownId);
    if (!town) return null;
    return this.getLocalizedTownName(town);
  }

  // Load families for selected town
  loadFamiliesForTown(townId: string) {
    this.loadingFamilies.set(true);
    this.familyService.getFamiliesByTown(townId).subscribe({
      next: (families) => {
        this.families.set(families);
        this.loadingFamilies.set(false);
      },
      error: () => {
        this.families.set([]);
        this.loadingFamilies.set(false);
      }
    });
  }

  // Family selection
  selectFamily(familyId: string) {
    this.selectedFamilyId.set(familyId);
    this.loadFamilyMembers(familyId);
  }

  clearFamilySelection() {
    this.selectedFamilyId.set(null);
    this.selectedFamilyDetails.set(null);
  }

  getSelectedFamilyDisplayName(): string {
    const familyId = this.selectedFamilyId();
    if (!familyId) return '';
    const family = this.families().find(f => f.id === familyId);
    if (!family) return '';
    return this.getLocalizedFamilyName(family);
  }

  loadFamilyMembers(familyId: string) {
    this.loadingMembers.set(true);
    this.familyService.getFamilyWithMembers(familyId).subscribe({
      next: (family) => {
        this.selectedFamilyDetails.set(family);
        this.loadingMembers.set(false);
      },
      error: () => {
        this.selectedFamilyDetails.set(null);
        this.loadingMembers.set(false);
      }
    });
  }

  getLocalizedFamilyName(family: FamilyListItem): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return family.nameAr || family.name;
      case 'nob':
        return family.nameLocal || family.name;
      case 'en':
      default:
        return family.nameEn || family.name;
    }
  }

  formatYear(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return dateStr.split('-')[0] || '';
    }
  }

  loadTrees() {
    this.loading.set(true);
    this.error.set(null);

    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.trees.set(trees);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('error.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  createTree() {
    // HIERARCHY ENFORCEMENT: Both name and townId are required
    if (!this.newTree.name.trim()) return;
    if (!this.newTree.townId) {
      this.createError.set(this.i18n.t('trees.townRequired'));
      return;
    }

    this.creating.set(true);
    this.createError.set(null);

    this.treeService.createTree(this.newTree).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.newTree = { name: '', townId: '', description: '', isPublic: false, allowCrossTreeLinking: true };

        this.authService.refreshToken().subscribe({
          next: () => {
            this.loadTrees();
            this.creating.set(false);
          },
          error: () => {
            this.loadTrees();
            this.creating.set(false);
          }
        });
      },
      error: (err) => {
        this.createError.set(err.error?.message || this.i18n.t('error.createFailed'));
        this.creating.set(false);
      }
    });
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedTownId = null;
  }

  getRoleLabel(role: OrgRole | null): string {
    if (role === null) return '';
    return OrgRoleLabels[role] || this.i18n.t('common.unknown');
  }

  getLocalizedTownName(town: TownListItem): string {
    return this.i18n.getTownName(town);
  }

  canManage(role: OrgRole | null): boolean {
    if (role === null) return false;
    return role >= OrgRole.Admin;
  }

  // Get the selected town for the create tree modal
  getSelectedCreateTown(): TownListItem | null {
    if (!this.newTree.townId) return null;
    return this.availableTowns().find(t => t.id === this.newTree.townId) || null;
  }

  // Called when town selection changes in create modal
  onCreateTreeTownChange(): void {
    // Clear any previous error when town is changed
    this.createError.set(null);
  }

  onImportComplete(): void {
    this.showImportModal = false;
    this.authService.refreshToken().subscribe({
      next: () => this.loadTrees(),
      error: () => this.loadTrees()
    });
  }

  /**
   * Open the tree diagram modal to show root persons (top level ancestors)
   */
  openTreeDiagram(tree: FamilyTreeListItem, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedTreeForDiagram = { id: tree.id, name: tree.name };
    this.showDiagramModal = true;
  }

  /**
   * Close the tree diagram modal
   */
  closeTreeDiagram(): void {
    this.showDiagramModal = false;
    this.selectedTreeForDiagram = null;
  }
}
