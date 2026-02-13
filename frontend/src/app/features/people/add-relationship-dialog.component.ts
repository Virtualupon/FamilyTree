import { Component, Inject, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, switchMap } from 'rxjs/operators';
import { Observable, forkJoin, of } from 'rxjs';

import { Sex } from '../../core/models/person.models';
import { OrgRole } from '../../core/models/auth.models';
import { SearchPersonItem } from '../../core/models/search.models';
import { SuggestAddRelationshipRequest, ConfidenceLevel } from '../../core/models/suggestion.models';
import { PersonSearchComponent } from '../../shared/components/person-search/person-search.component';
import {
  RelationshipService,
  ParentChildRelationshipType,
  ParentChildResponse,
  SuggestedParentDto,
  SuggestedChildLinkDto,
  UnionType,
  UnionResponse,
  CreateUnionRequest
} from '../../core/services/relationship.service';
import { FamilyRelationshipTypeService } from '../../core/services/family-relationship-type.service';
import { AuthService } from '../../core/services/auth.service';
import { SuggestionService } from '../../core/services/suggestion.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { FamilyRelationshipType } from '../../core/models/family-relationship-type.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

export type RelationshipDialogType = 'parent' | 'child' | 'spouse' | 'sibling';

export interface ParentInfo {
  id: string;
  name: string;
  nameArabic?: string | null;
  nameEnglish?: string | null;
  nameNobiin?: string | null;
  sex?: Sex | null;
}

export interface RelationshipDialogData {
  personId: string;
  personName?: string | null;
  type: RelationshipDialogType;
  parents?: ParentInfo[];  // Required for sibling type
  treeId?: string;  // Tree ID for creating suggestions
}

@Component({
  selector: 'app-add-relationship-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    TranslatePipe,
    PersonSearchComponent
  ],
  templateUrl: './add-relationship-dialog.component.html',
  styleUrls: ['./add-relationship-dialog.component.scss']
})
export class AddRelationshipDialogComponent implements OnInit {
  private relationshipService = inject(RelationshipService);
  private familyRelTypeService = inject(FamilyRelationshipTypeService);
  private authService = inject(AuthService);
  private suggestionService = inject(SuggestionService);
  private treeContext = inject(TreeContextService);
  private i18n = inject(I18nService);

  // Expose enums to template
  ParentChildRelationshipType = ParentChildRelationshipType;
  UnionType = UnionType;
  Sex = Sex;

  // Computed: Check if user is a Viewer (read-only, can only create suggestions)
  isViewer = computed(() => {
    const user = this.authService.getCurrentUser();
    if (!user) return true;
    // System admins are never viewers - they can directly edit
    if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin' || user.systemRole === 'Admin') return false;
    // Regular users: need Contributor or higher org role to directly edit
    // If role is undefined or less than Contributor, they must use suggestions
    return user.role === undefined || user.role === null || user.role < OrgRole.Contributor;
  });

  // Form controls
  relationshipTypeControl = new FormControl(ParentChildRelationshipType.Biological);
  unionTypeControl = new FormControl(UnionType.Marriage);
  startDateControl = new FormControl<Date | null>(null);
  endDateControl = new FormControl<Date | null>(null);
  notesControl = new FormControl('');
  familyRelTypeSearchControl = new FormControl('');

  // State signals
  selectedPerson = signal<SearchPersonItem | null>(null);
  selectedParentId = signal<string | null>(null);
  isSaving = signal(false);
  error = signal<string | null>(null);

  // Family relationship type signals
  allRelTypes = signal<FamilyRelationshipType[]>([]);
  selectedRelType = signal<FamilyRelationshipType | null>(null);
  familyRelTypesLoading = signal(false);
  relTypeSearchTerm = signal('');

  // Computed filtered relationship types
  filteredRelTypes = computed(() => {
    const term = this.relTypeSearchTerm().toLowerCase().trim();
    const all = this.allRelTypes();

    if (!term) {
      return all;
    }

    return all.filter(type =>
      type.nameEnglish.toLowerCase().includes(term) ||
      type.nameArabic.includes(term) ||
      type.nameNubian.toLowerCase().includes(term)
    );
  });

  constructor(
    public dialogRef: MatDialogRef<AddRelationshipDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RelationshipDialogData
  ) {}

  ngOnInit() {
    this.loadFamilyRelTypes();

    // Setup family relationship type search
    this.familyRelTypeSearchControl.valueChanges.pipe(
      debounceTime(150)
    ).subscribe(value => {
      if (typeof value === 'string') {
        this.relTypeSearchTerm.set(value);
      }
    });
  }

  private loadFamilyRelTypes() {
    this.familyRelTypesLoading.set(true);
    this.familyRelTypeService.getAll().subscribe({
      next: (types) => {
        this.allRelTypes.set(types);
        this.familyRelTypesLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load family relationship types:', err);
        this.familyRelTypesLoading.set(false);
      }
    });
  }

  onPersonSelectedFromSearch(person: SearchPersonItem | null): void {
    this.selectedPerson.set(person);
  }

  displayRelType(relType: FamilyRelationshipType | null): string {
    if (!relType) return '';
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return relType.nameArabic || relType.nameEnglish || '';
      case 'nob':
        return relType.nameNubian || relType.nameEnglish || '';
      case 'en':
      default:
        return relType.nameEnglish || '';
    }
  }

  onRelTypeSelected(relType: FamilyRelationshipType) {
    this.selectedRelType.set(relType);
    this.familyRelTypeSearchControl.setValue('');
    this.relTypeSearchTerm.set('');
  }

  clearSelection() {
    this.selectedPerson.set(null);
  }

  clearRelTypeSelection(event: Event) {
    event.stopPropagation();
    this.selectedRelType.set(null);
    this.familyRelTypeSearchControl.setValue('');
    this.relTypeSearchTerm.set('');
  }

  onParentSelected(parentId: string) {
    this.selectedParentId.set(parentId);
  }

  getParentDisplayName(parent: ParentInfo): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') return parent.nameArabic || parent.nameEnglish || parent.name || unknown;
    if (lang === 'nob') return parent.nameNobiin || parent.nameEnglish || parent.name || unknown;
    return parent.nameEnglish || parent.nameArabic || parent.name || unknown;
  }

  canSave(): boolean {
    if (this.isSaving()) return false;
    if (!this.selectedPerson()) return false;

    // For sibling type, also require a parent selection
    if (this.data.type === 'sibling') {
      if (!this.data.parents || this.data.parents.length === 0) return false;
      if (!this.selectedParentId()) return false;
    }

    return true;
  }

  formatYear(dateStr?: string | null): string {
    if (!dateStr) return '?';
    const date = new Date(dateStr);
    return date.getFullYear().toString();
  }

  getSexClass(sex: Sex | null | undefined): string {
    if (sex === Sex.Male) return 'male';
    if (sex === Sex.Female) return 'female';
    return '';
  }

  getSexIcon(sex: Sex | null | undefined): string {
    if (sex === Sex.Male) return 'fa-mars';
    if (sex === Sex.Female) return 'fa-venus';
    return 'fa-user';
  }

  getRelationshipLabel(): string {
    switch (this.data.type) {
      case 'parent': return this.i18n.t('relationships.parent');
      case 'child': return this.i18n.t('relationships.child');
      case 'spouse': return this.i18n.t('relationships.spouse');
      case 'sibling': return this.i18n.t('relationships.sibling');
      default: return this.i18n.t('relationships.relationship');
    }
  }

  getRelationshipExamples(): string {
    switch (this.data.type) {
      case 'spouse': return this.i18n.t('relationships.exampleSpouse');
      case 'parent': return this.i18n.t('relationships.exampleParent');
      default: return this.i18n.t('relationships.exampleChild');
    }
  }

  save() {
    const selected = this.selectedPerson();
    if (!selected) return;

    this.isSaving.set(true);
    this.error.set(null);

    // Check if user is a viewer - use suggestion system instead
    if (this.isViewer()) {
      this.saveAsSuggestion(selected);
      return;
    }

    // Admin/Contributor path - direct API calls
    let request$: Observable<any>;

    switch (this.data.type) {
      case 'parent':
        request$ = this.relationshipService.addParent(
          this.data.personId,
          selected.id,
          {
            relationshipType: this.relationshipTypeControl.value ?? ParentChildRelationshipType.Biological,
            isBiological: this.relationshipTypeControl.value === ParentChildRelationshipType.Biological,
            isAdopted: this.relationshipTypeControl.value === ParentChildRelationshipType.Adopted,
            notes: this.notesControl.value || undefined
          }
        );
        break;

      case 'child':
        request$ = this.relationshipService.addChild(
          this.data.personId,
          selected.id,
          {
            relationshipType: this.relationshipTypeControl.value ?? ParentChildRelationshipType.Biological,
            isBiological: this.relationshipTypeControl.value === ParentChildRelationshipType.Biological,
            isAdopted: this.relationshipTypeControl.value === ParentChildRelationshipType.Adopted,
            notes: this.notesControl.value || undefined
          }
        );
        break;

      case 'spouse':
        const unionRequest: CreateUnionRequest = {
          type: this.unionTypeControl.value ?? UnionType.Marriage,
          memberIds: [this.data.personId, selected.id],
          startDate: this.startDateControl.value?.toISOString(),
          endDate: this.endDateControl.value?.toISOString(),
          notes: this.notesControl.value || undefined
        };
        request$ = this.relationshipService.createUnion(unionRequest);
        break;

      case 'sibling':
        // Adding a sibling means adding them as a child of the shared parent
        const parentId = this.selectedParentId();
        if (!parentId) {
          this.error.set(this.i18n.t('relationships.selectSharedParentError'));
          this.isSaving.set(false);
          return;
        }
        // Create parent-child relationship between selected parent and the new sibling
        request$ = this.relationshipService.addChild(
          parentId,
          selected.id,
          {
            relationshipType: this.relationshipTypeControl.value ?? ParentChildRelationshipType.Biological,
            isBiological: this.relationshipTypeControl.value === ParentChildRelationshipType.Biological,
            isAdopted: this.relationshipTypeControl.value === ParentChildRelationshipType.Adopted,
            notes: this.notesControl.value || undefined
          }
        );
        break;

      default:
        this.error.set(this.i18n.t('relationships.unknownType'));
        this.isSaving.set(false);
        return;
    }

    request$.subscribe({
      next: (result: any) => {
        // Handle auto-inference: check for suggested additional parents or child links
        this.handleAutoInferenceSuggestions(result);
      },
      error: (err: any) => {
        this.isSaving.set(false);
        const message = err.error?.message || err.message || this.i18n.t('relationships.failedAdd');
        this.error.set(message);
      }
    });
  }

  /**
   * After a relationship is created, check if the backend suggests additional links.
   * For parent/child/sibling: suggestedAdditionalParents (spouse who could also be a parent)
   * For spouse: suggestedChildLinks (children who could be linked to the new spouse)
   * Auto-create these additional links silently (user already intends the full family group).
   */
  private handleAutoInferenceSuggestions(result: any): void {
    const type = this.data.type;

    // For sibling: auto-link to all suggested additional parents (the other parent in the union)
    if (type === 'sibling' && result?.suggestedAdditionalParents?.length > 0) {
      const selected = this.selectedPerson();
      if (!selected) {
        this.isSaving.set(false);
        this.dialogRef.close({ success: true, result });
        return;
      }
      const additionalCalls = (result.suggestedAdditionalParents as SuggestedParentDto[])
        .map(sp => this.relationshipService.addChild(sp.personId, selected.id, {
          relationshipType: this.relationshipTypeControl.value ?? ParentChildRelationshipType.Biological,
          isBiological: this.relationshipTypeControl.value === ParentChildRelationshipType.Biological,
          isAdopted: this.relationshipTypeControl.value === ParentChildRelationshipType.Adopted
        }));

      forkJoin(additionalCalls).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.dialogRef.close({ success: true, result, additionalLinksCreated: true });
        },
        error: (err) => {
          // Primary link succeeded, additional failed — still close as success
          console.warn('Additional parent links failed (non-critical):', err);
          this.isSaving.set(false);
          this.dialogRef.close({ success: true, result, additionalLinksCreated: false });
        }
      });
      return;
    }

    // For parent/child: pass suggestions back to the caller to show in the UI
    if ((type === 'parent' || type === 'child') && result?.suggestedAdditionalParents?.length > 0) {
      this.isSaving.set(false);
      this.dialogRef.close({
        success: true,
        result,
        suggestedAdditionalParents: result.suggestedAdditionalParents as SuggestedParentDto[]
      });
      return;
    }

    // For spouse: pass child link suggestions back to the caller to show in the UI
    if (type === 'spouse' && result?.suggestedChildLinks?.length > 0) {
      this.isSaving.set(false);
      this.dialogRef.close({
        success: true,
        result,
        suggestedChildLinks: result.suggestedChildLinks as SuggestedChildLinkDto[]
      });
      return;
    }

    // No suggestions — just close normally
    this.isSaving.set(false);
    this.dialogRef.close({ success: true, result });
  }

  /**
   * Save as a suggestion (for viewers who cannot directly add relationships)
   */
  private saveAsSuggestion(selected: SearchPersonItem): void {
    // Get tree ID from dialog data (passed from person being viewed) or fall back to tree context
    const treeId = this.data.treeId || this.treeContext.effectiveTreeId();
    if (!treeId) {
      this.error.set(this.i18n.t('relationships.noTreeSelected'));
      this.isSaving.set(false);
      return;
    }

    let suggestionRequest: SuggestAddRelationshipRequest;

    switch (this.data.type) {
      case 'parent':
        // Adding a parent: person1 (selected) is parent of person2 (data.personId)
        suggestionRequest = {
          treeId,
          person1Id: selected.id,
          person2Id: this.data.personId,
          relationshipType: 'parent-child',
          person1IsParent: true,
          confidence: ConfidenceLevel.Probable,
          submitterNotes: this.notesControl.value || undefined
        };
        break;

      case 'child':
        // Adding a child: person1 (data.personId) is parent of person2 (selected)
        suggestionRequest = {
          treeId,
          person1Id: this.data.personId,
          person2Id: selected.id,
          relationshipType: 'parent-child',
          person1IsParent: true,
          confidence: ConfidenceLevel.Probable,
          submitterNotes: this.notesControl.value || undefined
        };
        break;

      case 'spouse':
        suggestionRequest = {
          treeId,
          person1Id: this.data.personId,
          person2Id: selected.id,
          relationshipType: 'spouse',
          marriageDate: this.startDateControl.value?.toISOString(),
          confidence: ConfidenceLevel.Probable,
          submitterNotes: this.notesControl.value || undefined
        };
        break;

      case 'sibling':
        // Adding a sibling: suggest adding selected as child of the shared parent
        const parentId = this.selectedParentId();
        if (!parentId) {
          this.error.set(this.i18n.t('relationships.selectSharedParentError'));
          this.isSaving.set(false);
          return;
        }
        suggestionRequest = {
          treeId,
          person1Id: parentId,
          person2Id: selected.id,
          relationshipType: 'parent-child',
          person1IsParent: true,
          confidence: ConfidenceLevel.Probable,
          submitterNotes: this.notesControl.value || undefined
        };
        break;

      default:
        this.error.set(this.i18n.t('relationships.unknownType'));
        this.isSaving.set(false);
        return;
    }

    this.suggestionService.suggestAddRelationship(suggestionRequest).subscribe({
      next: (result) => {
        this.isSaving.set(false);
        this.dialogRef.close({
          success: true,
          result,
          isSuggestion: true,
          message: this.i18n.t('suggestion.createSuccess')
        });
      },
      error: (err: any) => {
        this.isSaving.set(false);
        const message = err.error?.message || err.message || this.i18n.t('suggestion.createError');
        this.error.set(message);
      }
    });
  }
}