import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AdminCountriesService, AdminCountry } from './admin-countries.service';
import { CountryDialogComponent, CountryDialogData } from './country-dialog.component';
import { TranslatePipe, I18nService } from '../../../core/i18n';

@Component({
  selector: 'app-countries-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    TranslatePipe
  ],
  template: `
    <div class="countries-container">
      <div class="header">
        <div class="header__title">
          <h1>
            <i class="fa-solid fa-globe" aria-hidden="true"></i>
            {{ 'admin.countries.title' | translate }}
          </h1>
          <p class="subtitle">{{ 'admin.countries.subtitle' | translate }}</p>
        </div>
        <button mat-flat-button color="primary" (click)="openAddDialog()">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          {{ 'admin.countries.add' | translate }}
        </button>
      </div>

      <!-- Filters -->
      <mat-card class="filters-card">
        <div class="filters">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.search' | translate }}</mat-label>
            <input matInput [(ngModel)]="searchText" (ngModelChange)="applyFilters()"
                   [placeholder]="'admin.countries.searchPlaceholder' | translate">
            <i matPrefix class="fa-solid fa-search filter-icon" aria-hidden="true"></i>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'admin.countries.region' | translate }}</mat-label>
            <mat-select [(ngModel)]="selectedRegion" (selectionChange)="applyFilters()">
              <mat-option value="">{{ 'common.all' | translate }}</mat-option>
              @for (region of regions(); track region) {
                <mat-option [value]="region">{{ region }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-checkbox [(ngModel)]="showActiveOnly" (change)="applyFilters()">
            {{ 'admin.countries.activeOnly' | translate }}
          </mat-checkbox>

          <span class="filter-count">
            {{ filteredCountries().length }} {{ 'admin.countries.countriesFound' | translate }}
          </span>
        </div>
      </mat-card>

      <!-- Table -->
      <mat-card class="table-card">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else {
          <div class="table-container">
            <table mat-table [dataSource]="filteredCountries()" class="countries-table">

              <!-- Flag -->
              <ng-container matColumnDef="flag">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let country" class="flag-cell">
                  {{ getFlag(country.code) }}
                </td>
              </ng-container>

              <!-- Code -->
              <ng-container matColumnDef="code">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.code' | translate }}</th>
                <td mat-cell *matCellDef="let country">
                  <strong>{{ country.code }}</strong>
                </td>
              </ng-container>

              <!-- Name English -->
              <ng-container matColumnDef="nameEn">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.nameEn' | translate }}</th>
                <td mat-cell *matCellDef="let country">{{ country.nameEn }}</td>
              </ng-container>

              <!-- Name Arabic -->
              <ng-container matColumnDef="nameAr">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.nameAr' | translate }}</th>
                <td mat-cell *matCellDef="let country" class="rtl-cell">{{ country.nameAr || '—' }}</td>
              </ng-container>

              <!-- Region -->
              <ng-container matColumnDef="region">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.region' | translate }}</th>
                <td mat-cell *matCellDef="let country">
                  @if (country.region) {
                    <mat-chip class="region-chip">{{ country.region }}</mat-chip>
                  } @else {
                    <span class="no-data">—</span>
                  }
                </td>
              </ng-container>

              <!-- Is Active -->
              <ng-container matColumnDef="isActive">
                <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | translate }}</th>
                <td mat-cell *matCellDef="let country">
                  <mat-chip [class]="country.isActive ? 'status-active' : 'status-inactive'">
                    {{ country.isActive ? ('common.active' | translate) : ('common.inactive' | translate) }}
                  </mat-chip>
                </td>
              </ng-container>

              <!-- Display Order -->
              <ng-container matColumnDef="displayOrder">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.order' | translate }}</th>
                <td mat-cell *matCellDef="let country">{{ country.displayOrder }}</td>
              </ng-container>

              <!-- Actions -->
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>{{ 'common.actions' | translate }}</th>
                <td mat-cell *matCellDef="let country" class="actions-cell">
                  <button mat-icon-button (click)="openEditDialog(country)"
                          [matTooltip]="'common.edit' | translate">
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                  </button>
                  <button mat-icon-button (click)="toggleActive(country)"
                          [matTooltip]="country.isActive ? ('admin.countries.deactivate' | translate) : ('admin.countries.activate' | translate)">
                    <i class="fa-solid" [class.fa-eye-slash]="country.isActive" [class.fa-eye]="!country.isActive" aria-hidden="true"></i>
                  </button>
                  <button mat-icon-button color="warn" (click)="confirmDelete(country)"
                          [matTooltip]="'common.delete' | translate">
                    <i class="fa-solid fa-trash" aria-hidden="true"></i>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
          </div>

          @if (filteredCountries().length === 0) {
            <div class="no-data-container">
              <i class="fa-solid fa-globe" aria-hidden="true"></i>
              <p>{{ 'common.noData' | translate }}</p>
            </div>
          }
        }
      </mat-card>
    </div>
  `,
  styles: [`
    .countries-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;

      &__title {
        h1 {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 0 8px;
          font-size: 28px;
          font-weight: 600;
          color: var(--ft-on-surface);

          i.fa-solid {
            color: var(--ft-primary);
          }
        }

        .subtitle {
          margin: 0;
          color: var(--ft-on-surface-variant);
        }
      }
    }

    .filters-card {
      margin-bottom: 24px;
    }

    .filters {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      padding: 16px;

      mat-form-field {
        min-width: 200px;
      }

      .filter-icon {
        color: var(--ft-on-surface-variant);
        margin-right: 8px;
      }

      .filter-count {
        margin-left: auto;
        color: var(--ft-on-surface-variant);
        font-size: 14px;
      }
    }

    .table-card {
      overflow: hidden;
    }

    .table-container {
      overflow-x: auto;
    }

    .countries-table {
      width: 100%;

      th {
        font-weight: 600;
        color: var(--ft-on-surface-variant);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .flag-cell {
        font-size: 1.5em;
        width: 50px;
        text-align: center;
      }

      .rtl-cell {
        direction: rtl;
        text-align: right;
        font-family: 'Noto Sans Arabic', 'Amiri', serif;
      }

      .actions-cell {
        width: 150px;
        text-align: center;
      }
    }

    .region-chip {
      background-color: var(--ft-surface-variant) !important;
      font-size: 12px;
    }

    .status-active {
      background-color: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-inactive {
      background-color: #ffebee !important;
      color: #c62828 !important;
    }

    .no-data {
      color: var(--ft-on-surface-variant);
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .no-data-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: var(--ft-on-surface-variant);

      i.fa-solid {
        font-size: 3rem;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      p {
        margin: 0;
      }
    }
  `]
})
export class CountriesListComponent implements OnInit {
  private readonly countriesService = inject(AdminCountriesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  countries = signal<AdminCountry[]>([]);
  filteredCountries = signal<AdminCountry[]>([]);
  regions = signal<string[]>([]);
  loading = signal(false);

  // Filters
  searchText = '';
  selectedRegion = '';
  showActiveOnly = false;

  displayedColumns = ['flag', 'code', 'nameEn', 'nameAr', 'region', 'isActive', 'displayOrder', 'actions'];

  ngOnInit() {
    this.loadCountries();
    this.loadRegions();
  }

  loadCountries() {
    this.loading.set(true);
    this.countriesService.getAll().subscribe({
      next: (countries) => {
        this.countries.set(countries);
        this.applyFilters();
        this.loading.set(false);
      },
      error: (err) => {
        this.snackBar.open(
          this.i18n.t('admin.countries.loadFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.loading.set(false);
      }
    });
  }

  loadRegions() {
    this.countriesService.getRegions().subscribe({
      next: (regions) => this.regions.set(regions),
      error: () => {}
    });
  }

  applyFilters() {
    let result = [...this.countries()];

    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      result = result.filter(c =>
        c.code.toLowerCase().includes(search) ||
        c.nameEn.toLowerCase().includes(search) ||
        (c.nameAr && c.nameAr.includes(this.searchText))
      );
    }

    if (this.selectedRegion) {
      result = result.filter(c => c.region === this.selectedRegion);
    }

    if (this.showActiveOnly) {
      result = result.filter(c => c.isActive);
    }

    this.filteredCountries.set(result);
  }

  getFlag(code: string): string {
    if (!code || code.length !== 2) return '';
    const codePoints = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  openAddDialog() {
    const dialogRef = this.dialog.open(CountryDialogComponent, {
      width: '500px',
      data: { mode: 'create' } as CountryDialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadCountries();
        this.loadRegions();
      }
    });
  }

  openEditDialog(country: AdminCountry) {
    const dialogRef = this.dialog.open(CountryDialogComponent, {
      width: '500px',
      data: { mode: 'edit', country } as CountryDialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadCountries();
        this.loadRegions();
      }
    });
  }

  toggleActive(country: AdminCountry) {
    this.countriesService.toggleActive(country.code).subscribe({
      next: (result) => {
        country.isActive = result.isActive;
        this.snackBar.open(
          `${country.nameEn} ${result.isActive ? this.i18n.t('admin.countries.activated') : this.i18n.t('admin.countries.deactivated')}`,
          this.i18n.t('common.close'),
          { duration: 2000 }
        );
      },
      error: () => {
        this.snackBar.open(
          this.i18n.t('admin.countries.toggleFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      }
    });
  }

  confirmDelete(country: AdminCountry) {
    const confirmed = confirm(
      this.i18n.t('admin.countries.confirmDelete', { name: country.nameEn, code: country.code })
    );

    if (confirmed) {
      this.deleteCountry(country);
    }
  }

  deleteCountry(country: AdminCountry) {
    this.countriesService.delete(country.code).subscribe({
      next: () => {
        this.snackBar.open(
          `${country.nameEn} ${this.i18n.t('admin.countries.deleted')}`,
          this.i18n.t('common.close'),
          { duration: 2000 }
        );
        this.loadCountries();
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.countries.deleteFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      }
    });
  }
}
