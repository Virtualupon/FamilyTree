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
import { debounceTime } from 'rxjs/operators';
import { Observable } from 'rxjs';

import { Sex } from '../../core/models/person.models';
import { SearchPersonItem } from '../../core/models/search.models';
import { PersonSearchComponent } from '../../shared/components/person-search/person-search.component';
import {
  RelationshipService,
  ParentChildRelationshipType,
  UnionType,
  CreateUnionRequest
} from '../../core/services/relationship.service';
import { FamilyRelationshipTypeService } from '../../core/services/family-relationship-type.service';
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
  template: `
    <h2 mat-dialog-title>
      @switch (data.type) {
        @case ('parent') { {{ 'relationships.addParent' | translate }} }
        @case ('child') { {{ 'relationships.addChild' | translate }} }
        @case ('spouse') { {{ 'relationships.addSpouse' | translate }} }
        @case ('sibling') { {{ 'relationships.addSibling' | translate }} }
      }
    </h2>

    <mat-dialog-content>
      <!-- Person Search with optional Town/Nationality filters -->
      <app-person-search
        [excludePersonId]="data.personId"
        [placeholder]="'relationships.typeNameSearch' | translate"
        (personSelected)="onPersonSelectedFromSearch($event)">
      </app-person-search>

      <!-- Parent Selection for Sibling type -->
      @if (data.type === 'sibling' && data.parents && data.parents.length > 0) {
        <div class="parent-selection-section">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'relationships.selectSharedParent' | translate }}</mat-label>
            <mat-select (selectionChange)="onParentSelected($event.value)" [value]="selectedParentId()">
              @for (parent of data.parents; track parent.id) {
                <mat-option [value]="parent.id">
                  <div class="parent-option">
                    <i class="fa-solid" [ngClass]="[getSexIcon(parent.sex), getSexClass(parent.sex)]" aria-hidden="true"></i>
                    <span>{{ getParentDisplayName(parent) }}</span>
                  </div>
                </mat-option>
              }
            </mat-select>
            <i class="fa-solid fa-users" matPrefix aria-hidden="true" style="margin-right: 8px;"></i>
          </mat-form-field>
          <p class="parent-hint">
            {{ 'relationships.siblingParentHint' | translate }}
          </p>
        </div>
      }

      @if (data.type === 'sibling' && (!data.parents || data.parents.length === 0)) {
        <div class="no-parents-warning">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <p>{{ 'relationships.noParentsWarning' | translate }}</p>
        </div>
      }

      <!-- Family Relationship Label (Trilingual) -->
      <div class="relationship-label-section">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'relationships.familyRelationship' | translate }} ({{ getRelationshipExamples() }})</mat-label>
          <input matInput
                 [formControl]="familyRelTypeSearchControl"
                 [matAutocomplete]="relTypeAuto"
                 [placeholder]="'relationships.typeSearchMultiLang' | translate">
          <i class="fa-solid fa-language" matSuffix aria-hidden="true"></i>
          <mat-autocomplete #relTypeAuto="matAutocomplete"
                           [displayWith]="displayRelType.bind(this)"
                           (optionSelected)="onRelTypeSelected($event.option.value)">
            @for (type of filteredRelTypes(); track type.id) {
              <mat-option [value]="type">
                <div class="rel-type-option">
                  <span class="english">{{ type.nameEnglish }}</span>
                  <span class="arabic">{{ type.nameArabic }}</span>
                  <span class="nubian" [matTooltip]="('relationships.nubian' | translate) + ': ' + type.nameNubian">{{ type.nameNubian }}</span>
                </div>
              </mat-option>
            }
            @if (familyRelTypesLoading()) {
              <mat-option disabled>
                <mat-spinner diameter="20"></mat-spinner>
                {{ 'common.loading' | translate }}
              </mat-option>
            }
          </mat-autocomplete>
          @if (selectedRelType()) {
            <button mat-icon-button matSuffix (click)="clearRelTypeSelection($event)" [matTooltip]="'common.clearSelection' | translate">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          }
        </mat-form-field>

        @if (selectedRelType()) {
          <div class="selected-rel-type">
            <mat-chip-row>
              <span class="trilingual-label">
                <strong>{{ selectedRelType()?.nameEnglish }}</strong>
                <span class="separator">|</span>
                <span class="arabic-text">{{ selectedRelType()?.nameArabic }}</span>
                <span class="separator">|</span>
                <span class="nubian-text">{{ selectedRelType()?.nameNubian }}</span>
              </span>
            </mat-chip-row>
          </div>
        }
      </div>

      <!-- Parent/Child/Sibling specific options -->
      @if (data.type === 'parent' || data.type === 'child' || data.type === 'sibling') {
        <div class="relationship-options">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'relationships.relationshipNature' | translate }}</mat-label>
            <mat-select [formControl]="relationshipTypeControl">
              <mat-option [value]="ParentChildRelationshipType.Biological">{{ 'relationships.biological' | translate }}</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Adopted">{{ 'relationships.adopted' | translate }}</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Foster">{{ 'relationships.foster' | translate }}</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Step">{{ 'relationships.step' | translate }}</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Guardian">{{ 'relationships.guardian' | translate }}</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Unknown">{{ 'common.unknown' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      }

      <!-- Spouse specific options -->
      @if (data.type === 'spouse') {
        <div class="union-options">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'relationships.unionType' | translate }}</mat-label>
            <mat-select [formControl]="unionTypeControl">
              <mat-option [value]="UnionType.Marriage">{{ 'unions.marriage' | translate }}</mat-option>
              <mat-option [value]="UnionType.CivilUnion">{{ 'unions.civilUnion' | translate }}</mat-option>
              <mat-option [value]="UnionType.DomesticPartnership">{{ 'unions.domesticPartnership' | translate }}</mat-option>
              <mat-option [value]="UnionType.CommonLaw">{{ 'unions.commonLaw' | translate }}</mat-option>
              <mat-option [value]="UnionType.Engagement">{{ 'unions.engagement' | translate }}</mat-option>
              <mat-option [value]="UnionType.Unknown">{{ 'common.unknown' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="date-row">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'relationships.startDate' | translate }}</mat-label>
              <input matInput [matDatepicker]="startPicker" [formControl]="startDateControl">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'relationships.endDate' | translate }}</mat-label>
              <input matInput [matDatepicker]="endPicker" [formControl]="endDateControl">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </div>
      }

      <!-- Notes -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ 'common.notesOptional' | translate }}</mat-label>
        <textarea matInput [formControl]="notesControl" rows="2"></textarea>
      </mat-form-field>

      @if (error()) {
        <div class="error-message">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
          {{ error() }}
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-raised-button
              color="primary"
              [disabled]="!canSave()"
              (click)="save()">
        @if (isSaving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          {{ 'common.add' | translate }} {{ getRelationshipLabel() }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 400px;
      max-width: 500px;
    }

    .full-width {
      width: 100%;
    }

    .town-section {
      margin-bottom: 16px;
    }

    .town-hint {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.54);
      margin-top: -12px;
      margin-bottom: 16px;
    }

    .search-section {
      margin-bottom: 16px;
    }

    .person-option {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .person-option .name {
      font-weight: 500;
    }

    .person-option .dates {
      color: rgba(0, 0, 0, 0.6);
      font-size: 12px;
    }

    i.sex-icon {
      font-size: 16px;
      width: 18px;
      height: 18px;
    }

    i.sex-icon.male {
      color: #1976d2;
    }

    i.sex-icon.female {
      color: #e91e63;
    }

    .selected-person {
      margin-bottom: 16px;
    }

    .relationship-options,
    .union-options {
      margin-bottom: 16px;
    }

    .date-row {
      display: flex;
      gap: 16px;
    }

    .date-row mat-form-field {
      flex: 1;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #f44336;
      padding: 8px;
      background: #ffebee;
      border-radius: 4px;
      margin-top: 16px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    mat-spinner {
      display: inline-block;
    }

    .relationship-label-section {
      margin-bottom: 16px;
    }

    .rel-type-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 0;
    }

    .rel-type-option .english {
      font-weight: 500;
      min-width: 140px;
    }

    .rel-type-option .arabic {
      color: #1565c0;
      font-size: 14px;
      direction: rtl;
      min-width: 80px;
    }

    .rel-type-option .nubian {
      color: #7b1fa2;
      font-size: 13px;
    }

    .selected-rel-type {
      margin-top: 8px;
    }

    .trilingual-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .trilingual-label .separator {
      color: rgba(0, 0, 0, 0.38);
    }

    .trilingual-label .arabic-text {
      color: #1565c0;
      direction: rtl;
    }

    .trilingual-label .nubian-text {
      color: #7b1fa2;
    }

    /* Ensure dialog content doesn't clip dropdowns */
    .add-relationship-dialog .mat-mdc-dialog-content {
      overflow: visible;
    }

    /* Ensure select panels appear above dialog */
    .cdk-overlay-container {
      z-index: 1100 !important;
    }

    .mat-mdc-select-panel {
      z-index: 1100 !important;
    }

    .parent-selection-section {
      margin-bottom: 16px;
    }

    .parent-hint {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.54);
      margin-top: -12px;
      margin-bottom: 16px;
    }

    .parent-option {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .no-parents-warning {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: #fff3e0;
      border-radius: 4px;
      border: 1px solid #ffb74d;
      margin-bottom: 16px;
    }

    .no-parents-warning i {
      color: #f57c00;
      font-size: 20px;
    }

    .no-parents-warning p {
      margin: 0;
      color: #e65100;
    }
  `]
})
export class AddRelationshipDialogComponent implements OnInit {
  private relationshipService = inject(RelationshipService);
  private familyRelTypeService = inject(FamilyRelationshipTypeService);
  private i18n = inject(I18nService);

  // Expose enums to template
  ParentChildRelationshipType = ParentChildRelationshipType;
  UnionType = UnionType;
  Sex = Sex;

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
    return `${relType.nameEnglish} (${relType.nameArabic})`;
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
        this.isSaving.set(false);
        this.dialogRef.close({ success: true, result });
      },
      error: (err: any) => {
        this.isSaving.set(false);
        const message = err.error?.message || err.message || this.i18n.t('relationships.failedAdd');
        this.error.set(message);
      }
    });
  }
}