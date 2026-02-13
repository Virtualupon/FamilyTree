import { Component, Input, Output, EventEmitter, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TreeService } from '../../core/services/tree.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { RootPersonsResponse, RootPersonSummary } from '../../core/models/tree.models';
import { Sex } from '../../core/models/person.models';

/**
 * Modal component that displays root persons (top-level ancestors) for a family tree.
 * Shows a visual representation of the tree's founding ancestors with descendant statistics.
 *
 * Features:
 * - Loads root persons for a tree via API
 * - Displays each root person with their descendant count and generation depth
 * - Provides navigation to person detail pages
 * - Handles loading, error, and empty states
 * - Uses takeUntilDestroyed for proper observable cleanup
 */
@Component({
  selector: 'app-tree-diagram-modal',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './tree-diagram-modal.component.html',
  styleUrls: ['./tree-diagram-modal.component.scss']
})
export class TreeDiagramModalComponent implements OnInit {
  private readonly treeService = inject(TreeService);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  /** Tree ID to load root persons for */
  @Input({ required: true }) treeId!: string;

  /** Tree name for display in header */
  @Input() treeName = '';

  /** Emits when user closes the modal */
  @Output() close = new EventEmitter<void>();

  // Expose Sex enum to template
  readonly Sex = Sex;

  // State signals
  loading = signal(true);
  error = signal<string | null>(null);
  rootPersons = signal<RootPersonsResponse | null>(null);

  ngOnInit(): void {
    this.loadRootPersons();
  }

  /**
   * Load root persons from the API
   */
  loadRootPersons(): void {
    this.loading.set(true);
    this.error.set(null);

    this.treeService.getRootPersons(this.treeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.rootPersons.set(response);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load root persons:', err);
          this.error.set(this.i18n.t('treeDiagram.loadError'));
          this.loading.set(false);
        }
      });
  }

  /**
   * Close the modal
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Handle backdrop click - close modal
   */
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }

  /**
   * Get localized name for a root person
   */
  getLocalizedName(person: RootPersonSummary): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return person.nameArabic || person.primaryName;
      case 'nob':
        return person.nameNobiin || person.primaryName;
      case 'en':
      default:
        return person.nameEnglish || person.primaryName;
    }
  }

  /**
   * Format birth year from date string
   */
  formatYear(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return dateStr.split('-')[0] || '';
    }
  }

  /**
   * Get gender icon class
   */
  getGenderClass(sex: Sex): string {
    switch (sex) {
      case Sex.Male:
        return 'male';
      case Sex.Female:
        return 'female';
      default:
        return 'unknown';
    }
  }

  /**
   * Get display text for descendant statistics
   */
  getDescendantText(person: RootPersonSummary): string {
    const descendants = person.descendantCount;
    const children = person.childCount;
    const generations = person.generationDepth;

    if (descendants === 0) {
      return this.i18n.t('treeDiagram.noDescendants');
    }

    return this.i18n.t('treeDiagram.descendantStats', {
      descendants: descendants.toString(),
      children: children.toString(),
      generations: generations.toString()
    });
  }

  /**
   * Retry loading on error
   */
  retry(): void {
    this.loadRootPersons();
  }
}
