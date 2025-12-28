import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';

import { PersonService } from '../../core/services/person.service';
import { TreeService } from '../../core/services/tree.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonListItem, Sex } from '../../core/models/person.models';
import { TreePersonNode } from '../../core/models/tree.models';
import { RelationshipPathResponse } from '../../core/models/relationship-path.models';

export interface RelationshipFinderDialogData {
  fromPerson: TreePersonNode | PersonListItem;
}

export interface RelationshipFinderDialogResult {
  pathData: RelationshipPathResponse;
  fromPerson: TreePersonNode | PersonListItem;
  toPerson: PersonListItem;
}

@Component({
  selector: 'app-relationship-finder-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    TranslatePipe
  ],
  template: `
    <div class="relationship-finder">
      <!-- Header -->
      <div class="relationship-finder__header">
        <h2 class="relationship-finder__title">{{ 'relationship.findRelationship' | translate }}</h2>
        <button mat-icon-button (click)="onCancel()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="relationship-finder__content">
        <!-- From Person (Fixed) -->
        <div class="relationship-finder__section">
          <label class="relationship-finder__label">{{ 'relationship.from' | translate }}</label>
          <div class="relationship-finder__person-chip">
            <div
              class="relationship-finder__avatar"
              [class.relationship-finder__avatar--male]="fromPersonSex === Sex.Male"
              [class.relationship-finder__avatar--female]="fromPersonSex === Sex.Female">
              {{ getInitials(fromPersonName) }}
            </div>
            <span class="relationship-finder__person-name">{{ fromPersonName }}</span>
          </div>
        </div>

        <!-- Connection Arrow -->
        <div class="relationship-finder__arrow">
          <mat-icon>sync_alt</mat-icon>
        </div>

        <!-- To Person (Searchable) -->
        <div class="relationship-finder__section">
          <label class="relationship-finder__label">{{ 'relationship.to' | translate }}</label>

          @if (selectedToPerson()) {
            <!-- Selected person chip with remove button -->
            <div class="relationship-finder__person-chip relationship-finder__person-chip--removable" (click)="clearToPerson()">
              <div
                class="relationship-finder__avatar"
                [class.relationship-finder__avatar--male]="selectedToPerson()!.sex === Sex.Male"
                [class.relationship-finder__avatar--female]="selectedToPerson()!.sex === Sex.Female">
                {{ getInitials(selectedToPerson()!.primaryName) }}
              </div>
              <span class="relationship-finder__person-name">{{ selectedToPerson()!.primaryName }}</span>
              <mat-icon class="relationship-finder__remove">close</mat-icon>
            </div>
          } @else {
            <!-- Search input -->
            <div class="relationship-finder__search">
              <div class="ft-search">
                <mat-icon class="ft-search__icon">search</mat-icon>
                <input
                  type="text"
                  class="ft-search__input"
                  [placeholder]="'people.searchPlaceholder' | translate"
                  [(ngModel)]="searchQuery"
                  (ngModelChange)="onSearchChange($event)"
                  autocomplete="off"
                  autofocus>
                @if (searchQuery) {
                  <button class="ft-search__clear" (click)="clearSearch()">
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>
            </div>

            <!-- Search Results -->
            <div class="relationship-finder__results">
              @if (searching()) {
                <div class="relationship-finder__loading">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>{{ 'common.searching' | translate }}</span>
                </div>
              } @else if (searchResults().length > 0) {
                <div class="relationship-finder__list">
                  @for (person of searchResults(); track person.id) {
                    <div
                      class="relationship-finder__result-item"
                      [class.disabled]="person.id === data.fromPerson.id"
                      matRipple
                      (click)="selectToPerson(person)">
                      <div
                        class="relationship-finder__avatar relationship-finder__avatar--small"
                        [class.relationship-finder__avatar--male]="person.sex === Sex.Male"
                        [class.relationship-finder__avatar--female]="person.sex === Sex.Female">
                        {{ getInitials(person.primaryName) }}
                      </div>
                      <div class="relationship-finder__result-info">
                        <div class="relationship-finder__result-name">{{ person.primaryName }}</div>
                        <div class="relationship-finder__result-meta">
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
                <div class="relationship-finder__empty">
                  <mat-icon>person_search</mat-icon>
                  <span>{{ 'common.noResults' | translate }}</span>
                </div>
              } @else {
                <div class="relationship-finder__hint">
                  <mat-icon>search</mat-icon>
                  <span>{{ 'relationship.searchHint' | translate }}</span>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Footer -->
      <div class="relationship-finder__footer">
        <button mat-button (click)="onCancel()">
          {{ 'common.cancel' | translate }}
        </button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="!selectedToPerson() || findingPath()"
          (click)="findRelationship()">
          @if (findingPath()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <mat-icon>link</mat-icon>
            {{ 'relationship.showLink' | translate }}
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .relationship-finder {
      display: flex;
      flex-direction: column;
      min-width: 400px;
      max-width: 500px;
      max-height: 80vh;

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
        flex-shrink: 0;

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
        flex: 1;
        font-weight: 500;
      }

      &__remove {
        color: var(--ft-on-surface-variant);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &__arrow {
        display: flex;
        justify-content: center;
        color: var(--ft-on-surface-variant);

        mat-icon {
          font-size: 24px;
          width: 24px;
          height: 24px;
        }
      }

      &__search {
        margin-bottom: var(--ft-spacing-sm);
      }

      &__results {
        max-height: 250px;
        overflow-y: auto;
        border: 1px solid var(--ft-border);
        border-radius: var(--ft-radius-md);
      }

      &__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-lg);
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
        padding: var(--ft-spacing-xl);
        color: var(--ft-on-surface-variant);
        text-align: center;
        gap: var(--ft-spacing-sm);

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          opacity: 0.5;
        }
      }

      &__footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
        border-top: 1px solid var(--ft-border);

        button {
          display: flex;
          align-items: center;
          gap: var(--ft-spacing-xs);
        }
      }
    }
  `]
})
export class RelationshipFinderDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(MatDialogRef<RelationshipFinderDialogComponent>);
  readonly data = inject<RelationshipFinderDialogData>(MAT_DIALOG_DATA);
  private readonly personService = inject(PersonService);
  private readonly treeService = inject(TreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly i18n = inject(I18nService);
  private readonly destroy$ = new Subject<void>();

  readonly Sex = Sex;

  // From person info
  get fromPersonName(): string {
    return this.data.fromPerson.primaryName || 'Unknown';
  }

  get fromPersonSex(): Sex {
    return this.data.fromPerson.sex;
  }

  // Search state
  searchQuery = '';
  searchResults = signal<PersonListItem[]>([]);
  searching = signal(false);
  selectedToPerson = signal<PersonListItem | null>(null);
  findingPath = signal(false);

  private searchSubject = new Subject<string>();

  ngOnInit(): void {
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

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults.set([]);
  }

  search(query: string): void {
    this.searching.set(true);

    this.personService.searchPeople({
      nameQuery: query,
      page: 1,
      pageSize: 20
    }).subscribe({
      next: (response) => {
        // Filter out the from person
        const filtered = response.items.filter(p => p.id !== this.data.fromPerson.id);
        this.searchResults.set(filtered);
        this.searching.set(false);
      },
      error: (error) => {
        console.error('Search failed:', error);
        this.searchResults.set([]);
        this.searching.set(false);
      }
    });
  }

  selectToPerson(person: PersonListItem): void {
    if (person.id === this.data.fromPerson.id) {
      return;
    }
    this.selectedToPerson.set(person);
  }

  clearToPerson(): void {
    this.selectedToPerson.set(null);
  }

  findRelationship(): void {
    const toPerson = this.selectedToPerson();
    if (!toPerson) {
      return;
    }

    this.findingPath.set(true);

    const treeId = this.treeContext.effectiveTreeId();

    this.treeService.findRelationshipPath({
      person1Id: this.data.fromPerson.id,
      person2Id: toPerson.id,
      treeId: treeId || undefined
    }).subscribe({
      next: (pathData) => {
        this.findingPath.set(false);

        const result: RelationshipFinderDialogResult = {
          pathData,
          fromPerson: this.data.fromPerson,
          toPerson
        };

        this.dialogRef.close(result);
      },
      error: (error) => {
        console.error('Failed to find relationship:', error);
        this.findingPath.set(false);
        // TODO: Show error snackbar
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

  formatYear(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }
}
