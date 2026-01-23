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

type RelationshipCategory = 'parent-child' | 'union' | null;

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
      return node.nameArabic || node.nameEnglish || node.primaryName;
    } else if (lang === 'nob') {
      return node.nameNobiin || node.nameEnglish || node.primaryName;
    }
    return node.nameEnglish || node.nameArabic || node.primaryName;
  }

  getEdgeLabel(edgeType: RelationshipEdgeType): string {
    switch (edgeType) {
      case RelationshipEdgeType.Parent:
        return this.i18n.t('relationship.parent');
      case RelationshipEdgeType.Child:
        return this.i18n.t('relationship.child');
      case RelationshipEdgeType.Spouse:
        return this.i18n.t('relationship.spouse');
      default:
        return '';
    }
  }

  // Swap persons A and B
  swapPersons(): void {
    const personA = this.selectedPersonA();
    const personB = this.selectedPersonB();
    this.selectedPersonA.set(personB);
    this.selectedPersonB.set(personA);
    this.clearRelationshipState();
  }
}
