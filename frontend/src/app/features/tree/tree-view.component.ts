import { Component, OnInit, OnDestroy, inject, signal, computed, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';

import { TreeService } from '../../core/services/tree.service';
import { PersonService } from '../../core/services/person.service';
import { PersonLinkService } from '../../core/services/person-link.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { TreePersonNode, PedigreeRequest } from '../../core/models/tree.models';
import { Sex, PersonListItem } from '../../core/models/person.models';
import { TreeLinksSummary, PersonLinkSummary } from '../../core/models/family-tree.models';
import { LoadingComponent, EmptyStateComponent } from '../../shared/components';
import { PersonSelectorComponent } from './person-selector.component';
import { D3FamilyTreeComponent } from './d3-family-tree.component';

@Component({
  selector: 'app-tree-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatMenuModule,
    MatTooltipModule,
    MatBottomSheetModule,
    TranslatePipe,
    LoadingComponent,
    EmptyStateComponent,
    D3FamilyTreeComponent
  ],
  template: `
    <div class="tree-page">
      <!-- Header -->
      <header class="tree-page__header">
        <div class="tree-page__title-section">
          <h1 class="ft-page__title">{{ 'tree.title' | translate }}</h1>
        </div>
        
        <div class="tree-page__controls">
          <!-- View Mode Selector -->
          <div class="tree-page__view-modes d-mobile-none">
            <button 
              mat-stroked-button 
              [class.active]="viewMode() === 'pedigree'"
              (click)="setViewMode('pedigree')">
              {{ 'tree.pedigree' | translate }}
            </button>
            <button 
              mat-stroked-button 
              [class.active]="viewMode() === 'descendants'"
              (click)="setViewMode('descendants')">
              {{ 'tree.descendants' | translate }}
            </button>
            <button 
              mat-stroked-button 
              [class.active]="viewMode() === 'hourglass'"
              (click)="setViewMode('hourglass')">
              {{ 'tree.hourglass' | translate }}
            </button>
          </div>
          
          <!-- Mobile View Mode Menu -->
          <button mat-stroked-button class="d-desktop-none" [matMenuTriggerFor]="viewModeMenu">
            {{ getViewModeLabel() }}
            <mat-icon>arrow_drop_down</mat-icon>
          </button>
          <mat-menu #viewModeMenu="matMenu">
            <button mat-menu-item (click)="setViewMode('pedigree')">
              <mat-icon>arrow_upward</mat-icon>
              {{ 'tree.pedigree' | translate }}
            </button>
            <button mat-menu-item (click)="setViewMode('descendants')">
              <mat-icon>arrow_downward</mat-icon>
              {{ 'tree.descendants' | translate }}
            </button>
            <button mat-menu-item (click)="setViewMode('hourglass')">
              <mat-icon>swap_vert</mat-icon>
              {{ 'tree.hourglass' | translate }}
            </button>
          </mat-menu>
          
          <!-- Settings Menu -->
          <button mat-icon-button [matMenuTriggerFor]="settingsMenu" [matTooltip]="'nav.settings' | translate">
            <mat-icon>tune</mat-icon>
          </button>
          <mat-menu #settingsMenu="matMenu">
            <div class="menu-setting" (click)="$event.stopPropagation()">
              <span>{{ 'tree.generations' | translate }}</span>
              <select [(ngModel)]="generations" (ngModelChange)="onSettingsChange()">
                <option [value]="2">2</option>
                <option [value]="3">3</option>
                <option [value]="4">4</option>
                <option [value]="5">5</option>
              </select>
            </div>
            <div class="menu-setting" (click)="$event.stopPropagation()">
              <mat-slide-toggle 
                [(ngModel)]="includeSpouses"
                (ngModelChange)="onSettingsChange()"
                color="primary">
                {{ 'tree.includeSpouses' | translate }}
              </mat-slide-toggle>
            </div>
          </mat-menu>
        </div>
      </header>
      
    <!-- Person Selector -->
<div class="tree-page__selector">
  <button 
    mat-stroked-button 
    class="person-selector-btn"
    (click)="openPersonSelector()">
    @if (selectedPerson()) {
      <ng-container>
        <div 
          class="person-selector-btn__avatar"
          [class.person-selector-btn__avatar--male]="selectedPerson()!.sex === Sex.Male"
          [class.person-selector-btn__avatar--female]="selectedPerson()!.sex === Sex.Female">
          {{ getInitials(selectedPerson()!.primaryName) }}
        </div>
        <span class="person-selector-btn__name">{{ selectedPerson()!.primaryName }}</span>
      </ng-container>
    } @else {
      <ng-container>
        <mat-icon>person_search</mat-icon>
        <span>{{ 'tree.selectPerson' | translate }}</span>
      </ng-container>
    }
    <mat-icon class="person-selector-btn__arrow">arrow_drop_down</mat-icon>
  </button>
</div>
      
      <!-- Tree View Content -->
      <div class="tree-page__content" #treeContainer>
        @if (loading()) {
          <app-loading [message]="'common.loading' | translate"></app-loading>
        } @else if (!selectedPerson()) {
          <app-empty-state
            icon="account_tree"
            [title]="'tree.selectPerson' | translate"
            [description]="''">
            <button mat-flat-button color="primary" (click)="openPersonSelector()">
              <mat-icon>person_search</mat-icon>
              {{ 'common.search' | translate }}
            </button>
          </app-empty-state>
        } @else if (treeData()) {
          <!-- D3 Tree Visualization -->
          <app-d3-family-tree
            #d3Tree
            [treeData]="treeData()"
            [viewMode]="viewMode()"
            [generations]="generations"
            [includeSpouses]="includeSpouses"
            [selectedPersonId]="selectedPerson()?.id || null"
            [crossTreeLinks]="crossTreeLinks()"
            (personSelected)="onD3NodeClick($event)"
            (personDoubleClicked)="onD3NodeDoubleClick($event)"
            (crossTreeLinkClicked)="onCrossTreeLinkClick($event)">
          </app-d3-family-tree>

          <!-- Zoom Controls -->
          <div class="tree-zoom-controls">
            <button mat-icon-button (click)="d3ZoomIn()" [matTooltip]="'tree.zoomIn' | translate">
              <mat-icon>add</mat-icon>
            </button>
            <button mat-icon-button (click)="d3ZoomOut()" [matTooltip]="'tree.zoomOut' | translate">
              <mat-icon>remove</mat-icon>
            </button>
            <button mat-icon-button (click)="d3ResetZoom()" [matTooltip]="'tree.resetView' | translate">
              <mat-icon>center_focus_strong</mat-icon>
            </button>
            <button mat-icon-button (click)="d3FitToScreen()" [matTooltip]="'tree.fitToScreen' | translate">
              <mat-icon>fit_screen</mat-icon>
            </button>
          </div>
        } @else {
          <app-empty-state
            icon="warning"
            [title]="'error.generic' | translate">
          </app-empty-state>
        }
      </div>
    </div>
    
    <!-- Node Template -->
    <ng-template #nodeTemplate let-node="node" let-depth="depth" let-isRoot="isRoot">
      <div class="tree-node" [class.tree-node--root]="isRoot">
        <div 
          class="tree-node__card"
          [class.tree-node__card--male]="node.sex === Sex.Male"
          [class.tree-node__card--female]="node.sex === Sex.Female"
          [class.tree-node__card--selected]="node.id === selectedPerson()?.id"
          (click)="onNodeClick(node)">
          
          <div class="tree-node__avatar">
            {{ getInitials(node.primaryName) }}
          </div>
          
          <div class="tree-node__info">
            <div class="tree-node__name">{{ node.primaryName || ('common.unknown' | translate) }}</div>
            <div class="tree-node__dates">
              @if (node.birthDate) {
                {{ formatYear(node.birthDate) }}
              }
              @if (node.birthDate && node.deathDate) {
                -
              }
              @if (node.deathDate) {
                {{ formatYear(node.deathDate) }}
              }
            </div>
          </div>
          
          @if (node.isLiving) {
            <div class="tree-node__living-indicator"></div>
          }
        </div>
        
        <!-- Spouses -->
        @if (includeSpouses && node.unions && node.unions.length > 0) {
          <div class="tree-node__spouses">
            @for (union of node.unions; track union.id) {
              @for (partner of union.partners; track partner.id) {
                <div 
                  class="tree-node__spouse"
                  [class.tree-node__spouse--male]="partner.sex === Sex.Male"
                  [class.tree-node__spouse--female]="partner.sex === Sex.Female"
                  (click)="onNodeClick(partner); $event.stopPropagation()">
                  <div class="tree-node__spouse-avatar">
                    {{ getInitials(partner.primaryName) }}
                  </div>
                  <span class="tree-node__spouse-name">{{ partner.primaryName }}</span>
                </div>
              }
            }
          </div>
        }
        
        <!-- Child nodes (recursive) -->
        @if (viewMode() !== 'pedigree' && node.children && node.children.length > 0 && depth < generations) {
          <div class="tree-node__children">
            @for (child of node.children; track child.id) {
              <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: child, depth: depth + 1 }"></ng-container>
            }
          </div>
        }
        
        <!-- Parent nodes (recursive) for pedigree -->
        @if (viewMode() !== 'descendants' && node.parents && node.parents.length > 0 && depth < generations) {
          <div class="tree-node__parents">
            @for (parent of node.parents; track parent.id) {
              <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: parent, depth: depth + 1 }"></ng-container>
            }
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: [`
    .tree-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--ft-background);
      
      &__header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--ft-spacing-md);
        padding: var(--ft-spacing-md);
        background: var(--ft-surface);
        border-bottom: 1px solid var(--ft-border);
      }
      
      &__controls {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
      }
      
      &__view-modes {
        display: flex;
        gap: 4px;
        
        button {
          min-width: auto;
          
          &.active {
            background: var(--ft-primary);
            color: white;
          }
        }
      }
      
      &__selector {
        padding: var(--ft-spacing-md);
        background: var(--ft-surface);
        border-bottom: 1px solid var(--ft-border);
      }
      
      &__content {
        flex: 1;
        overflow: hidden;
        position: relative;
      }
    }
    
    .person-selector-btn {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-sm);
      width: 100%;
      max-width: 400px;
      justify-content: flex-start;
      padding: var(--ft-spacing-sm) var(--ft-spacing-md);
      height: auto;
      min-height: var(--ft-touch-target);
      
      &__avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--ft-unknown-light);
        color: var(--ft-unknown);
        
        &--male {
          background: var(--ft-male-light);
          color: var(--ft-male);
        }
        
        &--female {
          background: var(--ft-female-light);
          color: var(--ft-female);
        }
      }
      
      &__name {
        flex: 1;
        text-align: start;
        font-weight: 500;
      }
      
      &__arrow {
        margin-inline-start: auto;
      }
    }
    
    .tree-canvas {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--ft-spacing-xl);
      transform-origin: center center;
      transition: transform 0.1s ease-out;
      cursor: grab;
      
      &:active {
        cursor: grabbing;
      }
    }
    
    .tree-root {
      display: flex;
      justify-content: center;
    }
    
    .tree-ancestors,
    .tree-descendants {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .tree-generation {
      display: flex;
      gap: var(--ft-spacing-lg);
      margin: var(--ft-spacing-lg) 0;
    }
    
    .tree-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      
      &--root {
        .tree-node__card {
          transform: scale(1.1);
          box-shadow: var(--ft-shadow-lg);
        }
      }
      
      &__card {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: var(--ft-surface);
        border: 2px solid var(--ft-border);
        border-radius: var(--ft-radius-lg);
        padding: var(--ft-spacing-md);
        min-width: 120px;
        max-width: 160px;
        cursor: pointer;
        transition: all var(--ft-transition-fast);
        position: relative;
        
        &:hover {
          border-color: var(--ft-primary);
          box-shadow: var(--ft-shadow-md);
          transform: translateY(-2px);
        }
        
        &--male {
          border-color: var(--ft-male);
          background: var(--ft-male-light);
        }
        
        &--female {
          border-color: var(--ft-female);
          background: var(--ft-female-light);
        }
        
        &--selected {
          border-width: 3px;
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.2);
        }
      }
      
      &__avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        font-weight: 600;
        background: rgba(0, 0, 0, 0.1);
        margin-bottom: var(--ft-spacing-sm);
      }
      
      &__info {
        text-align: center;
      }
      
      &__name {
        font-weight: 600;
        font-size: 0.875rem;
        margin-bottom: 2px;
        word-break: break-word;
      }
      
      &__dates {
        font-size: 0.75rem;
        color: var(--ft-on-surface-variant);
      }
      
      &__living-indicator {
        position: absolute;
        top: var(--ft-spacing-sm);
        inset-inline-end: var(--ft-spacing-sm);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ft-success);
      }
      
      &__spouses {
        display: flex;
        gap: var(--ft-spacing-sm);
        margin-top: var(--ft-spacing-sm);
      }
      
      &__spouse {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--ft-surface);
        border: 1px solid var(--ft-border);
        border-radius: var(--ft-radius-full);
        font-size: 0.75rem;
        cursor: pointer;
        
        &:hover {
          border-color: var(--ft-primary);
        }
        
        &--male {
          border-color: var(--ft-male);
        }
        
        &--female {
          border-color: var(--ft-female);
        }
      }
      
      &__spouse-avatar {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.625rem;
        font-weight: 600;
        background: var(--ft-surface-variant);
      }
      
      &__spouse-name {
        max-width: 80px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      &__children,
      &__parents {
        display: flex;
        gap: var(--ft-spacing-md);
        margin-top: var(--ft-spacing-lg);
        position: relative;
        
        &::before {
          content: '';
          position: absolute;
          top: calc(var(--ft-spacing-lg) * -0.5);
          left: 50%;
          width: 2px;
          height: var(--ft-spacing-lg);
          background: var(--ft-border);
          transform: translateX(-50%);
        }
      }
    }
    
    .tree-zoom-controls {
      position: absolute;
      bottom: var(--ft-spacing-lg);
      inset-inline-end: var(--ft-spacing-lg);
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      box-shadow: var(--ft-shadow-lg);
      padding: var(--ft-spacing-sm);
      gap: var(--ft-spacing-xs);
      
      @media (max-width: 767px) {
        bottom: var(--ft-spacing-md);
        inset-inline-end: var(--ft-spacing-md);
      }
    }
    
    .tree-zoom-level {
      font-size: 0.75rem;
      color: var(--ft-on-surface-variant);
      min-width: 40px;
      text-align: center;
    }
    
    .menu-setting {
      padding: var(--ft-spacing-sm) var(--ft-spacing-md);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ft-spacing-md);
      
      select {
        padding: var(--ft-spacing-xs) var(--ft-spacing-sm);
        border: 1px solid var(--ft-border);
        border-radius: var(--ft-radius-sm);
        background: var(--ft-surface);
      }
    }
  `]
})
export class TreeViewComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('treeContainer') treeContainer!: ElementRef;
  @ViewChild('d3Tree') d3TreeComponent!: D3FamilyTreeComponent;
  
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
  private readonly destroy$ = new Subject<void>();
  
  readonly Sex = Sex;
  
  // State
  selectedPerson = signal<PersonListItem | null>(null);
  treeData = signal<TreePersonNode | null>(null);
  crossTreeLinks = signal<TreeLinksSummary | null>(null);
  loading = signal(false);
  viewMode = signal<'pedigree' | 'descendants' | 'hourglass'>('pedigree');
  
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
  }
  
  private loadPersonById(id: string): void {
    this.personService.getPerson(id).subscribe({
      next: (person) => {
        const listItem: PersonListItem = {
          id: person.id,
          primaryName: person.primaryName,
          sex: person.sex,
          birthDate: person.birthDate,
          birthPrecision: person.birthPrecision,
          deathDate: person.deathDate,
          deathPrecision: person.deathPrecision,
          birthPlace: person.birthPlace,
          deathPlace: person.deathPlace,
          isVerified: person.isVerified,
          needsReview: person.needsReview
        };
        this.selectedPerson.set(listItem);
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
        this.selectedPerson.set(result);
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
  
  setViewMode(mode: 'pedigree' | 'descendants' | 'hourglass'): void {
    this.viewMode.set(mode);
    this.loadTree();
  }
  
  getViewModeLabel(): string {
    const labels = {
      pedigree: this.i18n.t('tree.pedigree'),
      descendants: this.i18n.t('tree.descendants'),
      hourglass: this.i18n.t('tree.hourglass')
    };
    return labels[this.viewMode()];
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
      primaryName: node.primaryName,
      sex: node.sex,
      birthDate: node.birthDate || null,
      birthPrecision: 0,
      deathDate: node.deathDate || null,
      deathPrecision: 0,
      birthPlace: node.birthPlace || null,
      deathPlace: node.deathPlace || null,
      isVerified: false,
      needsReview: false
    };
    this.selectedPerson.set(listItem);
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
  
  formatYear(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
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
      primaryName: node.primaryName,
      sex: node.sex,
      birthDate: node.birthDate || null,
      birthPrecision: 0,
      deathDate: node.deathDate || null,
      deathPrecision: 0,
      birthPlace: node.birthPlace || null,
      deathPlace: node.deathPlace || null,
      isVerified: false,
      needsReview: false
    };
    this.selectedPerson.set(listItem);

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
      primaryName: node.primaryName,
      sex: node.sex,
      birthDate: node.birthDate || null,
      birthPrecision: 0,
      deathDate: node.deathDate || null,
      deathPrecision: 0,
      birthPlace: node.birthPlace || null,
      deathPlace: node.deathPlace || null,
      isVerified: false,
      needsReview: false
    };
    this.selectedPerson.set(listItem);
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
}