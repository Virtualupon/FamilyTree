import { Component, inject, signal, output, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GedcomService } from '../../core/services/gedcom.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { TownService } from '../../core/services/town.service';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { FamilyTreeListItem } from '../../core/models/family-tree.models';
import {
  GedcomImportResult,
  GedcomPreviewResult
} from '../../core/models/gedcom.models';
import { TownListItem } from '../../core/models/town.models';

type ImportStep = 'upload' | 'preview' | 'options' | 'importing' | 'result';

@Component({
  selector: 'app-gedcom-import-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gedcom-import-dialog.component.html',
  styleUrls: ['./gedcom-import-dialog.component.scss']
})
export class GedcomImportDialogComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private readonly gedcomService = inject(GedcomService);
  private readonly treeService = inject(FamilyTreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly townService = inject(TownService);

  readonly close = output<void>();
  readonly imported = output<void>();

  readonly step = signal<ImportStep>('upload');
  readonly loading = signal(false);
  readonly isDragOver = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly preview = signal<GedcomPreviewResult | null>(null);
  readonly result = signal<GedcomImportResult | null>(null);
  readonly availableTowns = signal<TownListItem[]>([]);
  readonly availableTrees = signal<FamilyTreeListItem[]>([]);
  readonly townTouched = signal(false);

  selectedFile: File | null = null;
  treeName = '';
  selectedTownId = '';
  selectedTreeId = '';
  importNotes = true;
  importOccupations = true;

  ngOnInit(): void {
    this.loadTowns();
    this.preSelectCurrentTree();
  }

  private preSelectCurrentTree(): void {
    const currentTree = this.treeContext.selectedTree();
    if (currentTree) {
      this.selectedTownId = currentTree.townId;
      this.selectedTreeId = currentTree.id;

      this.treeService.getMyTrees().subscribe({
        next: (trees) => {
          const filteredTrees = trees.filter(t => t.townId === this.selectedTownId);
          this.availableTrees.set(filteredTrees);
        }
      });
    }
  }

  private loadTowns(): void {
    // Use assigned towns for Admin users, or load all towns for SuperAdmin
    const assignedTowns = this.treeContext.assignedTowns();
    if (assignedTowns.length > 0) {
      this.availableTowns.set(assignedTowns.map(t => ({
        id: t.id,
        name: t.name,
        nameEn: t.nameEn || undefined,
        nameAr: t.nameAr || undefined,
        nameLocal: t.nameLocal || undefined,
        country: '',
        region: '',
        treeCount: t.treeCount,
        personCount: 0,
        createdAt: new Date().toISOString()
      })));
      // Auto-select if only one town
      if (assignedTowns.length === 1) {
        this.selectedTownId = assignedTowns[0].id;
        this.onTownChange();
      }
    } else {
      // Load all towns for SuperAdmin
      this.townService.getTowns({ page: 1, pageSize: 1000 }).subscribe({
        next: (result) => {
          this.availableTowns.set(result.items);
        }
      });
    }
  }

  onTownChange(): void {
    this.selectedTreeId = '';
    this.availableTrees.set([]);

    if (!this.selectedTownId) return;

    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        const filteredTrees = trees.filter(t => t.townId === this.selectedTownId);
        this.availableTrees.set(filteredTrees);

        if (filteredTrees.length === 1) {
          this.selectedTreeId = filteredTrees[0].id;
        }
      },
      error: (err) => {
        console.error('Failed to load trees:', err);
      }
    });
  }

  getLocalizedTownName(town: TownListItem): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'nob' && town.nameLocal) return town.nameLocal;
    return town.nameEn || town.name;
  }

  readonly stepIndex = computed(() => {
    const steps: ImportStep[] = ['upload', 'preview', 'options', 'importing', 'result'];
    return steps.indexOf(this.step());
  });

  t(key: string, params?: Record<string, any>): string {
    let value = this.i18n.t(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(`{${k}}`, String(v));
      });
    }
    return value;
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    this.uploadError.set(null);

    if (!file.name.toLowerCase().endsWith('.ged')) {
      this.uploadError.set(this.t('gedcom.error.invalidFile'));
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      this.uploadError.set(this.t('gedcom.error.fileTooLarge'));
      return;
    }

    this.selectedFile = file;
    this.treeName = file.name.replace(/\.ged$/i, '');
    this.loadPreview();
  }

  private loadPreview(): void {
    if (!this.selectedFile) return;

    this.step.set('preview');
    this.loading.set(true);

    this.gedcomService.preview(this.selectedFile).subscribe({
      next: (result) => {
        this.preview.set(result);
        this.loading.set(false);
      },
      error: (err) => {
        this.uploadError.set(err.error?.error || this.t('gedcom.error.previewFailed'));
        this.step.set('upload');
        this.loading.set(false);
      }
    });
  }

  previousStep(): void {
    const current = this.step();
    if (current === 'preview') {
      this.step.set('upload');
    } else if (current === 'options') {
      this.step.set('preview');
    }
  }

  nextStep(): void {
    const current = this.step();
    if (current === 'preview') {
      this.step.set('options');
    } else if (current === 'options') {
      this.startImport();
    }
  }

  private startImport(): void {
    if (!this.selectedFile || !this.selectedTownId || !this.selectedTreeId) return;

    this.step.set('importing');

    this.gedcomService.import(this.selectedFile, {
      createNewTree: false,
      existingTreeId: this.selectedTreeId,
      townId: this.selectedTownId,
      importNotes: this.importNotes,
      importOccupations: this.importOccupations
    }).subscribe({
      next: (result) => {
        this.result.set(result);
        this.step.set('result');
      },
      error: (err) => {
        this.result.set({
          success: false,
          message: err.error?.message || this.t('gedcom.error.importFailed'),
          individualsImported: 0,
          familiesImported: 0,
          relationshipsCreated: 0,
          warnings: [],
          errors: err.error?.errors || [err.message],
          duration: '0'
        });
        this.step.set('result');
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
