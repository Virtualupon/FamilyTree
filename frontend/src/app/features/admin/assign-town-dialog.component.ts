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
  templateUrl: './assign-town-dialog.component.html',
  styleUrls: ['./assign-town-dialog.component.scss']
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
