import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { PersonAvatarComponent } from '../../shared/components/person-avatar/person-avatar.component';
import { PersonSearchService } from '../../core/services/person-search.service';
import { TreeService } from '../../core/services/tree.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import {
  RelationshipService,
  ParentChildRelationshipType,
  UnionType,
  CreateUnionRequest,
  ParentChildResponse,
  UnionResponse
} from '../../core/services/relationship.service';
import { FamilyRelationshipTypeService } from '../../core/services/family-relationship-type.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName } from '../../core/models/search.models';
import { RelationshipPathResponse, PathPersonNode, RelationshipEdgeType } from '../../core/models/relationship-path.models';
import { FamilyRelationshipTypeGrouped } from '../../core/models/family-relationship-type.models';
import { getRelationshipDisplayName as getRelationshipDisplayNameHelper } from '../../core/helpers/relationship-name.helper';

type RelationshipCategory = 'parent-child' | 'union' | null;
type PathViewMode = 'linear' | 'tree';

interface EditableRelationship {
  type: 'parent-child' | 'union';
  id: string;
  relationshipType: ParentChildRelationshipType | UnionType;
  notes: string;
}

// Direction for parent-child relationship creation
type ParentChildDirection = 'a-is-parent' | 'b-is-parent';

@Component({
  selector: 'app-manage-relationships',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatButtonToggleModule,
    TranslatePipe,
    PersonAvatarComponent
  ],
  templateUrl: './manage-relationships.component.html',
  styleUrls: ['./manage-relationships.component.scss']
})
export class ManageRelationshipsComponent implements OnInit, OnDestroy {
  private readonly searchService = inject(PersonSearchService);
  private readonly treeService = inject(TreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly relationshipTypeService = inject(FamilyRelationshipTypeService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroy$ = new Subject<void>();

  readonly Sex = Sex;
  readonly ParentChildRelationshipType = ParentChildRelationshipType;
  readonly UnionType = UnionType;

  // Person A search state
  searchQueryA = '';
  searchResultsA = signal<SearchPersonItem[]>([]);
  searchingA = signal(false);
  selectedPersonA = signal<SearchPersonItem | null>(null);
  private searchSubjectA = new Subject<string>();

  // Person B search state
  searchQueryB = '';
  searchResultsB = signal<SearchPersonItem[]>([]);
  searchingB = signal(false);
  selectedPersonB = signal<SearchPersonItem | null>(null);
  private searchSubjectB = new Subject<string>();

  // Relationship finding state
  findingPath = signal(false);
  relationshipPath = signal<RelationshipPathResponse | null>(null);
  relationshipError = signal<string | null>(null);

  // Path view mode (linear or tree)
  pathViewMode = signal<PathViewMode>('linear');

  // Tree zoom level (0.5 to 1.5)
  treeZoom = signal<number>(1);

  // Relationship types for creating/editing
  relationshipTypesGrouped = signal<FamilyRelationshipTypeGrouped[]>([]);

  // Edit mode state
  isEditMode = signal(false);
  editableRelationship = signal<EditableRelationship | null>(null);
  loadingRelationshipDetails = signal(false);
  savingRelationship = signal(false);

  // Create mode state
  isCreateMode = signal(false);
  newRelationshipCategory = signal<RelationshipCategory>(null);
  newParentChildType = signal<ParentChildRelationshipType>(ParentChildRelationshipType.Biological);
  newUnionType = signal<UnionType>(UnionType.Marriage);
  newRelationshipNotes = signal('');
  parentChildDirection = signal<ParentChildDirection>('a-is-parent');
  creatingRelationship = signal(false);

  // Computed: can search for relationship
  canFindRelationship = computed(() => {
    return this.selectedPersonA() !== null &&
           this.selectedPersonB() !== null &&
           !this.findingPath();
  });

  ngOnInit(): void {
    // Load relationship types with takeUntil
    this.relationshipTypeService.getAllGrouped()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (grouped) => this.relationshipTypesGrouped.set(grouped),
        error: (err) => console.error('Failed to load relationship types:', err)
      });

    // Setup search debounce for Person A
    this.searchSubjectA.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query.trim()) {
        this.searchPerson(query, 'A');
      } else {
        this.searchResultsA.set([]);
      }
    });

    // Setup search debounce for Person B
    this.searchSubjectB.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query.trim()) {
        this.searchPerson(query, 'B');
      } else {
        this.searchResultsB.set([]);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Search handlers
  onSearchChangeA(query: string): void {
    this.searchSubjectA.next(query);
  }

  onSearchChangeB(query: string): void {
    this.searchSubjectB.next(query);
  }

  clearSearchA(): void {
    this.searchQueryA = '';
    this.searchResultsA.set([]);
  }

  clearSearchB(): void {
    this.searchQueryB = '';
    this.searchResultsB.set([]);
  }

  private searchPerson(query: string, panel: 'A' | 'B'): void {
    const searching = panel === 'A' ? this.searchingA : this.searchingB;
    const results = panel === 'A' ? this.searchResultsA : this.searchResultsB;
    const otherSelected = panel === 'A' ? this.selectedPersonB() : this.selectedPersonA();

    searching.set(true);

    this.searchService.quickSearch(query, 1, 20)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => searching.set(false))
      )
      .subscribe({
        next: (response) => {
          // Filter out the other selected person if any
          let filtered = response.items;
          if (otherSelected) {
            filtered = filtered.filter(p => p.id !== otherSelected.id);
          }
          results.set(filtered);
        },
        error: (error) => {
          console.error('Search failed:', error);
          results.set([]);
        }
      });
  }

  selectPersonA(person: SearchPersonItem): void {
    // Don't select if same as Person B
    if (this.selectedPersonB()?.id === person.id) {
      return;
    }
    this.selectedPersonA.set(person);
    this.searchQueryA = '';
    this.searchResultsA.set([]);
    this.clearRelationshipState();
  }

  selectPersonB(person: SearchPersonItem): void {
    // Don't select if same as Person A
    if (this.selectedPersonA()?.id === person.id) {
      return;
    }
    this.selectedPersonB.set(person);
    this.searchQueryB = '';
    this.searchResultsB.set([]);
    this.clearRelationshipState();
  }

  clearPersonA(): void {
    this.selectedPersonA.set(null);
    this.clearRelationshipState();
  }

  clearPersonB(): void {
    this.selectedPersonB.set(null);
    this.clearRelationshipState();
  }

  private clearRelationshipState(): void {
    this.relationshipPath.set(null);
    this.relationshipError.set(null);
    this.isEditMode.set(false);
    this.editableRelationship.set(null);
    this.isCreateMode.set(false);
    this.newRelationshipCategory.set(null);
  }

  // Find relationship between selected persons
  findRelationship(): void {
    const personA = this.selectedPersonA();
    const personB = this.selectedPersonB();

    if (!personA || !personB || this.findingPath()) {
      return;
    }

    this.findingPath.set(true);
    this.relationshipError.set(null);
    this.isEditMode.set(false);
    this.isCreateMode.set(false);

    const treeId = this.treeContext.effectiveTreeId();

    this.treeService.findRelationshipPath({
      person1Id: personA.id,
      person2Id: personB.id,
      treeId: treeId || undefined
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.findingPath.set(false))
      )
      .subscribe({
        next: (pathData) => {
          this.relationshipPath.set(pathData);
        },
        error: (error) => {
          console.error('Failed to find relationship:', error);
          this.relationshipError.set(error.error?.message || this.i18n.t('relationship.findError'));
        }
      });
  }

  // Edit existing relationship - now properly fetches relationship ID
  startEditRelationship(): void {
    const path = this.relationshipPath();
    const personA = this.selectedPersonA();
    const personB = this.selectedPersonB();

    if (!path?.pathFound || path.path.length < 2 || !personA || !personB) {
      return;
    }

    // Determine relationship type from path (only direct relationships can be edited)
    const edgeType = path.path[0]?.edgeToNext;

    // Only allow editing if it's a direct relationship (path length = 2)
    if (path.path.length !== 2) {
      this.snackBar.open(this.i18n.t('relationship.onlyDirectCanEdit'), '', { duration: 3000 });
      return;
    }

    this.loadingRelationshipDetails.set(true);

    if (edgeType === RelationshipEdgeType.Parent) {
      // Person A is parent of Person B - fetch children of A to find the relationship
      this.relationshipService.getChildren(personA.id)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.loadingRelationshipDetails.set(false))
        )
        .subscribe({
          next: (children) => {
            const rel = children.find(c => c.childId === personB.id);
            if (rel) {
              this.editableRelationship.set({
                type: 'parent-child',
                id: rel.id,
                relationshipType: rel.relationshipType,
                notes: rel.notes || ''
              });
              this.isEditMode.set(true);
              this.isCreateMode.set(false);
            } else {
              this.snackBar.open(this.i18n.t('relationship.notFoundForEdit'), '', { duration: 3000 });
            }
          },
          error: () => {
            this.snackBar.open(this.i18n.t('relationship.loadError'), '', { duration: 3000 });
          }
        });
    } else if (edgeType === RelationshipEdgeType.Child) {
      // Person A is child of Person B - fetch parents of A to find the relationship
      this.relationshipService.getParents(personA.id)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.loadingRelationshipDetails.set(false))
        )
        .subscribe({
          next: (parents) => {
            const rel = parents.find(p => p.parentId === personB.id);
            if (rel) {
              this.editableRelationship.set({
                type: 'parent-child',
                id: rel.id,
                relationshipType: rel.relationshipType,
                notes: rel.notes || ''
              });
              this.isEditMode.set(true);
              this.isCreateMode.set(false);
            } else {
              this.snackBar.open(this.i18n.t('relationship.notFoundForEdit'), '', { duration: 3000 });
            }
          },
          error: () => {
            this.snackBar.open(this.i18n.t('relationship.loadError'), '', { duration: 3000 });
          }
        });
    } else if (edgeType === RelationshipEdgeType.Spouse) {
      // Union relationship - fetch unions of Person A to find the one with Person B
      this.relationshipService.getPersonUnions(personA.id)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.loadingRelationshipDetails.set(false))
        )
        .subscribe({
          next: (result) => {
            const union = result.items.find(u =>
              u.members.some(m => m.personId === personB.id)
            );
            if (union) {
              this.editableRelationship.set({
                type: 'union',
                id: union.id,
                relationshipType: union.type,
                notes: union.notes || ''
              });
              this.isEditMode.set(true);
              this.isCreateMode.set(false);
            } else {
              this.snackBar.open(this.i18n.t('relationship.notFoundForEdit'), '', { duration: 3000 });
            }
          },
          error: () => {
            this.snackBar.open(this.i18n.t('relationship.loadError'), '', { duration: 3000 });
          }
        });
    } else {
      this.loadingRelationshipDetails.set(false);
      this.snackBar.open(this.i18n.t('relationship.unknownType'), '', { duration: 3000 });
    }
  }

  cancelEdit(): void {
    this.isEditMode.set(false);
    this.editableRelationship.set(null);
  }

  // Update editable relationship fields
  updateEditType(type: ParentChildRelationshipType | UnionType): void {
    const current = this.editableRelationship();
    if (current) {
      this.editableRelationship.set({ ...current, relationshipType: type });
    }
  }

  updateEditNotes(notes: string): void {
    const current = this.editableRelationship();
    if (current) {
      this.editableRelationship.set({ ...current, notes });
    }
  }

  saveRelationship(): void {
    const editing = this.editableRelationship();
    if (!editing || !editing.id) {
      this.snackBar.open(this.i18n.t('relationship.noRelationshipToEdit'), '', { duration: 3000 });
      return;
    }

    this.savingRelationship.set(true);

    if (editing.type === 'parent-child') {
      this.relationshipService.updateRelationship(editing.id, {
        relationshipType: editing.relationshipType as ParentChildRelationshipType,
        notes: editing.notes || undefined
      })
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.savingRelationship.set(false))
        )
        .subscribe({
          next: () => {
            this.snackBar.open(this.i18n.t('relationship.saved'), '', { duration: 3000 });
            this.isEditMode.set(false);
            this.editableRelationship.set(null);
            this.findRelationship(); // Refresh
          },
          error: (err) => {
            this.snackBar.open(err.error?.message || this.i18n.t('relationship.saveError'), '', { duration: 3000 });
          }
        });
    } else if (editing.type === 'union') {
      this.relationshipService.updateUnion(editing.id, {
        type: editing.relationshipType as UnionType,
        notes: editing.notes || undefined
      })
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.savingRelationship.set(false))
        )
        .subscribe({
          next: () => {
            this.snackBar.open(this.i18n.t('relationship.saved'), '', { duration: 3000 });
            this.isEditMode.set(false);
            this.editableRelationship.set(null);
            this.findRelationship(); // Refresh
          },
          error: (err) => {
            this.snackBar.open(err.error?.message || this.i18n.t('relationship.saveError'), '', { duration: 3000 });
          }
        });
    }
  }

  // Create new relationship
  startCreateRelationship(): void {
    this.isCreateMode.set(true);
    this.isEditMode.set(false);
    this.newRelationshipCategory.set(null);
    this.newParentChildType.set(ParentChildRelationshipType.Biological);
    this.newUnionType.set(UnionType.Marriage);
    this.newRelationshipNotes.set('');
    this.parentChildDirection.set('a-is-parent');
  }

  cancelCreate(): void {
    this.isCreateMode.set(false);
    this.newRelationshipCategory.set(null);
  }

  selectRelationshipCategory(category: RelationshipCategory): void {
    this.newRelationshipCategory.set(category);
  }

  setParentChildDirection(direction: ParentChildDirection): void {
    this.parentChildDirection.set(direction);
  }

  createRelationship(): void {
    const personA = this.selectedPersonA();
    const personB = this.selectedPersonB();
    const category = this.newRelationshipCategory();

    if (!personA || !personB || !category || this.creatingRelationship()) {
      return;
    }

    this.creatingRelationship.set(true);

    if (category === 'parent-child') {
      const direction = this.parentChildDirection();
      const parentId = direction === 'a-is-parent' ? personA.id : personB.id;
      const childId = direction === 'a-is-parent' ? personB.id : personA.id;

      this.relationshipService.addParent(childId, parentId, {
        relationshipType: this.newParentChildType(),
        notes: this.newRelationshipNotes() || undefined
      })
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.creatingRelationship.set(false))
        )
        .subscribe({
          next: () => {
            this.snackBar.open(this.i18n.t('relationship.created'), '', { duration: 3000 });
            this.isCreateMode.set(false);
            this.findRelationship(); // Refresh to show new relationship
          },
          error: (err) => {
            this.snackBar.open(err.error?.message || this.i18n.t('relationship.createError'), '', { duration: 3000 });
          }
        });
    } else if (category === 'union') {
      const request: CreateUnionRequest = {
        type: this.newUnionType(),
        notes: this.newRelationshipNotes() || undefined,
        memberIds: [personA.id, personB.id]
      };

      this.relationshipService.createUnion(request)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.creatingRelationship.set(false))
        )
        .subscribe({
          next: () => {
            this.snackBar.open(this.i18n.t('relationship.created'), '', { duration: 3000 });
            this.isCreateMode.set(false);
            this.findRelationship(); // Refresh to show new relationship
          },
          error: (err) => {
            this.snackBar.open(err.error?.message || this.i18n.t('relationship.createError'), '', { duration: 3000 });
          }
        });
    }
  }

  // Helper methods
  getPersonDisplayName(person: SearchPersonItem | null): string {
    return person ? getPrimaryName(person) : this.i18n.t('common.unknown');
  }

  getPersonLineageName(person: SearchPersonItem | null): string {
    if (!person) return this.i18n.t('common.unknown');

    const lang = this.i18n.currentLang();
    const parts: string[] = [];

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

    if (name) parts.push(name);
    if (fatherName) parts.push(fatherName);
    if (grandfatherName) parts.push(grandfatherName);

    return parts.join(' ') || this.i18n.t('common.unknown');
  }

  getPersonFullDisplayName(person: SearchPersonItem | null): string {
    if (!person) return this.i18n.t('common.unknown');

    let result = this.getPersonLineageName(person);

    if (person.treeName) {
      result += ` - (${person.treeName})`;
    }

    const locationName = this.getLocationDisplayName(person);
    if (locationName) {
      result += ` - (${locationName})`;
    }

    return result;
  }

  getLocationDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();

    let townName = '';
    if (lang === 'ar') {
      townName = person.townNameAr || person.townNameEn || person.townName || '';
    } else if (lang === 'nob') {
      townName = person.townName || person.townNameEn || person.townNameAr || '';
    } else {
      townName = person.townNameEn || person.townName || person.townNameAr || '';
    }

    if (townName) return townName;

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

  getRelationshipTypeName(type: ParentChildRelationshipType): string {
    return this.relationshipService.getRelationshipTypeName(type);
  }

  getUnionTypeName(type: UnionType): string {
    return this.relationshipService.getUnionTypeName(type);
  }

  getPathNodeName(node: PathPersonNode): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') {
      return node.nameArabic || node.primaryName;
    } else if (lang === 'nob') {
      return node.nameNobiin || node.primaryName;
    }
    // For English, prefer nameEnglish, then primaryName (don't mix in Arabic)
    return node.nameEnglish || node.primaryName;
  }

  getEdgeLabel(edgeType: RelationshipEdgeType | number | string): string {
    // Handle both numeric and string enum values (JSON serialization can vary)
    const numericType = typeof edgeType === 'string' ? parseInt(edgeType, 10) : edgeType;
    switch (numericType) {
      case RelationshipEdgeType.Parent:
      case 1:
        return this.i18n.t('relationship.parent');
      case RelationshipEdgeType.Child:
      case 2:
        return this.i18n.t('relationship.child');
      case RelationshipEdgeType.Spouse:
      case 3:
        return this.i18n.t('relationship.spouse');
      default:
        return '';
    }
  }

  /**
   * Get a translated relationship label with multi-level fallback.
   * Uses the new helper that tries: DB type ID -> i18n key -> "Unknown"
   */
  getRelationshipLabel(key: string | undefined | null, typeId?: number | null): string {
    // Use the helper with multi-level fallback
    return getRelationshipDisplayNameHelper(
      typeId,
      key,
      this.relationshipTypeService,
      this.i18n
    );
  }

  /**
   * Check if a relationship key has a valid value
   */
  hasRelationshipKey(key: string | undefined | null): boolean {
    return !!key && key.length > 0 && key !== 'relationship.';
  }

  /**
   * Get the best available relationship label for a path node.
   * Uses multi-level fallback:
   * 1) DB type ID (new system)
   * 2) i18n key (legacy system)
   * 3) Edge type label
   * 4) Hardcoded fallback
   */
  getNodeRelationshipLabel(node: PathPersonNode): string {
    // First try the new DB-based system with type ID
    if (node.relationshipTypeId != null && node.relationshipTypeId > 0) {
      const name = this.relationshipTypeService.getLocalizedNameById(node.relationshipTypeId);
      if (name && name !== 'Unknown' && name !== this.i18n.t('common.unknown')) {
        return name;
      }
    }

    // Try the specific relationship key (e.g., "father of", "mother of")
    if (node.relationshipToNextKey && node.relationshipToNextKey.length > 0) {
      const translated = this.i18n.t(node.relationshipToNextKey);
      if (translated && translated !== node.relationshipToNextKey) {
        return translated;
      }

      // Try to find type by i18n key pattern in DB
      const type = this.relationshipTypeService.getTypeByI18nKey(node.relationshipToNextKey);
      if (type) {
        return this.relationshipTypeService.getLocalizedName(type);
      }
    }

    // Fallback to generic edge type (e.g., "Parent", "Child", "Spouse")
    const edgeLabel = this.getEdgeLabel(node.edgeToNext);
    if (edgeLabel) {
      return edgeLabel;
    }

    // Last resort - check if edgeToNext has any value and return hardcoded label
    const edgeType = typeof node.edgeToNext === 'string' ? parseInt(node.edgeToNext as string, 10) : node.edgeToNext;
    if (edgeType === 1) return 'Parent';
    if (edgeType === 2) return 'Child';
    if (edgeType === 3) return 'Spouse';

    return '';
  }

  /**
   * Get label describing what the CURRENT person is relative to the NEXT person.
   * This is the inverse of getNodeRelationshipLabel, used for left branch labels.
   *
   * Example: If edgeToNext says "next is PARENT of current" (going UP),
   * this returns what CURRENT is to NEXT: "Son Of" or "Daughter Of"
   */
  getInverseRelationshipLabel(node: PathPersonNode): string {
    const edgeType = typeof node.edgeToNext === 'string' ? parseInt(node.edgeToNext as string, 10) : node.edgeToNext;

    // edgeToNext == Parent (1): NEXT is parent of CURRENT → CURRENT is child of NEXT
    if (edgeType === RelationshipEdgeType.Parent || edgeType === 1) {
      // Return "Son Of" or "Daughter Of" based on CURRENT node's sex
      if (node.sex === Sex.Male) {
        return this.i18n.t('relationship.sonOf');
      } else if (node.sex === Sex.Female) {
        return this.i18n.t('relationship.daughterOf');
      }
      return this.i18n.t('relationship.childOf');
    }

    // edgeToNext == Child (2): NEXT is child of CURRENT → CURRENT is parent of NEXT
    if (edgeType === RelationshipEdgeType.Child || edgeType === 2) {
      // Return "Father Of" or "Mother Of" based on CURRENT node's sex
      if (node.sex === Sex.Male) {
        return this.i18n.t('relationship.fatherOf');
      } else if (node.sex === Sex.Female) {
        return this.i18n.t('relationship.motherOf');
      }
      return this.i18n.t('relationship.parentOf');
    }

    // edgeToNext == Spouse (3): Symmetric relationship
    if (edgeType === RelationshipEdgeType.Spouse || edgeType === 3) {
      return this.i18n.t('relationship.spouseOf');
    }

    return '';
  }

  // Swap persons A and B
  swapPersons(): void {
    const personA = this.selectedPersonA();
    const personB = this.selectedPersonB();
    this.selectedPersonA.set(personB);
    this.selectedPersonB.set(personA);
    this.clearRelationshipState();
  }

  // Set path view mode
  setPathViewMode(mode: PathViewMode): void {
    this.pathViewMode.set(mode);
  }

  /**
   * Calculate tree layout positions for the path nodes
   * Returns nodes positioned in a V-shape with common ancestor at top
   */
  getTreeLayoutNodes(): Array<{ node: PathPersonNode; x: number; y: number; level: number; isPeak: boolean }> {
    const path = this.relationshipPath()?.path;
    if (!path || path.length < 2) return [];

    // Use the centralized peak detection
    const peakIndex = this.getPeakIndex();

    const nodeWidth = 100;
    const horizontalGap = 40;
    const verticalGap = 80;
    const centerX = 50; // percentage

    return path.map((node, i) => {
      const isPeak = i === peakIndex;
      const isLeftBranch = i < peakIndex;
      const distFromPeak = Math.abs(i - peakIndex);

      let x: number;
      let y: number;

      if (isPeak) {
        x = centerX;
        y = 0;
      } else if (isLeftBranch) {
        x = centerX - (distFromPeak * (nodeWidth + horizontalGap) / 2);
        y = distFromPeak * verticalGap;
      } else {
        x = centerX + (distFromPeak * (nodeWidth + horizontalGap) / 2);
        y = distFromPeak * verticalGap;
      }

      return { node, x, y, level: distFromPeak, isPeak };
    });
  }

  /**
   * Get the peak index (common ancestor) in the path
   * First tries to use the commonAncestorId from backend response,
   * then falls back to edge-based calculation.
   *
   * Edge types from backend (edgeToNext describes what NEXT person IS relative to current):
   * - Parent (1): NEXT person IS the parent of current (going UP the tree)
   * - Child (2): NEXT person IS the child of current (going DOWN the tree)
   * - Spouse (3): Spouse relationship
   */
  getPeakIndex(): number {
    const response = this.relationshipPath();
    const path = response?.path;
    if (!path || path.length < 2) return 0;

    // First, try to use the commonAncestorId from the backend
    if (response?.commonAncestorId) {
      const ancestorIndex = path.findIndex(p => p.id === response.commonAncestorId);
      if (ancestorIndex >= 0) {
        return ancestorIndex;
      }
    }

    // Also check commonAncestors array
    if (response?.commonAncestors && response.commonAncestors.length > 0) {
      const ancestorId = response.commonAncestors[0].personId;
      const ancestorIndex = path.findIndex(p => p.id === ancestorId);
      if (ancestorIndex >= 0) {
        return ancestorIndex;
      }
    }

    // Fallback: Find the transition point from going up to going down
    //
    // IMPORTANT: The backend sets edgeToNext to describe what the NEXT person IS relative to current:
    // - edgeToNext == Parent: NEXT person IS the parent of current → we're going UP
    // - edgeToNext == Child: NEXT person IS the child of current → we're going DOWN
    //
    // The peak is the last person we reach while going UP (Parent edges)
    let peakIndex = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const edge = path[i].edgeToNext;
      const edgeNum = typeof edge === 'string' ? parseInt(edge, 10) : edge;

      // If NEXT person IS the parent of current (Parent edge), we're going UP
      // The NEXT person could be the peak
      if (edgeNum === RelationshipEdgeType.Parent || edgeNum === 1) {
        peakIndex = i + 1;
      }
      // Once NEXT person IS the child of current (Child edge), we're going DOWN - peak was found
      else if (edgeNum === RelationshipEdgeType.Child || edgeNum === 2 ||
               edgeNum === RelationshipEdgeType.Spouse || edgeNum === 3) {
        break;
      }
    }

    if (peakIndex === 0 && path.length > 2) {
      peakIndex = Math.floor(path.length / 2);
    }
    return peakIndex;
  }

  /**
   * Get the left branch of the tree (from Person A up to common ancestor, excluding peak)
   */
  getLeftBranch(): Array<{ node: PathPersonNode; index: number }> {
    const path = this.relationshipPath()?.path;
    if (!path || path.length < 2) return [];

    const peakIndex = this.getPeakIndex();
    // Return nodes from 0 to peakIndex-1 (Person A going up)
    return path.slice(0, peakIndex).map((node, index) => ({ node, index }));
  }

  /**
   * Get the left branch reversed (from peak down to Person A)
   * Used for tree view to show descendants from peak going down
   */
  getLeftBranchReversed(): Array<{ node: PathPersonNode; index: number }> {
    const leftBranch = this.getLeftBranch();
    // Reverse so we go from closest-to-peak down to Person A
    return [...leftBranch].reverse();
  }

  /**
   * Get the peak node (common ancestor)
   */
  getPeakNode(): PathPersonNode | null {
    const path = this.relationshipPath()?.path;
    if (!path || path.length < 2) return null;

    const peakIndex = this.getPeakIndex();
    return path[peakIndex] || null;
  }

  /**
   * Get the right branch of the tree (from common ancestor down to Person B, excluding peak)
   */
  getRightBranch(): Array<{ node: PathPersonNode; index: number }> {
    const path = this.relationshipPath()?.path;
    if (!path || path.length < 2) return [];

    const peakIndex = this.getPeakIndex();
    // Return nodes from peakIndex+1 to end (going down to Person B)
    return path.slice(peakIndex + 1).map((node, index) => ({ node, index: peakIndex + 1 + index }));
  }

  /**
   * Get the previous node in the right branch (for edge labels)
   */
  getPrevRightNode(rightBranchIndex: number): PathPersonNode | null {
    const path = this.relationshipPath()?.path;
    if (!path) return null;

    const peakIndex = this.getPeakIndex();
    const pathIndex = peakIndex + rightBranchIndex;
    return path[pathIndex] || null;
  }

  /**
   * Get the descendant label for a node.
   * This describes what the person IS (e.g., "Daughter", "Son").
   * Used for showing the relationship from ancestor to descendants.
   */
  getDescendantLabel(node: PathPersonNode): string {
    if (node.sex === Sex.Male) {
      return this.i18n.t('relationship.son');
    } else if (node.sex === Sex.Female) {
      return this.i18n.t('relationship.daughter');
    }
    return this.i18n.t('relationship.child');
  }

  /**
   * Get the descendant label for the NEXT node at the given index.
   * Used for connectors between nodes on the right branch.
   */
  getDescendantLabelForNext(currentIndex: number): string {
    const path = this.relationshipPath()?.path;
    if (!path || currentIndex + 1 >= path.length) return '';

    const nextNode = path[currentIndex + 1];
    return this.getDescendantLabel(nextNode);
  }

  /**
   * Handle avatar image load error - hide the broken image
   */
  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
    }
  }

  /**
   * Zoom in the tree view
   */
  zoomIn(): void {
    const current = this.treeZoom();
    if (current < 1.5) {
      this.treeZoom.set(Math.min(1.5, current + 0.1));
    }
  }

  /**
   * Zoom out the tree view
   */
  zoomOut(): void {
    const current = this.treeZoom();
    if (current > 0.5) {
      this.treeZoom.set(Math.max(0.5, current - 0.1));
    }
  }

  /**
   * Reset tree zoom to 100%
   */
  resetZoom(): void {
    this.treeZoom.set(1);
  }
}
