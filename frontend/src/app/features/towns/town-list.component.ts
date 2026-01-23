import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TownService } from '../../core/services/town.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TownListItem, CreateTownRequest, PagedResult } from '../../core/models/town.models';

@Component({
  selector: 'app-town-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './town-list.component.html'
})
export class TownListComponent implements OnInit {
  private townService = inject(TownService);
  private authService = inject(AuthService);
  i18n = inject(I18nService);

  towns = signal<TownListItem[]>([]);
  countries = signal<string[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  currentPage = signal(1);
  totalPages = signal(1);
  pageSize = 12;

  searchQuery = '';
  selectedCountry = '';
  private searchTimeout: any;

  showCreateModal = false;
  creating = signal(false);
  createError = signal<string | null>(null);
  newTown: CreateTownRequest = {
    name: '',
    nameEn: null,
    nameAr: null,
    nameLocal: null,
    description: null,
    country: null
  };

  showImportModal = false;
  importing = signal(false);
  importError = signal<string | null>(null);
  importResult = signal<{ created: number; skipped: number; errors: number } | null>(null);
  selectedFile: File | null = null;
  isDragging = false;

  ngOnInit() {
    this.loadTowns();
    this.loadCountries();
  }

  loadTowns() {
    this.loading.set(true);
    this.error.set(null);

    this.townService.getTowns({
      page: this.currentPage(),
      pageSize: this.pageSize,
      nameQuery: this.searchQuery || undefined,
      country: this.selectedCountry || undefined
    }).subscribe({
      next: (result) => {
        this.towns.set(result.items);
        this.totalPages.set(result.totalPages);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('towns.failedLoad'));
        this.loading.set(false);
      }
    });
  }

  loadCountries() {
    this.townService.getCountries().subscribe({
      next: (countries) => this.countries.set(countries),
      error: () => {} // Ignore error for countries
    });
  }

  onSearchChange() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadTowns();
    }, 300);
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadTowns();
  }

  createTown() {
    if (!this.newTown.name.trim()) return;

    this.creating.set(true);
    this.createError.set(null);

    this.townService.createTown(this.newTown).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.newTown = { name: '', nameEn: null, nameAr: null, nameLocal: null, description: null, country: null };
        this.loadTowns();
        this.loadCountries();
        this.creating.set(false);
      },
      error: (err) => {
        this.createError.set(err.error?.message || this.i18n.t('towns.failedCreate'));
        this.creating.set(false);
      }
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        this.selectedFile = file;
      }
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  importTowns() {
    if (!this.selectedFile) return;

    this.importing.set(true);
    this.importError.set(null);
    this.importResult.set(null);

    this.townService.importTowns(this.selectedFile).subscribe({
      next: (result) => {
        this.importResult.set(result);
        this.importing.set(false);
        this.loadTowns();
        this.loadCountries();
      },
      error: (err) => {
        this.importError.set(err.error?.message || this.i18n.t('towns.failedImport'));
        this.importing.set(false);
      }
    });
  }

  closeImportModal() {
    this.showImportModal = false;
    this.selectedFile = null;
    this.importResult.set(null);
    this.importError.set(null);
  }

  getTownName(town: TownListItem): string {
    return this.i18n.getTownName(town);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  isAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';
  }

  isSuperAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'SuperAdmin';
  }
}
