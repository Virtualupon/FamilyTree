import { Component, OnInit, OnDestroy, inject, signal, computed, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatDividerModule } from '@angular/material/divider';

import { TreeService } from '../../core/services/tree.service';
import { PersonService } from '../../core/services/person.service';
import { PersonLinkService } from '../../core/services/person-link.service';
import { PersonMediaService } from '../../core/services/person-media.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { TreePersonNode, PedigreeRequest } from '../../core/models/tree.models';
import { Sex, PersonListItem } from '../../core/models/person.models';
import { TreeLinksSummary, PersonLinkSummary } from '../../core/models/family-tree.models';
import { RelationshipPathResponse } from '../../core/models/relationship-path.models';
import { LoadingComponent, EmptyStateComponent } from '../../shared/components';
import { PersonSelectorComponent } from './person-selector.component';
import { D3FamilyTreeComponent } from './d3-family-tree.component';
import { TimelineViewComponent } from './timeline-view.component';
import { FamilySheetComponent } from './family-sheet.component';
import { RelationshipFinderDialogComponent, RelationshipFinderDialogResult } from './relationship-finder-dialog.component';
import { AddRelationshipDialogComponent, RelationshipDialogData, RelationshipDialogType } from '../people/add-relationship-dialog.component';
import { PersonFormDialogComponent, PersonFormDialogData } from '../people/person-form-dialog.component';
import { RelationshipPathViewComponent } from './relationship-path-view.component';

@Component({
  selector: 'app-tree-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatMenuModule,
    MatTooltipModule,
    MatBottomSheetModule,
    MatDividerModule,
    TranslatePipe,
    LoadingComponent,
    EmptyStateComponent,
    D3FamilyTreeComponent,
    TimelineViewComponent,
    FamilySheetComponent,
    RelationshipPathViewComponent
  ],
  templateUrl: './tree-view.component.html',
  styleUrls: ['./tree-view.component.scss']
})
export class TreeViewComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('treeContainer') treeContainer!: ElementRef;
  @ViewChild('d3Tree') d3TreeComponent!: D3FamilyTreeComponent;
  @ViewChild('timelineView') timelineViewComponent!: TimelineViewComponent;
  
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly treeService = inject(TreeService);
  private readonly personService = inject(PersonService);
  private readonly personLinkService = inject(PersonLinkService);
  private readonly treeContext = inject(TreeContextService);
  private readonly i18n = inject(I18nService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly mediaService = inject(PersonMediaService);
  private readonly destroy$ = new Subject<void>();

  // Avatar cache: personId -> objectUrl
  private avatarCache = new Map<string, string>();
  private avatarLoading = new Set<string>();

  readonly Sex = Sex;
  
  // State
  selectedPerson = signal<PersonListItem | null>(null);
  treeData = signal<TreePersonNode | null>(null);
  crossTreeLinks = signal<TreeLinksSummary | null>(null);
  loading = signal(false);
  viewMode = signal<'pedigree' | 'descendants' | 'hourglass' | 'timeline' | 'familySheet'>('pedigree');

  // Signal for selected person avatar
  selectedPersonAvatarUrl = signal<string | null>(null);

  // Relationship path state
  showRelationshipPath = signal(false);
  currentRelationshipPath = signal<RelationshipPathResponse | null>(null);
  private lastFromPerson: TreePersonNode | PersonListItem | null = null;
  
  // Settings
  generations = 3;
  includeSpouses = true;
  
  // Zoom & Pan
  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);
  
  private isPanning = false;
  private startX = 0;
  private startY = 0;
  private startPanX = 0;
  private startPanY = 0;
  
  ngOnInit(): void {
    // Check for personId in route params
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['personId']) {
        this.loadPersonById(params['personId']);
      }
    });
  }
  
  ngAfterViewInit(): void {
    // Setup mouse/touch event listeners for panning
    document.addEventListener('mousemove', this.onPanMove.bind(this));
    document.addEventListener('mouseup', this.onPanEnd.bind(this));
    document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.onTouchEnd.bind(this));
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('mousemove', this.onPanMove.bind(this));
    document.removeEventListener('mouseup', this.onPanEnd.bind(this));
    document.removeEventListener('touchmove', this.onTouchMove.bind(this));
    document.removeEventListener('touchend', this.onTouchEnd.bind(this));

    // Revoke all avatar object URLs to prevent memory leaks
    this.avatarCache.forEach(url => URL.revokeObjectURL(url));
    this.avatarCache.clear();
  }
  
  private loadPersonById(id: string): void {
    this.personService.getPerson(id).subscribe({
      next: (person) => {
        const listItem: PersonListItem = {
          id: person.id,
          familyId: person.familyId,
          familyName: person.familyName,
          primaryName: person.primaryName,
          nameArabic: person.nameArabic,
          nameEnglish: person.nameEnglish,
          nameNobiin: person.nameNobiin,
          sex: person.sex,
          birthDate: person.birthDate,
          birthPrecision: person.birthPrecision,
          deathDate: person.deathDate,
          deathPrecision: person.deathPrecision,
          birthPlace: person.birthPlace,
          deathPlace: person.deathPlace,
          isVerified: person.isVerified,
          needsReview: person.needsReview,
          mediaCount: 0,
          avatarMediaId: person.avatarMediaId
        };
        this.setSelectedPerson(listItem);
        this.loadTree();
      },
      error: (err) => {
        console.error('Failed to load person:', err);
        this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }
  
  openPersonSelector(): void {
    const ref = this.bottomSheet.open(PersonSelectorComponent, {
      panelClass: 'ft-bottom-sheet'
    });
    
    ref.afterDismissed().subscribe(result => {
      if (result) {
        this.setSelectedPerson(result);
        this.loadTree();
        // Update URL
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { personId: result.id },
          queryParamsHandling: 'merge'
        });
      }
    });
  }
  
  setViewMode(mode: 'pedigree' | 'descendants' | 'hourglass' | 'timeline' | 'familySheet'): void {
    this.viewMode.set(mode);
    // Only reload tree for tree-based views, not for timeline/familySheet
    if (mode !== 'timeline' && mode !== 'familySheet') {
      this.loadTree();
    }
  }

  getViewModeLabel(): string {
    const labels: Record<string, string> = {
      pedigree: this.i18n.t('tree.pedigree'),
      descendants: this.i18n.t('tree.descendants'),
      hourglass: this.i18n.t('tree.hourglass'),
      timeline: this.i18n.t('tree.timeline'),
      familySheet: this.i18n.t('tree.familySheet')
    };
    return labels[this.viewMode()];
  }

  // Check if current view mode is a tree-based view
  isTreeView(): boolean {
    const mode = this.viewMode();
    return mode === 'pedigree' || mode === 'descendants' || mode === 'hourglass';
  }

  // Get the tree-compatible view mode for D3 component
  getTreeViewMode(): 'pedigree' | 'descendants' | 'hourglass' {
    const mode = this.viewMode();
    if (mode === 'pedigree' || mode === 'descendants' || mode === 'hourglass') {
      return mode;
    }
    return 'pedigree'; // Default fallback
  }
  
  onSettingsChange(): void {
    this.loadTree();
  }
  
  private loadTree(): void {
    const person = this.selectedPerson();
    if (!person) return;

    this.loading.set(true);
    
    // Get treeId for SuperAdmin/Admin access
    const treeId = this.treeContext.effectiveTreeId() || undefined;

    const request: PedigreeRequest = {
      personId: person.id,
      treeId: treeId,
      generations: this.generations,
      includeSpouses: this.includeSpouses
    };

    let observable;
    switch (this.viewMode()) {
      case 'descendants':
        observable = this.treeService.getDescendants({
          personId: person.id,
          treeId: treeId,
          generations: this.generations,
          includeSpouses: this.includeSpouses
        });
        break;
      case 'hourglass':
        observable = this.treeService.getHourglass({
          personId: person.id,
          treeId: treeId,
          ancestorGenerations: this.generations,
          descendantGenerations: this.generations,
          includeSpouses: this.includeSpouses
        });
        break;
      default:
        observable = this.treeService.getPedigree(request);
    }

    observable.subscribe({
      next: (data: any) => {
        // Handle hourglass response format
        if (this.viewMode() === 'hourglass' && data.rootPerson) {
          const node = data.rootPerson as TreePersonNode;
          node.parents = data.ancestors || [];
          node.children = data.descendants || [];
          this.treeData.set(node);
        } else {
          this.treeData.set(data);
        }
        this.loading.set(false);
        this.resetView();

        // Fetch cross-tree links for the current tree
        this.loadCrossTreeLinks();
      },
      error: (err) => {
        console.error('Failed to load tree:', err);
        this.loading.set(false);
        this.snackBar.open(this.i18n.t('error.generic'), this.i18n.t('common.close'), { duration: 5000 });
      }
    });
  }

  private loadCrossTreeLinks(): void {
    const treeId = this.treeContext.selectedTreeId();
    if (!treeId) {
      this.crossTreeLinks.set(null);
      return;
    }

    this.personLinkService.getTreeLinksSummary(treeId).subscribe({
      next: (links) => {
        this.crossTreeLinks.set(links);
      },
      error: (err) => {
        console.error('Failed to load cross-tree links:', err);
        // Don't show error to user - cross-tree links are optional
        this.crossTreeLinks.set(null);
      }
    });
  }
  
  onNodeClick(node: TreePersonNode): void {
    const listItem: PersonListItem = {
      id: node.id,
      familyId: null,
      familyName: null,
      primaryName: node.primaryName,
      nameArabic: node.nameArabic,
      nameEnglish: node.nameEnglish,
      nameNobiin: node.nameNobiin,
      sex: node.sex,
      birthDate: node.birthDate || null,
      birthPrecision: 0,
      deathDate: node.deathDate || null,
      deathPrecision: 0,
      birthPlace: node.birthPlace || null,
      deathPlace: node.deathPlace || null,
      isVerified: false,
      needsReview: false,
      mediaCount: 0,
      avatarMediaId: node.avatarMediaId
    };
    this.setSelectedPerson(listItem);
    this.loadTree();
    
    // Update URL
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { personId: node.id },
      queryParamsHandling: 'merge'
    });
  }
  
  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  getDisplayName(person: { primaryName?: string | null; nameArabic?: string | null; nameEnglish?: string | null; nameNobiin?: string | null }): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') {
      return person.nameArabic || person.nameEnglish || person.primaryName || unknown;
    }
    if (lang === 'nob') {
      return person.nameNobiin || person.nameEnglish || person.primaryName || unknown;
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || unknown;
  }

  formatYear(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }

  /**
   * Load avatar for a person and cache it
   */
  private loadAvatar(personId: string, avatarMediaId: string | null | undefined): void {
    if (!avatarMediaId) return;
    if (this.avatarCache.has(personId)) return;
    if (this.avatarLoading.has(personId)) return;

    this.avatarLoading.add(personId);

    this.mediaService.getMediaById(avatarMediaId).subscribe({
      next: (media) => {
        const objectUrl = this.mediaService.createObjectUrl(
          media.base64Data,
          media.mimeType || 'image/jpeg'
        );
        this.avatarCache.set(personId, objectUrl);
        this.avatarLoading.delete(personId);

        // If this is the selected person, update the signal
        if (this.selectedPerson()?.id === personId) {
          this.selectedPersonAvatarUrl.set(objectUrl);
        }
      },
      error: () => {
        this.avatarLoading.delete(personId);
      }
    });
  }

  /**
   * Get cached avatar URL for a person
   */
  getAvatarUrl(personId: string): string | null {
    return this.avatarCache.get(personId) || null;
  }

  /**
   * Set selected person and load avatar
   */
  private setSelectedPerson(person: PersonListItem | null): void {
    this.selectedPerson.set(person);

    if (person?.avatarMediaId) {
      const cached = this.avatarCache.get(person.id);
      if (cached) {
        this.selectedPersonAvatarUrl.set(cached);
      } else {
        this.selectedPersonAvatarUrl.set(null);
        this.loadAvatar(person.id, person.avatarMediaId);
      }
    } else {
      this.selectedPersonAvatarUrl.set(null);
    }
  }

  // Zoom controls
  zoomIn(): void {
    this.zoom.update(z => Math.min(z + 0.1, 2));
  }
  
  zoomOut(): void {
    this.zoom.update(z => Math.max(z - 0.1, 0.3));
  }
  
  resetView(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }
  
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    this.zoom.update(z => Math.max(0.3, Math.min(2, z + delta)));
  }
  
  // Pan controls
  onPanStart(event: MouseEvent): void {
    this.isPanning = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startPanX = this.panX();
    this.startPanY = this.panY();
  }
  
  onPanMove(event: MouseEvent): void {
    if (!this.isPanning) return;
    const dx = (event.clientX - this.startX) / this.zoom();
    const dy = (event.clientY - this.startY) / this.zoom();
    this.panX.set(this.startPanX + dx);
    this.panY.set(this.startPanY + dy);
  }
  
  onPanEnd(): void {
    this.isPanning = false;
  }
  
  // Touch support
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isPanning = true;
      this.startX = event.touches[0].clientX;
      this.startY = event.touches[0].clientY;
      this.startPanX = this.panX();
      this.startPanY = this.panY();
    }
  }
  
  onTouchMove(event: TouchEvent): void {
    if (!this.isPanning || event.touches.length !== 1) return;
    event.preventDefault();
    const dx = (event.touches[0].clientX - this.startX) / this.zoom();
    const dy = (event.touches[0].clientY - this.startY) / this.zoom();
    this.panX.set(this.startPanX + dx);
    this.panY.set(this.startPanY + dy);
  }
  
  onTouchEnd(): void {
    this.isPanning = false;
  }

  // D3 Tree methods
  onD3NodeClick(node: TreePersonNode): void {
    const listItem: PersonListItem = {
      id: node.id,
      familyId: null,
      familyName: null,
      primaryName: node.primaryName,
      nameArabic: node.nameArabic,
      nameEnglish: node.nameEnglish,
      nameNobiin: node.nameNobiin,
      sex: node.sex,
      birthDate: node.birthDate || null,
      birthPrecision: 0,
      deathDate: node.deathDate || null,
      deathPrecision: 0,
      birthPlace: node.birthPlace || null,
      deathPlace: node.deathPlace || null,
      isVerified: false,
      needsReview: false,
      mediaCount: 0,
      avatarMediaId: node.avatarMediaId
    };
    this.setSelectedPerson(listItem);

    // Update URL
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { personId: node.id },
      queryParamsHandling: 'merge'
    });
  }

  onD3NodeDoubleClick(node: TreePersonNode): void {
    // Re-center tree on double-clicked person
    const listItem: PersonListItem = {
      id: node.id,
      familyId: null,
      familyName: null,
      primaryName: node.primaryName,
      nameArabic: node.nameArabic,
      nameEnglish: node.nameEnglish,
      nameNobiin: node.nameNobiin,
      sex: node.sex,
      birthDate: node.birthDate || null,
      birthPrecision: 0,
      deathDate: node.deathDate || null,
      deathPrecision: 0,
      birthPlace: node.birthPlace || null,
      deathPlace: node.deathPlace || null,
      isVerified: false,
      needsReview: false,
      mediaCount: 0,
      avatarMediaId: node.avatarMediaId
    };
    this.setSelectedPerson(listItem);
    this.loadTree();

    // Update URL
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { personId: node.id },
      queryParamsHandling: 'merge'
    });
  }

  d3ZoomIn(): void {
    this.d3TreeComponent?.zoomIn();
  }

  d3ZoomOut(): void {
    this.d3TreeComponent?.zoomOut();
  }

  d3ResetZoom(): void {
    this.d3TreeComponent?.resetZoom();
  }

  d3FitToScreen(): void {
    this.d3TreeComponent?.fitToScreen();
  }

  /**
   * Open the edit dialog for the currently selected person
   */
  editSelectedPerson(): void {
    const person = this.selectedPerson();
    if (!person) return;

    // First fetch the full person data
    this.personService.getPerson(person.id).subscribe({
      next: (fullPerson) => {
        const dialogData: PersonFormDialogData = {
          person: fullPerson,
          treeId: this.treeContext.selectedTreeId() || ''
        };

        const dialogRef = this.dialog.open(PersonFormDialogComponent, {
          data: dialogData,
          width: '700px',
          maxWidth: '95vw',
          maxHeight: '90vh'
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result) {
            // Reload the tree to show updates
            this.loadTree();

            // Update the selected person display name
            const updatedPerson: PersonListItem = {
              ...person,
              nameArabic: result.nameArabic,
              nameEnglish: result.nameEnglish,
              nameNobiin: result.nameNobiin,
              primaryName: result.nameEnglish || result.nameArabic || result.nameNobiin || person.primaryName
            };
            this.setSelectedPerson(updatedPerson);

            const message = this.i18n.t('personForm.updateSuccess');
            this.snackBar.open(message, this.i18n.t('common.close'), { duration: 3000 });
          }
        });
      },
      error: () => {
        this.snackBar.open(this.i18n.t('common.error'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  /**
   * Open the edit dialog for a specific person (from Family Sheet)
   */
  onPersonEdit(node: TreePersonNode): void {
    this.personService.getPerson(node.id).subscribe({
      next: (fullPerson) => {
        const dialogData: PersonFormDialogData = {
          person: fullPerson,
          treeId: this.treeContext.selectedTreeId() || ''
        };

        const dialogRef = this.dialog.open(PersonFormDialogComponent, {
          data: dialogData,
          width: '700px',
          maxWidth: '95vw',
          maxHeight: '90vh'
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result) {
            // Reload the tree to show updates
            this.loadTree();

            const message = this.i18n.t('personForm.updateSuccess');
            this.snackBar.open(message, this.i18n.t('common.close'), { duration: 3000 });
          }
        });
      },
      error: () => {
        this.snackBar.open(this.i18n.t('common.error'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  onCrossTreeLinkClick(link: PersonLinkSummary): void {
    // Navigate to the linked person in their tree
    // First, switch tree context if different
    const currentTreeId = this.treeContext.selectedTreeId();

    if (link.linkedTreeId !== currentTreeId) {
      // Switch to the linked tree first
      this.treeContext.selectTree(link.linkedTreeId);
    }

    // Navigate to the tree view with the linked person
    this.router.navigate(['/tree'], {
      queryParams: { personId: link.linkedPersonId }
    });

    // Show a snackbar indicating the navigation
    const message = this.i18n.t('crossTree.navigatingTo')
      .replace('{person}', link.linkedPersonName)
      .replace('{tree}', link.linkedTreeName);
    this.snackBar.open(message, this.i18n.t('common.close'), { duration: 3000 });
  }

  // Relationship finder methods
  onFindRelationship(person: TreePersonNode): void {
    this.lastFromPerson = person;

    const dialogRef = this.dialog.open(RelationshipFinderDialogComponent, {
      data: { fromPerson: person },
      width: '500px',
      maxWidth: '95vw'
    });

    dialogRef.afterClosed().subscribe((result: RelationshipFinderDialogResult | undefined) => {
      if (result?.pathData) {
        this.currentRelationshipPath.set(result.pathData);
        this.showRelationshipPath.set(true);
      }
    });
  }

  closeRelationshipPath(): void {
    this.showRelationshipPath.set(false);
    this.currentRelationshipPath.set(null);
  }

  onTryAnotherRelationship(): void {
    this.closeRelationshipPath();

    // Re-open the finder dialog with the same from person
    if (this.lastFromPerson) {
      setTimeout(() => {
        this.onFindRelationship(this.lastFromPerson as TreePersonNode);
      }, 300);
    }
  }

  // Add/Edit relationship methods
  onAddRelationship(person: TreePersonNode, relationshipType: RelationshipDialogType = 'parent'): void {
    const dialogData: RelationshipDialogData = {
      personId: person.id,
      personName: person.primaryName || person.nameEnglish || person.nameArabic,
      type: relationshipType
    };

    const dialogRef = this.dialog.open(AddRelationshipDialogComponent, {
      data: dialogData,
      width: '520px',
      maxWidth: '95vw'
    });

    dialogRef.afterClosed().subscribe((result: { success: boolean } | undefined) => {
      if (result?.success) {
        // Reload the tree to show the new relationship
        this.loadTree();

        // Show success message
        const message = this.i18n.t('relationship.relationshipCreated');
        this.snackBar.open(message, this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }
}