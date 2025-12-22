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
  template: `
    <div class="container mx-auto p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">{{ i18n.t('towns.title') }}</h1>
        @if (isSuperAdmin()) {
          <div class="flex gap-2">
            <button
              (click)="showImportModal = true"
              class="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              {{ i18n.t('towns.import') }}
            </button>
            <button
              (click)="showCreateModal = true"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ i18n.t('towns.create') }}
            </button>
          </div>
        }
      </div>

      <!-- Search & Filters -->
      <div class="mb-6 flex gap-4">
        <div class="flex-1">
          <input
            type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange()"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            [placeholder]="i18n.t('towns.searchPlaceholder')">
        </div>
        <select
          [(ngModel)]="selectedCountry"
          (ngModelChange)="loadTowns()"
          class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          <option value="">{{ i18n.t('towns.allCountries') }}</option>
          @for (country of countries(); track country) {
            <option [value]="country">{{ country }}</option>
          }
        </select>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }

      <!-- Error -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {{ error() }}
        </div>
      }

      <!-- Town Grid -->
      @if (!loading() && towns().length > 0) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (town of towns(); track town.id) {
            <a
              [routerLink]="['/towns', town.id]"
              class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer block">
              <!-- Cover -->
              <div class="h-24 bg-gradient-to-r from-emerald-400 to-teal-500 flex items-center justify-center">
                <svg class="w-12 h-12 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
              </div>

              <!-- Content -->
              <div class="p-4">
                <h3 class="text-lg font-semibold mb-1">{{ getTownName(town) }}</h3>
                @if (town.country) {
                  <p class="text-gray-600 text-sm mb-3">{{ town.country }}</p>
                }

                <div class="flex items-center justify-between text-sm text-gray-500">
                  <span>{{ town.treeCount }} {{ i18n.t('towns.trees') }}</span>
                  <span class="text-xs">{{ formatDate(town.createdAt) }}</span>
                </div>
              </div>
            </a>
          }
        </div>

        <!-- Pagination -->
        @if (totalPages() > 1) {
          <div class="mt-6 flex justify-center gap-2">
            <button
              (click)="goToPage(currentPage() - 1)"
              [disabled]="currentPage() === 1"
              class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              {{ i18n.t('common.previous') }}
            </button>
            <span class="px-4 py-2 text-gray-600">
              {{ i18n.t('common.pageOf', { page: currentPage(), total: totalPages() }) }}
            </span>
            <button
              (click)="goToPage(currentPage() + 1)"
              [disabled]="currentPage() === totalPages()"
              class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              {{ i18n.t('common.next') }}
            </button>
          </div>
        }
      }

      <!-- Empty State -->
      @if (!loading() && towns().length === 0) {
        <div class="text-center py-12">
          <svg class="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">{{ i18n.t('towns.noTowns') }}</h3>
          <p class="text-gray-500 mb-4">{{ i18n.t('towns.noTownsDesc') }}</p>
          @if (isSuperAdmin()) {
            <button
              (click)="showCreateModal = true"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              {{ i18n.t('towns.createFirst') }}
            </button>
          }
        </div>
      }

      <!-- Create Modal -->
      @if (showCreateModal) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showCreateModal = false">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" (click)="$event.stopPropagation()">
            <div class="p-6">
              <h2 class="text-xl font-semibold mb-4">{{ i18n.t('towns.createTitle') }}</h2>

              <form (ngSubmit)="createTown()">
                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ i18n.t('towns.name') }} *</label>
                  <input
                    type="text"
                    [(ngModel)]="newTown.name"
                    name="name"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ i18n.t('towns.nameEn') }}</label>
                  <input
                    type="text"
                    [(ngModel)]="newTown.nameEn"
                    name="nameEn"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ i18n.t('towns.nameAr') }}</label>
                  <input
                    type="text"
                    [(ngModel)]="newTown.nameAr"
                    name="nameAr"
                    dir="rtl"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ i18n.t('towns.nameLocal') }}</label>
                  <input
                    type="text"
                    [(ngModel)]="newTown.nameLocal"
                    name="nameLocal"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ i18n.t('towns.country') }}</label>
                  <input
                    type="text"
                    [(ngModel)]="newTown.country"
                    name="country"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="mb-6">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ i18n.t('towns.description') }}</label>
                  <textarea
                    [(ngModel)]="newTown.description"
                    name="description"
                    rows="3"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
                </div>

                @if (createError()) {
                  <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
                    {{ createError() }}
                  </div>
                }

                <div class="flex gap-3">
                  <button
                    type="button"
                    (click)="showCreateModal = false"
                    class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    {{ i18n.t('common.cancel') }}
                  </button>
                  <button
                    type="submit"
                    [disabled]="creating()"
                    class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {{ creating() ? i18n.t('common.creating') : i18n.t('common.create') }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      }

      <!-- Import Modal -->
      @if (showImportModal) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showImportModal = false">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4" (click)="$event.stopPropagation()">
            <div class="p-6">
              <h2 class="text-xl font-semibold mb-4">{{ i18n.t('towns.importTitle') }}</h2>

              <div class="mb-4">
                <p class="text-sm text-gray-600 mb-2">{{ i18n.t('towns.importDesc') }}</p>
                <code class="block bg-gray-100 p-2 rounded text-xs">name,name_en,name_ar,name_local,country</code>
              </div>

              <div
                class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4"
                [class.border-blue-500]="isDragging"
                [class.bg-blue-50]="isDragging"
                (dragover)="onDragOver($event)"
                (dragleave)="isDragging = false"
                (drop)="onDrop($event)">
                @if (selectedFile) {
                  <div class="flex items-center justify-center gap-2">
                    <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span class="text-gray-700">{{ selectedFile.name }}</span>
                    <button (click)="selectedFile = null" class="text-red-500 hover:text-red-700">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                } @else {
                  <svg class="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  <p class="text-gray-600 mb-2">{{ i18n.t('towns.dropFile') }}</p>
                  <label class="cursor-pointer text-blue-600 hover:text-blue-700">
                    {{ i18n.t('towns.browseFile') }}
                    <input type="file" accept=".csv" (change)="onFileSelected($event)" class="hidden">
                  </label>
                }
              </div>

              @if (importResult()) {
                <div class="mb-4 p-4 rounded-lg" [class.bg-green-50]="importResult()!.errors === 0" [class.bg-yellow-50]="importResult()!.errors > 0">
                  <p class="font-medium mb-2">{{ i18n.t('towns.importResult') }}</p>
                  <ul class="text-sm space-y-1">
                    <li>{{ i18n.t('towns.importCreated', { count: importResult()!.created }) }}</li>
                    <li>{{ i18n.t('towns.importSkipped', { count: importResult()!.skipped }) }}</li>
                    @if (importResult()!.errors > 0) {
                      <li class="text-red-600">{{ i18n.t('towns.importErrors', { count: importResult()!.errors }) }}</li>
                    }
                  </ul>
                </div>
              }

              @if (importError()) {
                <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
                  {{ importError() }}
                </div>
              }

              <div class="flex gap-3">
                <button
                  type="button"
                  (click)="closeImportModal()"
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {{ i18n.t('common.close') }}
                </button>
                <button
                  (click)="importTowns()"
                  [disabled]="!selectedFile || importing()"
                  class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {{ importing() ? i18n.t('common.importing') : i18n.t('towns.import') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
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
        this.error.set(err.error?.message || 'Failed to load towns');
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
        this.createError.set(err.error?.message || 'Failed to create town');
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
        this.importError.set(err.error?.message || 'Failed to import towns');
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
