import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PersonSearchService } from '../../core/services/person-search.service';
import { RelationshipService, AddParentChildRequest, ParentChildRelationshipType } from '../../core/services/relationship.service';
import { FamilyRelationshipTypeService } from '../../core/services/family-relationship-type.service';
import { I18nService, TranslatePipe, Language } from '../../core/i18n';
import { Sex, PersonListItem } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName } from '../../core/models/search.models';
import { TreePersonNode } from '../../core/models/tree.models';
import { 
  FamilyRelationshipType, 
  FamilyRelationshipTypeGrouped,
  getRelationshipName
} from '../../core/models/family-relationship-type.models';

export type RelationshipEditorMode = 'create' | 'edit';
export type RelationshipDirection = 'parent' | 'child' | 'spouse';

export interface RelationshipEditorDialogData {
  person: TreePersonNode | PersonListItem;
  mode: RelationshipEditorMode;
  direction?: RelationshipDirection;
  existingRelationship?: {
    id: string;
    relatedPerson: PersonListItem;
    relationshipTypeId?: number;
  };
}

export interface RelationshipEditorDialogResult {
  success: boolean;
  action: 'created' | 'updated' | 'deleted';
  relationship?: {
    personId: string;
    relatedPersonId: string;
    relationshipTypeId?: number;
    direction: RelationshipDirection;
  };
}

@Component({
  selector: 'app-relationship-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatRippleModule,
    TranslatePipe
  ],
  template: `
    <div class="relationship-editor">
      <!-- Header -->
      <div class="relationship-editor__header">
        <h2 class="relationship-editor__title">
          @if (data.mode === 'create') {
            {{ 'relationshipEditor.createTitle' | translate }}
          } @else {
            {{ 'relationshipEditor.editTitle' | translate }}
          }
        </h2>
        <button mat-icon-button (click)="onCancel()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="relationship-editor__content">
        <!-- Source Person (Fixed) -->
        <div class="relationship-editor__section">
          <label class="relationship-editor__label">{{ 'relationshipEditor.person' | translate }}</label>
          <div class="relationship-editor__person-chip">
            <div
              class="relationship-editor__avatar"
              [class.relationship-editor__avatar--male]="sourcePerson.sex === Sex.Male"
              [class.relationship-editor__avatar--female]="sourcePerson.sex === Sex.Female">
              {{ getInitials(getPersonName(sourcePerson)) }}
            </div>
            <span class="relationship-editor__person-name">{{ getPersonName(sourcePerson) }}</span>
          </div>
        </div>

        <!-- Relationship Direction -->
        <div class="relationship-editor__section">
          <label class="relationship-editor__label">{{ 'relationshipEditor.direction' | translate }}</label>
          <mat-form-field appearance="outline" class="full-width">
            <mat-select [(ngModel)]="selectedDirection" [disabled]="data.mode === 'edit'">
              <mat-option value="parent">{{ 'relationshipEditor.addAsParent' | translate }}</mat-option>
              <mat-option value="child">{{ 'relationshipEditor.addAsChild' | translate }}</mat-option>
              <mat-option value="spouse">{{ 'relationshipEditor.addAsSpouse' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <!-- Relationship Type Dropdown (from FamilyRelationshipTypes) -->
        <div class="relationship-editor__section">
          <label class="relationship-editor__label">{{ 'relationshipEditor.relationshipType' | translate }}</label>
          @if (loadingTypes()) {
            <div class="relationship-editor__loading">
              <mat-spinner diameter="20"></mat-spinner>
            </div>
          } @else {
            <mat-form-field appearance="outline" class="full-width">
              <mat-select [(ngModel)]="selectedRelationshipTypeId" placeholder="{{ 'relationshipEditor.selectType' | translate }}">
                @for (group of groupedTypes(); track group.category) {
                  <mat-optgroup [label]="group.category">
                    @for (type of group.types; track type.id) {
                      <mat-option [value]="type.id">
                        {{ getRelationshipTypeName(type) }}
                      </mat-option>
                    }
                  </mat-optgroup>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>

        <!-- Related Person Selection (for create mode) -->
        @if (data.mode === 'create') {
          <div class="relationship-editor__section">
            <label class="relationship-editor__label">{{ 'relationshipEditor.relatedPerson' | translate }}</label>

            @if (selectedRelatedPerson()) {
              <!-- Selected person chip with remove button -->
              <div class="relationship-editor__person-chip relationship-editor__person-chip--removable" (click)="clearRelatedPerson()">
                <div
                  class="relationship-editor__avatar"
                  [class.relationship-editor__avatar--male]="selectedRelatedPerson()!.sex === Sex.Male"
                  [class.relationship-editor__avatar--female]="selectedRelatedPerson()!.sex === Sex.Female">
                  {{ getInitials(getDisplayName(selectedRelatedPerson())) }}
                </div>
                <span class="relationship-editor__person-name">{{ getDisplayName(selectedRelatedPerson()) }}</span>
                <i class="fa-solid fa-xmark relationship-editor__remove" aria-hidden="true"></i>
              </div>
            } @else {
              <!-- Search input -->
              <div class="relationship-editor__search">
                <div class="ft-search">
                  <i class="fa-solid fa-magnifying-glass ft-search__icon" aria-hidden="true"></i>
                  <input
                    type="text"
                    class="ft-search__input"
                    [placeholder]="'people.searchPlaceholder' | translate"
                    [(ngModel)]="searchQuery"
                    (ngModelChange)="onSearchChange($event)"
                    autocomplete="off">
                  @if (searchQuery) {
                    <button class="ft-search__clear" (click)="clearSearch()">
                      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                  }
                </div>
              </div>

              <!-- Search Results -->
              <div class="relationship-editor__results">
                @if (searching()) {
                  <div class="relationship-editor__loading">
                    <mat-spinner diameter="24"></mat-spinner>
                    <span>{{ 'common.searching' | translate }}</span>
                  </div>
                } @else if (searchResults().length > 0) {
                  <div class="relationship-editor__list">
                    @for (person of searchResults(); track person.id) {
                      <div
                        class="relationship-editor__result-item"
                        [class.disabled]="person.id === sourcePerson.id"
                        matRipple
                        (click)="selectRelatedPerson(person)">
                        <div
                          class="relationship-editor__avatar relationship-editor__avatar--small"
                          [class.relationship-editor__avatar--male]="person.sex === Sex.Male"
                          [class.relationship-editor__avatar--female]="person.sex === Sex.Female">
                          {{ getInitials(getDisplayName(person)) }}
                        </div>
                        <div class="relationship-editor__result-info">
                          <div class="relationship-editor__result-name">{{ getDisplayName(person) }}</div>
                          <div class="relationship-editor__result-meta">
                            @if (person.birthDate) {
                              <span>{{ formatYear(person.birthDate) }}</span>
                            }
                            @if (person.birthDate && person.deathDate) {
                              <span>-</span>
                            }
                            @if (person.deathDate) {
                              <span>{{ formatYear(person.deathDate) }}</span>
                            }
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                } @else if (searchQuery && !searching()) {
                  <div class="relationship-editor__empty">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <span>{{ 'common.noResults' | translate }}</span>
                  </div>
                } @else {
                  <div class="relationship-editor__hint">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <span>{{ 'relationshipEditor.searchHint' | translate }}</span>
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <!-- Edit Mode: Show existing related person -->
          <div class="relationship-editor__section">
            <label class="relationship-editor__label">{{ 'relationshipEditor.relatedPerson' | translate }}</label>
            <div class="relationship-editor__person-chip">
              <div
                class="relationship-editor__avatar"
                [class.relationship-editor__avatar--male]="data.existingRelationship!.relatedPerson.sex === Sex.Male"
                [class.relationship-editor__avatar--female]="data.existingRelationship!.relatedPerson.sex === Sex.Female">
                {{ getInitials(data.existingRelationship!.relatedPerson.primaryName) }}
              </div>
              <span class="relationship-editor__person-name">{{ data.existingRelationship!.relatedPerson.primaryName }}</span>
            </div>
          </div>
        }

        <!-- Notes (optional) -->
        <div class="relationship-editor__section">
          <label class="relationship-editor__label">{{ 'relationshipEditor.notes' | translate }} ({{ 'common.optional' | translate }})</label>
          <mat-form-field appearance="outline" class="full-width">
            <textarea
              matInput
              [(ngModel)]="notes"
              [placeholder]="'relationshipEditor.notesPlaceholder' | translate"
              rows="2">
            </textarea>
          </mat-form-field>
        </div>
      </div>

      <!-- Footer -->
      <div class="relationship-editor__footer">
        @if (data.mode === 'edit') {
          <button
            mat-button
            color="warn"
            (click)="onDelete()"
            [disabled]="saving()">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
            {{ 'common.delete' | translate }}
          </button>
        }
        <div class="relationship-editor__footer-actions">
          <button mat-button (click)="onCancel()">
            {{ 'common.cancel' | translate }}
          </button>
          <button
            mat-flat-button
            color="primary"
            [disabled]="!canSave() || saving()"
            (click)="onSave()">
            @if (saving()) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              {{ 'common.save' | translate }}
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .relationship-editor {
      display: flex;
      flex-direction: column;
      min-width: 420px;
      max-width: 520px;
      max-height: 85vh;

      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
        border-bottom: 1px solid var(--ft-border);
      }

      &__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }

      &__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--ft-spacing-lg);
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-md);
      }

      &__section {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-sm);
      }

      &__label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--ft-on-surface-variant);
        letter-spacing: 0.5px;
      }

      &__person-chip {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-md);
        padding: var(--ft-spacing-sm) var(--ft-spacing-md);
        background: var(--ft-surface-variant);
        border-radius: var(--ft-radius-lg);

        &--removable {
          cursor: pointer;
          transition: background var(--ft-transition-fast);

          &:hover {
            background: var(--ft-border);
          }
        }
      }

      &__avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.875rem;
        font-weight: 600;
        background: var(--ft-unknown-light);
        color: var(--ft-unknown);

        &--male {
          background: var(--ft-male-light);
          color: var(--ft-male);
        }

        &--female {
          background: var(--ft-female-light);
          color: var(--ft-female);
        }

        &--small {
          width: 32px;
          height: 32px;
          font-size: 0.75rem;
        }
      }

      &__person-name {
        font-weight: 500;
        flex: 1;
      }

      &__remove {
        color: var(--ft-on-surface-variant);
        font-size: 0.875rem;
      }

      &__search {
        margin-bottom: var(--ft-spacing-sm);
      }

      &__results {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid var(--ft-border);
        border-radius: var(--ft-radius-md);
      }

      &__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-md);
        color: var(--ft-on-surface-variant);
      }

      &__list {
        display: flex;
        flex-direction: column;
      }

      &__result-item {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-sm) var(--ft-spacing-md);
        cursor: pointer;
        transition: background var(--ft-transition-fast);

        &:hover:not(.disabled) {
          background: var(--ft-surface-variant);
        }

        &.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        &:not(:last-child) {
          border-bottom: 1px solid var(--ft-border);
        }
      }

      &__result-info {
        flex: 1;
        min-width: 0;
      }

      &__result-name {
        font-weight: 500;
        font-size: 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &__result-meta {
        font-size: 0.75rem;
        color: var(--ft-on-surface-variant);
        display: flex;
        gap: var(--ft-spacing-xs);
      }

      &__empty, &__hint {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ft-spacing-lg);
        color: var(--ft-on-surface-variant);
        text-align: center;
        gap: var(--ft-spacing-sm);

        i.fa-solid {
          font-size: 24px;
          opacity: 0.5;
        }
      }

      &__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
        border-top: 1px solid var(--ft-border);
      }

      &__footer-actions {
        display: flex;
        gap: var(--ft-spacing-sm);
        margin-left: auto;

        button {
          display: flex;
          align-items: center;
          gap: var(--ft-spacing-xs);
        }
      }
    }

    .full-width {
      width: 100%;
    }

    .ft-search {
      display: flex;
      align-items: center;
      background: var(--ft-surface);
      border: 1px solid var(--ft-border);
      border-radius: var(--ft-radius-md);
      padding: 0 var(--ft-spacing-md);

      &__icon {
        color: var(--ft-on-surface-variant);
        margin-right: var(--ft-spacing-sm);
      }

      &__input {
        flex: 1;
        border: none;
        background: none;
        padding: var(--ft-spacing-sm) 0;
        font-size: 0.875rem;
        outline: none;

        &::placeholder {
          color: var(--ft-on-surface-variant);
        }
      }

      &__clear {
        background: none;
        border: none;
        color: var(--ft-on-surface-variant);
        cursor: pointer;
        padding: var(--ft-spacing-xs);

        &:hover {
          color: var(--ft-on-surface);
        }
      }
    }
  `]
})
export class RelationshipEditorDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(MatDialogRef<RelationshipEditorDialogComponent>);
  readonly data = inject<RelationshipEditorDialogData>(MAT_DIALOG_DATA);
  private readonly searchService = inject(PersonSearchService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly relationshipTypeService = inject(FamilyRelationshipTypeService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroy$ = new Subject<void>();

  readonly Sex = Sex;

  // Source person
  get sourcePerson(): TreePersonNode | PersonListItem {
    return this.data.person;
  }

  // Form state
  selectedDirection: RelationshipDirection = 'parent';
  selectedRelationshipTypeId: number | null = null;
  notes = '';

  // Search state
  searchQuery = '';
  searchResults = signal<SearchPersonItem[]>([]);
  searching = signal(false);
  selectedRelatedPerson = signal<SearchPersonItem | null>(null);
  
  // Relationship types
  groupedTypes = signal<FamilyRelationshipTypeGrouped[]>([]);
  loadingTypes = signal(true);
  
  // Save state
  saving = signal(false);

  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    // Initialize direction
    if (this.data.direction) {
      this.selectedDirection = this.data.direction;
    }

    // Initialize for edit mode
    if (this.data.mode === 'edit' && this.data.existingRelationship) {
      this.selectedRelationshipTypeId = this.data.existingRelationship.relationshipTypeId || null;
    }

    // Load relationship types
    this.loadRelationshipTypes();

    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query.trim()) {
        this.search(query);
      } else {
        this.searchResults.set([]);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRelationshipTypes(): void {
    this.loadingTypes.set(true);
    this.relationshipTypeService.getAllGrouped().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (groups) => {
        this.groupedTypes.set(groups);
        this.loadingTypes.set(false);
      },
      error: (error: any) => {
        console.error('Failed to load relationship types:', error);
        this.loadingTypes.set(false);
      }
    });
  }

  getRelationshipTypeName(type: FamilyRelationshipType): string {
    const lang = this.i18n.currentLang();
    const languageMap: Record<Language, 'english' | 'arabic' | 'nubian'> = {
      'en': 'english',
      'ar': 'arabic',
      'nob': 'nubian'
    };
    const primaryLang = languageMap[lang] || 'english';
    const primaryName = getRelationshipName(type, primaryLang);
    
    // Show secondary language in parentheses
    if (lang === 'en') {
      return `${primaryName} (${type.nameArabic})`;
    } else if (lang === 'ar') {
      return `${primaryName} (${type.nameEnglish})`;
    } else {
      return `${primaryName} (${type.nameEnglish})`;
    }
  }

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults.set([]);
  }

  search(query: string): void {
    this.searching.set(true);

    this.searchService.quickSearch(query, 1, 20).subscribe({
      next: (response) => {
        // Filter out the source person
        const filtered = response.items.filter(p => p.id !== this.sourcePerson.id);
        this.searchResults.set(filtered);
        this.searching.set(false);
      },
      error: (error: any) => {
        console.error('Search failed:', error);
        this.searchResults.set([]);
        this.searching.set(false);
      }
    });
  }

  selectRelatedPerson(person: SearchPersonItem): void {
    if (person.id === this.sourcePerson.id) {
      return;
    }
    this.selectedRelatedPerson.set(person);
  }

  // Helper to get display name from SearchPersonItem
  getDisplayName(person: SearchPersonItem | null): string {
    return person ? getPrimaryName(person) : 'Unknown';
  }

  clearRelatedPerson(): void {
    this.selectedRelatedPerson.set(null);
  }

  canSave(): boolean {
    if (this.data.mode === 'create') {
      return !!this.selectedRelatedPerson() && !!this.selectedDirection;
    }
    return true;
  }

  onSave(): void {
    if (!this.canSave()) return;

    this.saving.set(true);

    if (this.data.mode === 'create') {
      this.createRelationship();
    } else {
      this.updateRelationship();
    }
  }

  private createRelationship(): void {
    const relatedPerson = this.selectedRelatedPerson();
    if (!relatedPerson) return;

    const request: AddParentChildRequest = {
      notes: this.notes || undefined,
      relationshipType: ParentChildRelationshipType.Biological
    };

    let operation$: import('rxjs').Observable<any>;

    switch (this.selectedDirection) {
      case 'parent':
        // Add related person as parent to source person
        operation$ = this.relationshipService.addParent(this.sourcePerson.id, relatedPerson.id, request);
        break;
      case 'child':
        // Add related person as child to source person  
        operation$ = this.relationshipService.addChild(this.sourcePerson.id, relatedPerson.id, request);
        break;
      case 'spouse':
        // Create a union between the two persons
        operation$ = this.relationshipService.createUnion({
          memberIds: [this.sourcePerson.id, relatedPerson.id],
          notes: this.notes || undefined
        });
        break;
    }

    operation$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('relationshipEditor.createSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        
        const result: RelationshipEditorDialogResult = {
          success: true,
          action: 'created',
          relationship: {
            personId: this.sourcePerson.id,
            relatedPersonId: relatedPerson.id,
            relationshipTypeId: this.selectedRelationshipTypeId || undefined,
            direction: this.selectedDirection
          }
        };
        this.dialogRef.close(result);
      },
      error: (error: any) => {
        console.error('Failed to create relationship:', error);
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('relationshipEditor.createError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  private updateRelationship(): void {
    if (!this.data.existingRelationship) return;

    this.relationshipService.updateRelationship(this.data.existingRelationship.id, {
      notes: this.notes || undefined
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('relationshipEditor.updateSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        
        const result: RelationshipEditorDialogResult = {
          success: true,
          action: 'updated'
        };
        this.dialogRef.close(result);
      },
      error: (error: any) => {
        console.error('Failed to update relationship:', error);
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('relationshipEditor.updateError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  onDelete(): void {
    if (!this.data.existingRelationship) return;

    // In a real app, you'd show a confirmation dialog here
    this.saving.set(true);

    this.relationshipService.deleteRelationship(this.data.existingRelationship.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('relationshipEditor.deleteSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        
        const result: RelationshipEditorDialogResult = {
          success: true,
          action: 'deleted'
        };
        this.dialogRef.close(result);
      },
      error: (error: any) => {
        console.error('Failed to delete relationship:', error);
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.t('relationshipEditor.deleteError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  getPersonName(person: TreePersonNode | PersonListItem): string {
    return person.primaryName || 'Unknown';
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