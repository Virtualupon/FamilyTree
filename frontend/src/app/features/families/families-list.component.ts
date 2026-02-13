import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';


import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FamilyService } from '../../core/services/family.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyListItem, Family, CreateFamilyRequest, UpdateFamilyRequest } from '../../core/models/family.models';

@Component({
  selector: 'app-families-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,

    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslatePipe
  ],
  templateUrl: './families-list.component.html',
  styleUrls: ['./families-list.component.scss']
})
export class FamiliesListComponent implements OnInit {
  private familyService = inject(FamilyService);
  treeContext = inject(TreeContextService);
  private i18n = inject(I18nService);
  private snackBar = inject(MatSnackBar);

  // State
  families = signal<FamilyListItem[]>([]);
  loading = signal(false);
  searchQuery = '';

  // Modal state
  showModal = false;
  showDeleteModal = false;
  editingFamily: FamilyListItem | null = null;
  familyToDelete: FamilyListItem | null = null;
  saving = signal(false);
  deleting = signal(false);
  saveError = signal<string | null>(null);

  // Form data
  formData: CreateFamilyRequest = {
    name: '',
    orgId: '',
    nameEn: '',
    nameAr: '',
    nameLocal: '',
    description: '',
    color: '#187573'
  };

  // Color options
  colorOptions = [
    '#187573', '#C17E3E', '#3b82f6', '#10b981', '#f59e0b',
    '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
  ];

  // Computed: filtered families
  filteredFamilies = computed(() => {
    let result = this.families();
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.nameEn?.toLowerCase().includes(query) ||
        f.nameAr?.toLowerCase().includes(query) ||
        f.nameLocal?.toLowerCase().includes(query)
      );
    }
    return result;
  });

  ngOnInit(): void {
    // Load families when tree changes
    if (this.treeContext.selectedTree()) {
      this.loadFamilies();
    }

    // Watch for tree selection changes
    this.treeContext.selectedTreeId;
  }

  loadFamilies(): void {
    const tree = this.treeContext.selectedTree();
    if (!tree) return;

    this.loading.set(true);
    this.familyService.getFamiliesByTree(tree.id).subscribe({
      next: (families) => {
        this.families.set(families);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load families:', err);
        this.loading.set(false);
        this.snackBar.open(
          this.i18n.t('messages.loadError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  openCreateModal(): void {
    this.editingFamily = null;
    this.formData = {
      name: '',
      orgId: this.treeContext.selectedTree()?.id || '',
      nameEn: '',
      nameAr: '',
      nameLocal: '',
      description: '',
      color: '#187573'
    };
    this.saveError.set(null);
    this.showModal = true;
  }

  openEditModal(family: FamilyListItem): void {
    this.editingFamily = family;
    this.formData = {
      name: family.name,
      orgId: this.treeContext.selectedTree()?.id || '',
      nameEn: family.nameEn || '',
      nameAr: family.nameAr || '',
      nameLocal: family.nameLocal || '',
      description: '',
      color: family.color || '#187573'
    };
    this.saveError.set(null);
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingFamily = null;
  }

  saveFamily(): void {
    if (!this.formData.name.trim()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const request = {
      ...this.formData,
      orgId: this.treeContext.selectedTree()?.id || ''
    };

    const operation = this.editingFamily
      ? this.familyService.updateFamily(this.editingFamily.id, request as UpdateFamilyRequest)
      : this.familyService.createFamily(request);

    operation.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadFamilies();
        this.snackBar.open(
          this.editingFamily
            ? this.i18n.t('messages.updateSuccess')
            : this.i18n.t('messages.createSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err.error?.message || this.i18n.t('messages.saveError'));
      }
    });
  }

  confirmDelete(family: FamilyListItem): void {
    this.familyToDelete = family;
    this.showDeleteModal = true;
  }

  deleteFamily(): void {
    if (!this.familyToDelete) return;

    this.deleting.set(true);
    this.familyService.deleteFamily(this.familyToDelete.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteModal = false;
        this.familyToDelete = null;
        this.loadFamilies();
        this.snackBar.open(
          this.i18n.t('messages.deleteSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      },
      error: (err) => {
        this.deleting.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('messages.deleteError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  getLocalizedName(family: FamilyListItem): string {
    return this.i18n.getFamilyName(family);
  }

  hasMultipleNames(family: FamilyListItem): boolean {
    return !!(family.nameAr || family.nameLocal);
  }
}
