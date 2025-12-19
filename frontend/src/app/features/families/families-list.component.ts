import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatRippleModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';

import { RelationshipService, UnionResponse, UnionType, UnionSearchParams } from '../../core/services/relationship.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';

@Component({
  selector: 'app-families-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatRippleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatChipsModule
  ],
  template: `
    <div class="families-page">
      <!-- Header -->
      <header class="families-header">
        <div class="families-header__content">
          <h1 class="families-header__title">
            <mat-icon>family_restroom</mat-icon>
            {{ i18n.t('families.title') }}
          </h1>
          <p class="families-header__subtitle">
            {{ totalCount() }} {{ i18n.t('families.totalFamilies') }}
          </p>
        </div>
        
        <!-- Filters -->
        <div class="families-filters">
          <mat-form-field appearance="outline" class="families-filters__type">
            <mat-label>{{ i18n.t('families.filterType') }}</mat-label>
            <mat-select [(value)]="selectedType" (selectionChange)="onTypeChange()">
              <mat-option [value]="null">{{ i18n.t('common.all') }}</mat-option>
              @for (type of unionTypes; track type.value) {
                <mat-option [value]="type.value">{{ type.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      </header>

      <!-- Loading State -->
      @if (loading()) {
        <div class="families-loading">
          <mat-spinner diameter="48"></mat-spinner>
          <p>{{ i18n.t('common.loading') }}</p>
        </div>
      }

      <!-- Empty State -->
      @if (!loading() && families().length === 0) {
        <div class="families-empty">
          <mat-icon>family_restroom</mat-icon>
          <h3>{{ i18n.t('families.noFamilies') }}</h3>
          <p>{{ i18n.t('families.noFamiliesDesc') }}</p>
        </div>
      }

      <!-- Families Grid -->
      @if (!loading() && families().length > 0) {
        <div class="families-grid">
          @for (family of families(); track family.id) {
            <div 
              class="family-card"
              matRipple
              (click)="viewFamily(family)">
              
              <!-- Family Members -->
              <div class="family-card__members">
                @for (member of family.members; track member.id; let i = $index) {
                  @if (i < 2) {
                    <div 
                      class="family-card__avatar"
                      [class.family-card__avatar--male]="member.personSex === Sex.Male"
                      [class.family-card__avatar--female]="member.personSex === Sex.Female"
                      [style.z-index]="10 - i"
                      [style.margin-left]="i > 0 ? '-12px' : '0'">
                      {{ getInitials(member.personName) }}
                    </div>
                  }
                }
                @if (family.members.length > 2) {
                  <div class="family-card__more">
                    +{{ family.members.length - 2 }}
                  </div>
                }
              </div>

              <!-- Family Info -->
              <div class="family-card__info">
                <h3 class="family-card__names">
                  {{ getMemberNames(family) }}
                </h3>
                
                <div class="family-card__meta">
                  <mat-chip-set>
                    <mat-chip [class]="'chip-' + getUnionTypeClass(family.type)">
                      {{ getUnionTypeName(family.type) }}
                    </mat-chip>
                  </mat-chip-set>
                  
                  @if (family.startDate) {
                    <span class="family-card__date">
                      <mat-icon>event</mat-icon>
                      {{ formatDate(family.startDate) }}
                    </span>
                  }
                  
                  @if (family.startPlaceName) {
                    <span class="family-card__place">
                      <mat-icon>place</mat-icon>
                      {{ family.startPlaceName }}
                    </span>
                  }
                </div>
              </div>

              <mat-icon class="family-card__arrow">chevron_right</mat-icon>
            </div>
          }
        </div>

        <!-- Pagination -->
        <mat-paginator
          [length]="totalCount()"
          [pageSize]="pageSize"
          [pageIndex]="currentPage() - 1"
          [pageSizeOptions]="[10, 25, 50, 100]"
          (page)="onPageChange($event)"
          showFirstLastButtons>
        </mat-paginator>
      }
    </div>
  `,
  styles: [`
    .families-page {
      padding: var(--ft-spacing-md);
      max-width: 1200px;
      margin: 0 auto;
      
      @media (min-width: 768px) {
        padding: var(--ft-spacing-lg);
      }
    }

    .families-header {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-md);
      margin-bottom: var(--ft-spacing-lg);
      
      @media (min-width: 768px) {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      &__content {
        flex: 1;
      }

      &__title {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        margin: 0 0 var(--ft-spacing-xs);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--ft-text-primary);

        mat-icon {
          color: var(--ft-primary);
          font-size: 28px;
          width: 28px;
          height: 28px;
        }
      }

      &__subtitle {
        margin: 0;
        color: var(--ft-text-secondary);
        font-size: 0.875rem;
      }
    }

    .families-filters {
      display: flex;
      gap: var(--ft-spacing-sm);
      
      &__type {
        min-width: 180px;
      }
    }

    .families-loading,
    .families-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--ft-spacing-xxl);
      text-align: center;
      color: var(--ft-text-secondary);

      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: var(--ft-spacing-md);
        opacity: 0.5;
      }

      h3 {
        margin: 0 0 var(--ft-spacing-xs);
        color: var(--ft-text-primary);
      }

      p {
        margin: 0;
      }
    }

    .families-grid {
      display: flex;
      flex-direction: column;
      gap: var(--ft-spacing-sm);
    }

    .family-card {
      display: flex;
      align-items: center;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      border: 1px solid var(--ft-border-light);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--ft-primary);
        box-shadow: var(--ft-shadow-md);
        transform: translateY(-2px);
      }

      &__members {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      &__avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
        color: white;
        background: #9e9e9e;
        border: 3px solid var(--ft-surface);
        position: relative;

        &--male {
          background: linear-gradient(135deg, #1976d2, #1565c0);
        }

        &--female {
          background: linear-gradient(135deg, #c2185b, #ad1457);
        }
      }

      &__more {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        color: var(--ft-text-secondary);
        background: var(--ft-background);
        border: 2px solid var(--ft-border);
        margin-left: -8px;
      }

      &__info {
        flex: 1;
        min-width: 0;
      }

      &__names {
        margin: 0 0 var(--ft-spacing-xs);
        font-size: 1rem;
        font-weight: 600;
        color: var(--ft-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ft-spacing-sm);
        font-size: 0.8125rem;
        color: var(--ft-text-secondary);
      }

      &__date,
      &__place {
        display: flex;
        align-items: center;
        gap: 4px;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }

      &__arrow {
        color: var(--ft-text-secondary);
        flex-shrink: 0;
      }
    }

    .chip-marriage {
      --mdc-chip-label-text-color: #2e7d32;
      --mdc-chip-elevated-container-color: #e8f5e9;
    }

    .chip-divorced {
      --mdc-chip-label-text-color: #c62828;
      --mdc-chip-elevated-container-color: #ffebee;
    }

    .chip-widowed {
      --mdc-chip-label-text-color: #5d4037;
      --mdc-chip-elevated-container-color: #efebe9;
    }

    .chip-engagement {
      --mdc-chip-label-text-color: #1565c0;
      --mdc-chip-elevated-container-color: #e3f2fd;
    }

    .chip-default {
      --mdc-chip-label-text-color: #616161;
      --mdc-chip-elevated-container-color: #f5f5f5;
    }

    mat-paginator {
      margin-top: var(--ft-spacing-lg);
      background: transparent;
    }
  `]
})
export class FamiliesListComponent implements OnInit {
  private relationshipService = inject(RelationshipService);
  private treeContext = inject(TreeContextService);
  private router = inject(Router);
  i18n = inject(I18nService);

  Sex = Sex;

  // State
  families = signal<UnionResponse[]>([]);
  loading = signal(false);
  totalCount = signal(0);
  currentPage = signal(1);
  pageSize = 25;

  // Filters
  selectedType: UnionType | null = null;

  // Union type options for filter
  unionTypes = [
    { value: UnionType.Marriage, label: 'Marriage' },
    { value: UnionType.CivilUnion, label: 'Civil Union' },
    { value: UnionType.DomesticPartnership, label: 'Domestic Partnership' },
    { value: UnionType.CommonLaw, label: 'Common Law' },
    { value: UnionType.Engagement, label: 'Engagement' },
    { value: UnionType.Divorced, label: 'Divorced' },
    { value: UnionType.Widowed, label: 'Widowed' },
    { value: UnionType.Separated, label: 'Separated' },
    { value: UnionType.Annulled, label: 'Annulled' }
  ];

  ngOnInit(): void {
    this.loadFamilies();
  }

  loadFamilies(): void {
    this.loading.set(true);
    
    const params: UnionSearchParams = {
      treeId: this.treeContext.effectiveTreeId() || undefined,
      page: this.currentPage(),
      pageSize: this.pageSize
    };

    if (this.selectedType !== null) {
      params.type = this.selectedType;
    }

    this.relationshipService.searchUnions(params).subscribe({
      next: (result) => {
        this.families.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load families:', err);
        this.loading.set(false);
      }
    });
  }

  onTypeChange(): void {
    this.currentPage.set(1);
    this.loadFamilies();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize = event.pageSize;
    this.loadFamilies();
  }

  viewFamily(family: UnionResponse): void {
    // Navigate to first member's detail page with family context
    if (family.members.length > 0) {
      this.router.navigate(['/people', family.members[0].personId], {
        queryParams: { tab: 'family' }
      });
    }
  }

  getMemberNames(family: UnionResponse): string {
    return family.members
      .map(m => m.personName || 'Unknown')
      .join(' & ');
  }

  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  getUnionTypeName(type: UnionType): string {
    return this.relationshipService.getUnionTypeName(type);
  }

  getUnionTypeClass(type: UnionType): string {
    switch (type) {
      case UnionType.Marriage:
        return 'marriage';
      case UnionType.Divorced:
        return 'divorced';
      case UnionType.Widowed:
        return 'widowed';
      case UnionType.Engagement:
        return 'engagement';
      default:
        return 'default';
    }
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return '';
    }
  }
}