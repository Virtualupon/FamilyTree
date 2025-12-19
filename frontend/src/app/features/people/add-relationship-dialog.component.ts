import { Component, Inject, inject, signal, OnInit } from '@angular/core';
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
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { Observable, of, Subject } from 'rxjs';

import type { PersonListItem, PagedResult } from '../../core/models/person.models';
import { Sex } from '../../core/models/person.models';
import { PersonService } from '../../core/services/person.service';
import { 
  RelationshipService, 
  ParentChildRelationshipType, 
  UnionType,
  CreateUnionRequest 
} from '../../core/services/relationship.service';

export type RelationshipDialogType = 'parent' | 'child' | 'spouse';

export interface RelationshipDialogData {
  personId: string;
  personName?: string | null;
  type: RelationshipDialogType;
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
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  template: `
    <h2 mat-dialog-title>
      @switch (data.type) {
        @case ('parent') { Add Parent }
        @case ('child') { Add Child }
        @case ('spouse') { Add Spouse/Partner }
      }
    </h2>

    <mat-dialog-content>
      <!-- Person Search -->
      <div class="search-section">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Search for a person</mat-label>
          <input matInput 
                 [formControl]="searchControl"
                 [matAutocomplete]="auto"
                 placeholder="Type name to search...">
          <mat-icon matSuffix>search</mat-icon>
          <mat-autocomplete #auto="matAutocomplete" 
                           [displayWith]="displayPerson"
                           (optionSelected)="onPersonSelected($event.option.value)">
            @for (person of searchResults(); track person.id) {
              <mat-option [value]="person">
                <div class="person-option">
                  <span class="name">{{ person.primaryName || 'Unknown' }}</span>
                  @if (person.birthDate || person.deathDate) {
                    <span class="dates">
                      ({{ formatYear(person.birthDate) }} - {{ formatYear(person.deathDate) }})
                    </span>
                  }
                  @if (person.sex !== null && person.sex !== undefined) {
                    <mat-icon class="sex-icon" [class]="getSexClass(person.sex)">
                      {{ getSexIcon(person.sex) }}
                    </mat-icon>
                  }
                </div>
              </mat-option>
            }
            @if (isSearching()) {
              <mat-option disabled>
                <mat-spinner diameter="20"></mat-spinner>
                Searching...
              </mat-option>
            }
            @if (!isSearching() && searchResults().length === 0 && searchControl.value) {
              <mat-option disabled>No results found</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>

        @if (selectedPerson()) {
          <div class="selected-person">
            <mat-chip-row (removed)="clearSelection()">
              <mat-icon matChipAvatar>person</mat-icon>
              {{ selectedPerson()?.primaryName || 'Unknown' }}
              <button matChipRemove>
                <mat-icon>cancel</mat-icon>
              </button>
            </mat-chip-row>
          </div>
        }
      </div>

      <!-- Parent/Child specific options -->
      @if (data.type === 'parent' || data.type === 'child') {
        <div class="relationship-options">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Relationship Type</mat-label>
            <mat-select [formControl]="relationshipTypeControl">
              <mat-option [value]="ParentChildRelationshipType.Biological">Biological</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Adopted">Adopted</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Foster">Foster</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Step">Step</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Guardian">Guardian</mat-option>
              <mat-option [value]="ParentChildRelationshipType.Unknown">Unknown</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      }

      <!-- Spouse specific options -->
      @if (data.type === 'spouse') {
        <div class="union-options">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Union Type</mat-label>
            <mat-select [formControl]="unionTypeControl">
              <mat-option [value]="UnionType.Marriage">Marriage</mat-option>
              <mat-option [value]="UnionType.CivilUnion">Civil Union</mat-option>
              <mat-option [value]="UnionType.DomesticPartnership">Domestic Partnership</mat-option>
              <mat-option [value]="UnionType.CommonLaw">Common Law</mat-option>
              <mat-option [value]="UnionType.Engagement">Engagement</mat-option>
              <mat-option [value]="UnionType.Unknown">Unknown</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="date-row">
            <mat-form-field appearance="outline">
              <mat-label>Start Date</mat-label>
              <input matInput [matDatepicker]="startPicker" [formControl]="startDateControl">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>End Date (if applicable)</mat-label>
              <input matInput [matDatepicker]="endPicker" [formControl]="endDateControl">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </div>
      }

      <!-- Notes -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Notes (optional)</mat-label>
        <textarea matInput [formControl]="notesControl" rows="2"></textarea>
      </mat-form-field>

      @if (error()) {
        <div class="error-message">
          <mat-icon>error</mat-icon>
          {{ error() }}
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button 
              color="primary" 
              [disabled]="!selectedPerson() || isSaving()"
              (click)="save()">
        @if (isSaving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Add {{ getRelationshipLabel() }}
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

    .sex-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .sex-icon.male {
      color: #1976d2;
    }

    .sex-icon.female {
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
  `]
})
export class AddRelationshipDialogComponent implements OnInit {
  private personService = inject(PersonService);
  private relationshipService = inject(RelationshipService);
  private fb = inject(FormBuilder);

  // Expose enums to template
  ParentChildRelationshipType = ParentChildRelationshipType;
  UnionType = UnionType;
  Sex = Sex;

  // Form controls
  searchControl = new FormControl('');
  relationshipTypeControl = new FormControl(ParentChildRelationshipType.Biological);
  unionTypeControl = new FormControl(UnionType.Marriage);
  startDateControl = new FormControl<Date | null>(null);
  endDateControl = new FormControl<Date | null>(null);
  notesControl = new FormControl('');

  // State signals
  searchResults = signal<PersonListItem[]>([]);
  selectedPerson = signal<PersonListItem | null>(null);
  isSearching = signal(false);
  isSaving = signal(false);
  error = signal<string | null>(null);

  private searchSubject = new Subject<string>();

  constructor(
    public dialogRef: MatDialogRef<AddRelationshipDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RelationshipDialogData
  ) {}

  ngOnInit() {
    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        if (!term || term.length < 2) {
          this.searchResults.set([]);
          return of(null);
        }
        this.isSearching.set(true);
        return this.personService.searchPeople({ nameQuery: term, page: 1, pageSize: 10 }).pipe(
          catchError((err: any) => {
            console.error('Search error:', err);
            return of({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
          })
        );
      })
    ).subscribe(result => {
      this.isSearching.set(false);
      if (result) {
        // Filter out the current person from results
        const filtered = result.items.filter(p => p.id !== this.data.personId);
        this.searchResults.set(filtered);
      }
    });

    // Connect input to search subject
    this.searchControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        this.searchSubject.next(value);
      }
    });
  }

  displayPerson(person: PersonListItem): string {
    return person?.primaryName || '';
  }

  onPersonSelected(person: PersonListItem) {
    this.selectedPerson.set(person);
    this.searchControl.setValue('');
    this.searchResults.set([]);
  }

  clearSelection() {
    this.selectedPerson.set(null);
  }

  formatYear(dateStr?: string | null): string {
    if (!dateStr) return '?';
    const date = new Date(dateStr);
    return date.getFullYear().toString();
  }

  getSexClass(sex: Sex | null): string {
    if (sex === Sex.Male) return 'male';
    if (sex === Sex.Female) return 'female';
    return '';
  }

  getSexIcon(sex: Sex | null): string {
    if (sex === Sex.Male) return 'male';
    if (sex === Sex.Female) return 'female';
    return 'person';
  }

  getRelationshipLabel(): string {
    switch (this.data.type) {
      case 'parent': return 'Parent';
      case 'child': return 'Child';
      case 'spouse': return 'Spouse';
      default: return 'Relationship';
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

      default:
        this.error.set('Unknown relationship type');
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
        const message = err.error?.message || err.message || 'Failed to add relationship';
        this.error.set(message);
      }
    });
  }
}