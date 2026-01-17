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
  templateUrl: './countries-list.component.html',
  styleUrls: ['./countries-list.component.scss']
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
