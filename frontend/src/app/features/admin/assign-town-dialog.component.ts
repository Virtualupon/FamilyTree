import { Component, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule, MatSelect } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { TownListItem } from '../../core/models/town.models';
import { AdminUser } from '../../core/models/family-tree.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

export interface AssignTownDialogData {
  user?: AdminUser;  // Optional - if not provided, show user dropdown
  users?: AdminUser[];  // List of admin users for dropdown
  towns: TownListItem[];
}

export interface AssignTownDialogResult {
  userId: number;
  townId: string;
}

@Component({
  selector: 'app-assign-town-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    A11yModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    TranslatePipe
  ],
  template: `
    <div class="dialog-wrapper" (click)="$event.stopPropagation()">
      <h2 mat-dialog-title>{{ 'admin.assignAdminToTown' | translate }}</h2>

      <mat-dialog-content class="dialog-content">
        <p class="hint">
          {{ 'admin.assignAdminHint' | translate }}
        </p>

        @if (data.user) {
          <p class="selected-user">
            <strong>{{ 'admin.admin' | translate }}:</strong> {{ data.user.firstName }} {{ data.user.lastName }} ({{ data.user.email }})
          </p>
        } @else if (data.users && data.users.length > 0) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'admin.selectAdmin' | translate }}</mat-label>
            <mat-select [(ngModel)]="selectedUserId" required>
              @for (user of data.users; track user.userId) {
                <mat-option [value]="user.userId">
                  {{ user.firstName }} {{ user.lastName }} ({{ user.email }})
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'admin.selectTown' | translate }}</mat-label>
          <mat-select [(ngModel)]="selectedTownId" required>
            @for (town of data.towns; track town.id) {
              <mat-option [value]="town.id">
                <span class="town-option">
                  <span class="town-option-name">{{ getLocalizedTownName(town) }}</span>
                  @if (town.country) {
                    <span class="town-option-country">({{ town.country }})</span>
                  }
                  <span class="town-option-trees">{{ 'admin.townTreesCount' | translate: { count: town.treeCount || 0 } }}</span>
                </span>
              </mat-option>
            }
            @if (data.towns.length === 0) {
              <mat-option disabled>{{ 'admin.noTownsAvailable' | translate }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ 'admin.townsHint' | translate }}</mat-hint>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
        <button mat-flat-button color="primary"
                [disabled]="!canAssign()"
                (click)="assign()">
          {{ 'admin.assignTown' | translate }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-content {
      min-width: 400px;
      padding-top: 8px;
    }
    .hint {
      color: rgba(0, 0, 0, 0.6);
      margin-bottom: 16px;
    }
    .selected-user {
      margin-bottom: 16px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }
    .town-option {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .town-option-name {
      flex: 1;
    }
    .town-option-country {
      color: rgba(0, 0, 0, 0.6);
      font-size: 12px;
    }
    .town-option-trees {
      color: rgba(0, 0, 0, 0.5);
      font-size: 12px;
    }
  `]
})
export class AssignTownDialogComponent implements AfterViewInit {
  readonly dialogRef = inject(MatDialogRef<AssignTownDialogComponent>);
  readonly data = inject<AssignTownDialogData>(MAT_DIALOG_DATA);
  private readonly i18n = inject(I18nService);

  @ViewChild('townSelect') townSelect!: MatSelect;

  selectedUserId: number | null = null;
  selectedTownId: string = '';

  constructor() {
    console.log('AssignTownDialog: constructor called');
    console.log('AssignTownDialog: data =', this.data);

    // Pre-select user if provided
    if (this.data.user) {
      this.selectedUserId = this.data.user.userId;
    }
  }

  ngOnInit() {
    console.log('AssignTownDialog: ngOnInit called');
  }

  ngAfterViewInit() {
    console.log('AssignTownDialog: ngAfterViewInit called');
  }

  getLocalizedTownName(town: TownListItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    return town.name;
  }

  onSelectOpened(selectType: string) {
    console.log(`Select opened: ${selectType}`);
  }

  onSelectClosed(selectType: string) {
    console.log(`Select closed: ${selectType}`);
  }

  canAssign(): boolean {
    const hasUser = this.data.user ? true : !!this.selectedUserId;
    return hasUser && !!this.selectedTownId;
  }

  assign() {
    const userId = this.data.user?.userId ?? this.selectedUserId;
    if (userId && this.selectedTownId) {
      this.dialogRef.close({
        userId,
        townId: this.selectedTownId
      } as AssignTownDialogResult);
    }
  }
}
