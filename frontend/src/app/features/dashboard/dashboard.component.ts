import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { PersonService } from '../../core/services/person.service';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { RelationshipService } from '../../core/services/relationship.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonListItem, Sex } from '../../core/models/person.models';
import { User } from '../../core/models/auth.models';
import { PersonFormDialogComponent } from '../people/person-form-dialog.component';

interface QuickAction {
  icon: string;
  labelKey: string;
  route?: string;
  action?: () => void;
  color: string;
}

interface StatCard {
  icon: string;
  labelKey: string;
  value: number | string;
  color: string;
  route?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatRippleModule,
    TranslatePipe
  ],
  template: `
    <div class="dashboard">
      <!-- Welcome Hero -->
      <section class="dashboard__hero">
        <div class="dashboard__hero-content">
          <div class="dashboard__greeting">
            <h1 class="dashboard__title">{{ getGreeting() }}</h1>
            @if (currentUser()) {
              <p class="dashboard__subtitle">
                {{ currentUser()!.firstName || currentUser()!.email }}
              </p>
            }
          </div>
          <div class="dashboard__hero-illustration">
            <i class="fa-solid fa-people-roof" aria-hidden="true"></i>
          </div>
        </div>
      </section>

      <!-- No Trees Prompt -->
      @if (hasNoTrees() && !checkingTrees()) {
        <section class="dashboard__section">
          <div class="no-trees-prompt">
            <div class="no-trees-prompt__icon">
              <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
            </div>
            <div class="no-trees-prompt__content">
              <h2>{{ 'dashboard.getStarted' | translate }}</h2>
              <p>{{ 'dashboard.noTreesMessage' | translate }}</p>
            </div>
            <div class="no-trees-prompt__actions">
              <button mat-flat-button color="primary" routerLink="/trees">
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {{ 'dashboard.createTree' | translate }}
              </button>
            </div>
          </div>
        </section>
      }

      <!-- Quick Stats -->
      <section class="dashboard__section">
        <h2 class="dashboard__section-title">{{ 'dashboard.quickStats' | translate }}</h2>
        <div class="stats-grid">
          @for (stat of stats(); track stat.labelKey) {
            <div 
              class="stat-card ft-fade-in"
              [class.stat-card--clickable]="stat.route"
              [style.--stat-color]="stat.color"
              matRipple
              [matRippleDisabled]="!stat.route"
              (click)="stat.route && navigateTo(stat.route)">
              <div class="stat-card__icon">
                <i class="fa-solid" [ngClass]="'fa-' + stat.icon" aria-hidden="true"></i>
              </div>
              <div class="stat-card__content">
                <span class="stat-card__value">{{ stat.value }}</span>
                <span class="stat-card__label">{{ stat.labelKey | translate }}</span>
              </div>
            </div>
          }
        </div>
      </section>
      
      <!-- Quick Actions -->
      <section class="dashboard__section">
        <h2 class="dashboard__section-title">{{ 'dashboard.quickActions' | translate }}</h2>
        <div class="actions-grid">
          @for (action of quickActions; track action.labelKey) {
            <button 
              class="action-card ft-fade-in"
              [style.--action-color]="action.color"
              matRipple
              (click)="handleAction(action)">
              <div class="action-card__icon">
                <i class="fa-solid" [ngClass]="'fa-' + action.icon" aria-hidden="true"></i>
              </div>
              <span class="action-card__label">{{ action.labelKey | translate }}</span>
            </button>
          }
        </div>
      </section>
      
      <!-- Recent People -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">{{ 'dashboard.recentActivity' | translate }}</h2>
          <button mat-button color="primary" routerLink="/people">
            {{ 'common.all' | translate }}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
        
        @if (loadingRecent()) {
          <div class="recent-list">
            @for (i of [1,2,3]; track i) {
              <div class="recent-item recent-item--skeleton">
                <div class="ft-skeleton ft-skeleton--avatar"></div>
                <div class="recent-item__content">
                  <div class="ft-skeleton ft-skeleton--title" style="width: 60%"></div>
                  <div class="ft-skeleton ft-skeleton--text" style="width: 40%; margin-top: 4px"></div>
                </div>
              </div>
            }
          </div>
        } @else if (recentPeople().length > 0) {
          <div class="recent-list">
            @for (person of recentPeople(); track person.id; let i = $index) {
              <div 
                class="recent-item ft-fade-in"
                [class]="'ft-stagger-' + (i + 1)"
                matRipple
                (click)="viewPerson(person)">
                <div 
                  class="recent-item__avatar"
                  [class.recent-item__avatar--male]="person.sex === Sex.Male"
                  [class.recent-item__avatar--female]="person.sex === Sex.Female">
                  {{ getInitials(person.primaryName) }}
                </div>
                <div class="recent-item__content">
                  <span class="recent-item__name">{{ person.primaryName || ('common.unknown' | translate) }}</span>
                  <span class="recent-item__meta">
                    @if (person.birthDate) {
                      {{ formatYear(person.birthDate) }}
                    }
                    @if (person.birthPlace) {
                      · {{ person.birthPlace }}
                    }
                  </span>
                </div>
                <i class="fa-solid fa-chevron-right recent-item__arrow" aria-hidden="true"></i>
              </div>
            }
          </div>
        } @else {
          <div class="empty-recent">
            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
            <p>{{ 'people.noPeople' | translate }}</p>
            <button mat-stroked-button color="primary" (click)="openAddPerson()">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              {{ 'people.addPerson' | translate }}
            </button>
          </div>
        }
      </section>
      
      <!-- Features Banner -->
      <section class="dashboard__section">
        <div class="features-banner">
          <div class="features-banner__content">
            <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
            <div>
              <h3>{{ 'dashboard.welcome' | translate }}</h3>
              <p>Start by adding family members and building your family tree.</p>
            </div>
          </div>
          <button mat-flat-button color="primary" routerLink="/people">
            {{ 'common.add' | translate }}
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dashboard {
      min-height: 100%;
      padding-bottom: var(--ft-spacing-xxl);
      
      &__hero {
        background: linear-gradient(135deg, var(--ft-primary) 0%, var(--ft-primary-dark) 100%);
        color: white;
        padding: var(--ft-spacing-xl) var(--ft-spacing-md);
        margin: calc(var(--ft-spacing-md) * -1);
        margin-bottom: var(--ft-spacing-lg);
        
        @media (min-width: 768px) {
          padding: var(--ft-spacing-xxl) var(--ft-spacing-xl);
          margin: calc(var(--ft-spacing-lg) * -1);
          margin-bottom: var(--ft-spacing-xl);
          border-radius: 0 0 var(--ft-radius-xl) var(--ft-radius-xl);
        }
      }
      
      &__hero-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      &__greeting {
        flex: 1;
      }
      
      &__title {
        margin: 0 0 var(--ft-spacing-xs);
        font-size: 1.5rem;
        font-weight: 700;
        
        @media (min-width: 768px) {
          font-size: 2rem;
        }
      }
      
      &__subtitle {
        margin: 0;
        opacity: 0.9;
        font-size: 1rem;
      }
      
      &__hero-illustration {
        display: none;

        @media (min-width: 768px) {
          display: flex;

          i.fa-solid {
            font-size: 80px;
            width: 80px;
            height: 80px;
            opacity: 0.3;
          }
        }
      }
      
      &__section {
        margin-bottom: var(--ft-spacing-xl);
        padding: 0 var(--ft-spacing-md);
        
        @media (min-width: 768px) {
          padding: 0 var(--ft-spacing-lg);
        }
      }
      
      &__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ft-spacing-md);
      }
      
      &__section-title {
        margin: 0 0 var(--ft-spacing-md);
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--ft-on-surface);
      }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--ft-spacing-md);
      
      @media (min-width: 768px) {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    
    .stat-card {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      border: 1px solid var(--ft-border);
      transition: all var(--ft-transition-fast);
      
      &--clickable {
        cursor: pointer;
        
        &:hover {
          border-color: var(--stat-color, var(--ft-primary));
          box-shadow: var(--ft-shadow-md);
        }
      }
      
      &__icon {
        width: 48px;
        height: 48px;
        border-radius: var(--ft-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--stat-color, var(--ft-primary)) 15%, transparent);

        i.fa-solid {
          color: var(--stat-color, var(--ft-primary));
          font-size: 24px;
        }
      }
      
      &__content {
        display: flex;
        flex-direction: column;
      }
      
      &__value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--ft-on-surface);
        line-height: 1.2;
      }
      
      &__label {
        font-size: 0.75rem;
        color: var(--ft-on-surface-variant);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }
    
    .actions-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--ft-spacing-md);
      
      @media (min-width: 576px) {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    
    .action-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ft-spacing-sm);
      padding: var(--ft-spacing-lg);
      background: var(--ft-surface);
      border: 1px solid var(--ft-border);
      border-radius: var(--ft-radius-lg);
      cursor: pointer;
      transition: all var(--ft-transition-fast);
      
      &:hover {
        border-color: var(--action-color, var(--ft-primary));
        box-shadow: var(--ft-shadow-md);
        transform: translateY(-2px);
      }
      
      &:active {
        transform: translateY(0);
      }
      
      &__icon {
        width: 56px;
        height: 56px;
        border-radius: var(--ft-radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--action-color, var(--ft-primary)) 15%, transparent);

        i.fa-solid {
          color: var(--action-color, var(--ft-primary));
          font-size: 28px;
          width: 28px;
          height: 28px;
        }
      }
      
      &__label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--ft-on-surface);
        text-align: center;
      }
    }
    
    .recent-list {
      display: flex;
      flex-direction: column;
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      border: 1px solid var(--ft-border);
      overflow: hidden;
    }
    
    .recent-item {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      border-bottom: 1px solid var(--ft-divider);
      cursor: pointer;
      transition: background var(--ft-transition-fast);
      
      &:last-child {
        border-bottom: none;
      }
      
      &:hover {
        background: var(--ft-surface-variant);
      }
      
      &--skeleton {
        cursor: default;
        
        &:hover {
          background: transparent;
        }
      }
      
      &__avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.875rem;
        font-weight: 600;
        background: var(--ft-unknown-light);
        color: var(--ft-unknown);
        flex-shrink: 0;
        
        &--male {
          background: var(--ft-male-light);
          color: var(--ft-male);
        }
        
        &--female {
          background: var(--ft-female-light);
          color: var(--ft-female);
        }
      }
      
      &__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      
      &__name {
        font-weight: 600;
        color: var(--ft-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      &__meta {
        font-size: 0.813rem;
        color: var(--ft-on-surface-variant);
      }
      
      &__arrow {
        color: var(--ft-on-surface-variant);
        flex-shrink: 0;
      }
    }
    
    .empty-recent {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--ft-spacing-xxl);
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      border: 1px solid var(--ft-border);
      text-align: center;

      i.fa-solid {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--ft-on-surface-variant);
        opacity: 0.5;
        margin-bottom: var(--ft-spacing-md);
      }

      p {
        margin: 0 0 var(--ft-spacing-md);
        color: var(--ft-on-surface-variant);
      }
    }
    
    .features-banner {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-lg);
      background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
      border-radius: var(--ft-radius-lg);

      @media (min-width: 768px) {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      &__content {
        display: flex;
        align-items: flex-start;
        gap: var(--ft-spacing-md);

        i.fa-solid {
          color: var(--ft-primary);
          font-size: 32px;
          width: 32px;
          height: 32px;
          flex-shrink: 0;
        }

        h3 {
          margin: 0 0 var(--ft-spacing-xs);
          font-size: 1rem;
          font-weight: 600;
          color: var(--ft-primary-dark);
        }

        p {
          margin: 0;
          font-size: 0.875rem;
          color: var(--ft-on-surface-variant);
        }
      }
    }

    .no-trees-prompt {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--ft-spacing-xxl) var(--ft-spacing-lg);
      background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
      border-radius: var(--ft-radius-lg);
      border: 2px dashed #ff9800;

      &__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 152, 0, 0.2);
        margin-bottom: var(--ft-spacing-lg);

        i.fa-solid {
          font-size: 40px;
          width: 40px;
          height: 40px;
          color: #e65100;
        }
      }

      &__content {
        margin-bottom: var(--ft-spacing-lg);

        h2 {
          margin: 0 0 var(--ft-spacing-sm);
          font-size: 1.5rem;
          font-weight: 700;
          color: #e65100;
        }

        p {
          margin: 0;
          font-size: 1rem;
          color: var(--ft-on-surface-variant);
          max-width: 400px;
        }
      }

      &__actions {
        button {
          min-height: var(--ft-touch-target);
          font-size: 1rem;
          padding: var(--ft-spacing-sm) var(--ft-spacing-xl);
        }
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly personService = inject(PersonService);
  private readonly treeService = inject(FamilyTreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly Sex = Sex;

  currentUser = signal<User | null>(null);
  recentPeople = signal<PersonListItem[]>([]);
  loadingRecent = signal(true);
  hasNoTrees = signal(false);
  checkingTrees = signal(true);
  stats = signal<StatCard[]>([
    { icon: 'users', labelKey: 'dashboard.totalPeople', value: '-', color: '#1976d2', route: '/people' },
    { icon: 'mars', labelKey: 'people.male', value: '-', color: '#1976d2', route: '/people?sex=male' },
    { icon: 'venus', labelKey: 'people.female', value: '-', color: '#c2185b', route: '/people?sex=female' },
    { icon: 'people-roof', labelKey: 'dashboard.totalFamilies', value: '-', color: '#7b1fa2', route: '/families' }
  ]);

  quickActions: QuickAction[] = [
    { icon: 'user-plus', labelKey: 'people.addPerson', action: () => this.openAddPerson(), color: '#1976d2' },
    { icon: 'sitemap', labelKey: 'nav.familyTree', route: '/tree', color: '#2e7d32' },
    { icon: 'users', labelKey: 'nav.people', route: '/people', color: '#7b1fa2' },
    { icon: 'images', labelKey: 'nav.media', route: '/media', color: '#f57c00' }
  ];

  // Track previous tree ID to detect changes
  private previousTreeId: string | null = null;

  // Effect to reload data when selected tree changes
  private treeChangeEffect = effect(() => {
    const currentTreeId = this.treeContext.effectiveTreeId();
    if (this.previousTreeId !== null && currentTreeId !== this.previousTreeId) {
      // Tree changed, reload data
      this.reloadDashboardData();
    }
    this.previousTreeId = currentTreeId;
  });

  ngOnInit(): void {
    this.currentUser.set(this.authService.getCurrentUser());
    
    // Check for tree ID in route params (from /trees/:id)
    this.route.params.subscribe(params => {
      const treeId = params['id'];
      if (treeId) {
        // Set this tree as the active context
        this.treeContext.selectTree(treeId);
      }
      this.checkUserTrees();
    });
  }

  private reloadDashboardData(): void {
    // Reset stats
    this.stats.set([
      { icon: 'users', labelKey: 'dashboard.totalPeople', value: '-', color: '#1976d2', route: '/people' },
      { icon: 'mars', labelKey: 'people.male', value: '-', color: '#1976d2', route: '/people?sex=male' },
      { icon: 'venus', labelKey: 'people.female', value: '-', color: '#c2185b', route: '/people?sex=female' },
      { icon: 'people-roof', labelKey: 'dashboard.totalFamilies', value: '-', color: '#7b1fa2', route: '/families' }
    ]);
    this.recentPeople.set([]);

    // Reload if we have a valid tree
    if (this.treeContext.effectiveTreeId()) {
      this.hasNoTrees.set(false);
      this.loadRecentPeople();
      this.loadStats();
    }
  }

  private checkUserTrees(): void {
    this.checkingTrees.set(true);
    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.checkingTrees.set(false);
        // For admins, also check if they have assigned trees
        const user = this.authService.getCurrentUser();
        const isAdmin = user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';

        if (trees.length === 0 && !isAdmin) {
          this.hasNoTrees.set(true);
          this.loadingRecent.set(false);
        } else if (this.treeContext.effectiveTreeId()) {
          // Admin with selected tree or regular user with membership
          this.hasNoTrees.set(false);
          this.loadRecentPeople();
          this.loadStats();
        } else if (isAdmin) {
          // Admin without selected tree - wait for selection
          this.hasNoTrees.set(false);
          this.loadingRecent.set(false);
        } else {
          this.hasNoTrees.set(true);
          this.loadingRecent.set(false);
        }
      },
      error: () => {
        this.checkingTrees.set(false);
        this.hasNoTrees.set(true);
        this.loadingRecent.set(false);
      }
    });
  }
  
  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }
  
  loadRecentPeople(): void {
    this.loadingRecent.set(true);
    this.personService.searchPeople({ page: 1, pageSize: 5 }).subscribe({
      next: (response) => {
        this.recentPeople.set(response.items);
        this.loadingRecent.set(false);
      },
      error: (err) => {
        console.error('Failed to load recent people:', err);
        this.loadingRecent.set(false);
      }
    });
  }
  
  loadStats(): void {
    const treeId = this.treeContext.effectiveTreeId() || undefined;
    
    this.personService.searchPeople({ page: 1, pageSize: 1 }).subscribe({
      next: (response) => {
        this.stats.update(stats => {
          const updated = [...stats];
          updated[0] = { ...updated[0], value: response.totalCount };
          return updated;
        });
        
        // Load male count
        this.personService.searchPeople({ page: 1, pageSize: 1, sex: Sex.Male }).subscribe(res => {
          this.stats.update(stats => {
            const updated = [...stats];
            updated[1] = { ...updated[1], value: res.totalCount };
            return updated;
          });
        });
        
        // Load female count
        this.personService.searchPeople({ page: 1, pageSize: 1, sex: Sex.Female }).subscribe(res => {
          this.stats.update(stats => {
            const updated = [...stats];
            updated[2] = { ...updated[2], value: res.totalCount };
            return updated;
          });
        });
      }
    });
    
    // Load family/union count
    this.relationshipService.searchUnions({ treeId, page: 1, pageSize: 1 }).subscribe({
      next: (response) => {
        this.stats.update(stats => {
          const updated = [...stats];
          updated[3] = { ...updated[3], value: response.totalCount };
          return updated;
        });
      },
      error: (err) => {
        console.error('Failed to load family count:', err);
      }
    });
  }
  
  handleAction(action: QuickAction): void {
    if (action.route) {
      this.router.navigate([action.route]);
    } else if (action.action) {
      action.action();
    }
  }
  
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
  
  openAddPerson(): void {
    const dialogRef = this.dialog.open(PersonFormDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      panelClass: 'ft-dialog',
      data: {}
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecentPeople();
        this.loadStats();
        this.snackBar.open(
          this.i18n.t('personForm.createSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      }
    });
  }
  
  viewPerson(person: PersonListItem): void {
    this.router.navigate(['/people', person.id]);
  }
  
  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  
  formatYear(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }
}