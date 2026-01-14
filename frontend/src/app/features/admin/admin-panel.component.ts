import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminService } from '../../core/services/admin.service';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TownService } from '../../core/services/town.service';
import { TransliterationService } from '../../core/services/transliteration.service';
import {
  AdminUser,
  AdminTownAssignment,
  PlatformStats,
  FamilyTreeListItem,
  CreateUserRequest
} from '../../core/models/family-tree.models';
import { TownListItem } from '../../core/models/town.models';
import { NameMapping, BulkTransliterationResult, getConfidenceLevel } from '../../core/models/transliteration.models';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { AssignTownDialogComponent, AssignTownDialogData, AssignTownDialogResult } from './assign-town-dialog.component';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    TranslatePipe
  ],
  template: `
    <div class="admin-panel">
      <div class="admin-panel__header">
        <h1 class="admin-panel__title">
          <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
          {{ 'admin.title' | translate }}
        </h1>
        <p class="admin-panel__subtitle">{{ 'admin.subtitle' | translate }}</p>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <mat-card class="stat-card stat-card--users">
          <mat-card-content>
            <div class="stat-card__icon">
              <i class="fa-solid fa-users" aria-hidden="true"></i>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalUsers || 0 }}</span>
              <span class="stat-card__label">{{ 'admin.totalUsers' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card stat-card--trees">
          <mat-card-content>
            <div class="stat-card__icon">
              <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalTrees || 0 }}</span>
              <span class="stat-card__label">{{ 'trees.title' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card stat-card--people">
          <mat-card-content>
            <div class="stat-card__icon">
              <i class="fa-solid fa-user" aria-hidden="true"></i>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalPeople || 0 }}</span>
              <span class="stat-card__label">{{ 'admin.totalPeople' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card stat-card--relations">
          <mat-card-content>
            <div class="stat-card__icon">
              <i class="fa-solid fa-people-roof" aria-hidden="true"></i>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalRelationships || 0 }}</span>
              <span class="stat-card__label">{{ 'admin.totalRelationships' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Quick Links -->
      <div class="quick-links">
        <a routerLink="/admin/countries" class="quick-link">
          <mat-card>
            <mat-card-content>
              <i class="fa-solid fa-globe" aria-hidden="true"></i>
              <span>{{ 'admin.countries.title' | translate }}</span>
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </mat-card-content>
          </mat-card>
        </a>
      </div>

      <!-- Tabs -->
      <mat-card class="admin-panel__content">
        <mat-tab-group animationDuration="200ms">
          <!-- Users Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <i class="fa-solid fa-users" aria-hidden="true"></i>
              <span>{{ 'admin.users' | translate }}</span>
            </ng-template>

            <div class="tab-content">
              <div class="tab-header">
                <h3>{{ 'admin.systemUsers' | translate }}</h3>
                <button mat-flat-button color="primary" (click)="showCreateUserModal = true">
                  <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
                  {{ 'admin.createUser' | translate }}
                </button>
              </div>
              @if (loading()) {
                <div class="loading-container">
                  <mat-spinner diameter="40"></mat-spinner>
                </div>
              } @else {
                <table mat-table [dataSource]="users()" class="users-table">
                  <!-- User Column -->
                  <ng-container matColumnDef="user">
                    <th mat-header-cell *matHeaderCellDef>{{ 'admin.user' | translate }}</th>
                    <td mat-cell *matCellDef="let user">
                      <div class="user-cell">
                        <div class="user-avatar">
                          {{ getInitials(user.firstName, user.lastName) }}
                        </div>
                        <div class="user-info">
                          <span class="user-name">{{ user.firstName }} {{ user.lastName }}</span>
                          <span class="user-email">{{ user.email }}</span>
                        </div>
                      </div>
                    </td>
                  </ng-container>

                  <!-- Role Column -->
                  <ng-container matColumnDef="role">
                    <th mat-header-cell *matHeaderCellDef>{{ 'admin.systemRole' | translate }}</th>
                    <td mat-cell *matCellDef="let user">
                      <mat-form-field appearance="outline" class="role-select">
                        <mat-select
                          [value]="user.systemRole"
                          (selectionChange)="updateUserRole(user, $event.value)">
                          <mat-option value="User">{{ 'roles.user' | translate }}</mat-option>
                          <mat-option value="Admin">{{ 'roles.admin' | translate }}</mat-option>
                          <mat-option value="SuperAdmin">{{ 'roles.superAdmin' | translate }}</mat-option>
                        </mat-select>
                      </mat-form-field>
                    </td>
                  </ng-container>

                  <!-- Trees Column -->
                  <ng-container matColumnDef="trees">
                    <th mat-header-cell *matHeaderCellDef>{{ 'trees.title' | translate }}</th>
                    <td mat-cell *matCellDef="let user">
                      <span class="tree-count">{{ user.treeCount || 0 }}</span>
                    </td>
                  </ng-container>

                  <!-- Created Column -->
                  <ng-container matColumnDef="created">
                    <th mat-header-cell *matHeaderCellDef>{{ 'admin.created' | translate }}</th>
                    <td mat-cell *matCellDef="let user">
                      {{ user.createdAt | date:'mediumDate' }}
                    </td>
                  </ng-container>

                  <!-- Actions Column -->
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>{{ 'common.actions' | translate }}</th>
                    <td mat-cell *matCellDef="let user">
                      @if (user.systemRole === 'Admin') {
                        <button mat-stroked-button color="primary" (click)="openAssignTownDialog(user)">
                          <i class="fa-solid fa-city" aria-hidden="true"></i>
                          {{ 'admin.assignTowns' | translate }}
                        </button>
                      }
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="userColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: userColumns;"></tr>
                </table>

                @if (users().length === 0) {
                  <div class="empty-state">
                    <i class="fa-solid fa-users" aria-hidden="true"></i>
                    <p>{{ 'admin.noUsersFound' | translate }}</p>
                  </div>
                }
              }
            </div>
          </mat-tab>

          <!-- Town Assignments Tab (Primary - Town-scoped access) -->
          <mat-tab>
            <ng-template mat-tab-label>
              <i class="fa-solid fa-city" aria-hidden="true"></i>
              <span>{{ 'admin.townAssignments' | translate }}</span>
            </ng-template>

            <div class="tab-content">
              <div class="tab-header">
                <h3>{{ 'admin.adminTownAssignments' | translate }}</h3>
                <p class="tab-description">{{ 'admin.townAssignmentsDesc' | translate }}</p>
                <button mat-flat-button color="primary" (click)="openAssignTownDialog()">
                  <i class="fa-solid fa-plus" aria-hidden="true"></i>
                  {{ 'admin.assignTown' | translate }}
                </button>
              </div>

              <table mat-table [dataSource]="townAssignments()" class="assignments-table">
                <ng-container matColumnDef="admin">
                  <th mat-header-cell *matHeaderCellDef>{{ 'roles.admin' | translate }}</th>
                  <td mat-cell *matCellDef="let a">
                    <div class="user-cell">
                      <div class="user-avatar user-avatar--small">
                        {{ getInitials(a.userName?.split(' ')[0], a.userName?.split(' ')[1]) }}
                      </div>
                      <div class="user-info">
                        <span class="user-name">{{ a.userName }}</span>
                        <span class="user-email">{{ a.userEmail }}</span>
                      </div>
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="town">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.town' | translate }}</th>
                  <td mat-cell *matCellDef="let a">
                    <mat-chip-set>
                      <mat-chip class="town-chip">
                        <i class="fa-solid fa-city" aria-hidden="true"></i>
                        {{ getLocalizedAssignmentTownName(a) }}
                      </mat-chip>
                    </mat-chip-set>
                  </td>
                </ng-container>

                <ng-container matColumnDef="trees">
                  <th mat-header-cell *matHeaderCellDef>{{ 'trees.title' | translate }}</th>
                  <td mat-cell *matCellDef="let a">
                    <span class="tree-count">{{ a.treeCount }} {{ 'trees.title' | translate | lowercase }}</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="assignedBy">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.assignedBy' | translate }}</th>
                  <td mat-cell *matCellDef="let a">{{ a.assignedByName || ('admin.system' | translate) }}</td>
                </ng-container>

                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.date' | translate }}</th>
                  <td mat-cell *matCellDef="let a">{{ a.assignedAt | date:'mediumDate' }}</td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>{{ 'common.actions' | translate }}</th>
                  <td mat-cell *matCellDef="let a">
                    <button mat-icon-button color="warn" (click)="removeTownAssignment(a)">
                      <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="townAssignmentColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: townAssignmentColumns;"></tr>
              </table>

              @if (townAssignments().length === 0) {
                <div class="empty-state">
                  <i class="fa-solid fa-city" aria-hidden="true"></i>
                  <p>{{ 'admin.noTownAssignments' | translate }}</p>
                  <span class="empty-hint">{{ 'admin.noTownAssignmentsHint' | translate }}</span>
                </div>
              }
            </div>
          </mat-tab>


          <!-- All Trees Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <i class="fa-solid fa-tree" aria-hidden="true"></i>
              <span>{{ 'admin.allTrees' | translate }}</span>
            </ng-template>

            <div class="tab-content">
              <table mat-table [dataSource]="allTrees()" class="trees-table">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>{{ 'common.name' | translate }}</th>
                  <td mat-cell *matCellDef="let tree">
                    <div class="tree-cell">
                      <i class="fa-solid fa-sitemap tree-icon" aria-hidden="true"></i>
                      <div class="tree-info">
                        <span class="tree-name">{{ tree.name }}</span>
                        @if (tree.description) {
                          <span class="tree-desc">{{ tree.description }}</span>
                        }
                      </div>
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="people">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.totalPeople' | translate }}</th>
                  <td mat-cell *matCellDef="let tree">{{ tree.personCount }}</td>
                </ng-container>

                <ng-container matColumnDef="public">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.visibility' | translate }}</th>
                  <td mat-cell *matCellDef="let tree">
                    @if (tree.isPublic) {
                      <mat-chip class="visibility-chip visibility-chip--public">
                        <i class="fa-solid fa-globe" aria-hidden="true"></i>
                        {{ 'common.public' | translate }}
                      </mat-chip>
                    } @else {
                      <mat-chip class="visibility-chip visibility-chip--private">
                        <i class="fa-solid fa-lock" aria-hidden="true"></i>
                        {{ 'admin.private' | translate }}
                      </mat-chip>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="created">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.created' | translate }}</th>
                  <td mat-cell *matCellDef="let tree">{{ tree.createdAt | date:'mediumDate' }}</td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="treeColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: treeColumns;"></tr>
              </table>

              @if (allTrees().length === 0) {
                <div class="empty-state">
                  <i class="fa-solid fa-tree" aria-hidden="true"></i>
                  <p>{{ 'admin.noTreesYet' | translate }}</p>
                </div>
              }
            </div>
          </mat-tab>

          <!-- Transliteration Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <i class="fa-solid fa-language" aria-hidden="true"></i>
              <span>{{ 'admin.transliteration' | translate }}</span>
            </ng-template>

            <div class="tab-content transliteration-tab">
              <div class="transliteration-header">
                <h3>{{ 'admin.generateMissingTranslations' | translate }}</h3>
                <p class="transliteration-desc">
                  {{ 'admin.transliterationDesc' | translate }}
                </p>
              </div>

              <!-- Bulk Generation Section -->
              <mat-card class="transliteration-card">
                <mat-card-header>
                  <mat-card-title>
                    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                    {{ 'admin.bulkGenerate' | translate }}
                  </mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  <div class="bulk-options">
                    <mat-form-field appearance="outline">
                      <mat-label>{{ 'admin.maxPersonsToProcess' | translate }}</mat-label>
                      <input matInput type="number" [(ngModel)]="bulkTranslitOptions.maxPersons" min="1" max="500">
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>{{ 'nav.familyTree' | translate }}</mat-label>
                      <mat-select [(ngModel)]="bulkTranslitOptions.orgId">
                        <mat-option value="">{{ 'admin.allTreesMyOrg' | translate }}</mat-option>
                        @for (tree of allTrees(); track tree.id) {
                          <mat-option [value]="tree.id">{{ tree.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  </div>

                  @if (bulkTranslitResult()) {
                    <div class="translit-result" [class.translit-result--success]="bulkTranslitResult()!.success">
                      <div class="translit-result__header">
                        <i class="fa-solid" [class.fa-check-circle]="bulkTranslitResult()!.success" [class.fa-exclamation-circle]="!bulkTranslitResult()!.success" aria-hidden="true"></i>
                        <span>{{ bulkTranslitResult()!.message }}</span>
                      </div>
                      <div class="translit-result__stats">
                        <span><strong>{{ bulkTranslitResult()!.totalPersonsProcessed }}</strong> {{ 'admin.personsProcessed' | translate }}</span>
                        <span><strong>{{ bulkTranslitResult()!.totalNamesGenerated }}</strong> {{ 'admin.namesGenerated' | translate }}</span>
                        @if (bulkTranslitResult()!.errors > 0) {
                          <span class="error-count"><strong>{{ bulkTranslitResult()!.errors }}</strong> {{ 'admin.errors' | translate }}</span>
                        }
                      </div>
                    </div>
                  }
                </mat-card-content>
                <mat-card-actions align="end">
                  <button mat-flat-button color="primary"
                          [disabled]="bulkTranslitLoading()"
                          (click)="runBulkTransliteration()">
                    @if (bulkTranslitLoading()) {
                      <mat-spinner diameter="20"></mat-spinner>
                      {{ 'admin.processing' | translate }}
                    } @else {
                      <i class="fa-solid fa-play" aria-hidden="true"></i>
                      {{ 'admin.generateMissingNames' | translate }}
                    }
                  </button>
                </mat-card-actions>
              </mat-card>

              <!-- Mappings Needing Review -->
              <mat-card class="transliteration-card">
                <mat-card-header>
                  <mat-card-title>
                    <i class="fa-solid fa-flag" aria-hidden="true"></i>
                    {{ 'admin.mappingsNeedingReview' | translate }} ({{ mappingsNeedingReview().length }})
                  </mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  @if (mappingsNeedingReview().length > 0) {
                    <table mat-table [dataSource]="mappingsNeedingReview()" class="mappings-table">
                      <ng-container matColumnDef="arabic">
                        <th mat-header-cell *matHeaderCellDef>{{ 'admin.arabic' | translate }}</th>
                        <td mat-cell *matCellDef="let m" class="rtl-cell">{{ m.arabic || '—' }}</td>
                      </ng-container>

                      <ng-container matColumnDef="english">
                        <th mat-header-cell *matHeaderCellDef>{{ 'admin.english' | translate }}</th>
                        <td mat-cell *matCellDef="let m">{{ m.english || '—' }}</td>
                      </ng-container>

                      <ng-container matColumnDef="nobiin">
                        <th mat-header-cell *matHeaderCellDef>{{ 'admin.nobiin' | translate }}</th>
                        <td mat-cell *matCellDef="let m" class="nobiin-cell">{{ m.nobiin || '—' }}</td>
                      </ng-container>

                      <ng-container matColumnDef="confidence">
                        <th mat-header-cell *matHeaderCellDef>{{ 'admin.confidence' | translate }}</th>
                        <td mat-cell *matCellDef="let m">
                          <mat-chip [class]="'confidence-' + getConfidenceLevel(m.confidence)">
                            {{ (m.confidence * 100).toFixed(0) }}%
                          </mat-chip>
                        </td>
                      </ng-container>

                      <ng-container matColumnDef="actions">
                        <th mat-header-cell *matHeaderCellDef>{{ 'common.actions' | translate }}</th>
                        <td mat-cell *matCellDef="let m">
                          <button mat-icon-button color="primary" (click)="verifyMapping(m)" [matTooltip]="'admin.verify' | translate">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>
                          </button>
                        </td>
                      </ng-container>

                      <tr mat-header-row *matHeaderRowDef="mappingColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: mappingColumns;"></tr>
                    </table>
                  } @else {
                    <div class="empty-state empty-state--small">
                      <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                      <p>{{ 'admin.allMappingsVerified' | translate }}</p>
                    </div>
                  }
                </mat-card-content>
                <mat-card-actions align="end">
                  <button mat-button (click)="loadMappingsNeedingReview()">
                    <i class="fa-solid fa-refresh" aria-hidden="true"></i>
                    {{ 'admin.refresh' | translate }}
                  </button>
                </mat-card-actions>
              </mat-card>
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-card>

      <!-- Create User Modal -->
      @if (showCreateUserModal) {
        <div class="modal-backdrop" (click)="showCreateUserModal = false">
          <mat-card class="modal-card" (click)="$event.stopPropagation()">
            <mat-card-header>
              <mat-card-title>{{ 'admin.createNewUser' | translate }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'common.email' | translate }}</mat-label>
                <input matInput type="email" [(ngModel)]="newUser.email" [placeholder]="'admin.emailPlaceholder' | translate">
                <i matPrefix class="fa-solid fa-envelope input-prefix-icon" aria-hidden="true"></i>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'auth.password' | translate }}</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" [(ngModel)]="newUser.password">
                <i matPrefix class="fa-solid fa-lock input-prefix-icon" aria-hidden="true"></i>
                <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword" type="button">
                  <i class="fa-solid" [class.fa-eye-slash]="hidePassword" [class.fa-eye]="!hidePassword" aria-hidden="true"></i>
                </button>
              </mat-form-field>

              <div class="form-row">
                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>{{ 'common.firstName' | translate }}</mat-label>
                  <input matInput [(ngModel)]="newUser.firstName">
                  <i matPrefix class="fa-solid fa-user input-prefix-icon" aria-hidden="true"></i>
                </mat-form-field>

                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>{{ 'common.lastName' | translate }}</mat-label>
                  <input matInput [(ngModel)]="newUser.lastName">
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'admin.systemRole' | translate }}</mat-label>
                <mat-select [(ngModel)]="newUser.systemRole">
                  <mat-option value="User">{{ 'admin.roles.user' | translate }}</mat-option>
                  <mat-option value="Admin">{{ 'admin.roles.admin' | translate }}</mat-option>
                  <mat-option value="SuperAdmin">{{ 'admin.roles.superAdmin' | translate }}</mat-option>
                </mat-select>
                <i matPrefix class="fa-solid fa-user-shield input-prefix-icon" aria-hidden="true"></i>
              </mat-form-field>

              @if (createUserError) {
                <div class="error-message">
                  <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
                  {{ createUserError }}
                </div>
              }
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button (click)="closeCreateUserModal()">{{ 'common.cancel' | translate }}</button>
              <button mat-flat-button color="primary" (click)="createUser()" [disabled]="creatingUser()">
                @if (creatingUser()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  {{ 'admin.createUser' | translate }}
                }
              </button>
            </mat-card-actions>
          </mat-card>
        </div>
      }

    </div>
  `,
  styles: [`
    .admin-panel {
      max-width: 1200px;
      margin: 0 auto;

      &__header {
        margin-bottom: 24px;
      }

      &__title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0 0 8px;
        font-size: 28px;
        font-weight: 600;
        color: var(--ft-on-surface);

        i.fa-solid {
          font-size: 1.75rem;
          color: var(--ft-primary);
        }
      }

      &__subtitle {
        margin: 0;
        color: var(--ft-on-surface-variant);
      }

      &__content {
        margin-top: 24px;
      }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .stat-card {
      mat-card-content {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px !important;
      }

      &__icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;

        i.fa-solid {
          font-size: 1.5rem;
          color: white;
        }
      }

      &__content {
        display: flex;
        flex-direction: column;
      }

      &__value {
        font-size: 28px;
        font-weight: 700;
        line-height: 1;
        color: var(--ft-on-surface);
      }

      &__label {
        font-size: 13px;
        color: var(--ft-on-surface-variant);
        margin-top: 4px;
      }

      // Nubian theme colors
      &--users .stat-card__icon { background: linear-gradient(135deg, #187573 0%, #2B9A97 100%); } // Nubian teal
      &--trees .stat-card__icon { background: linear-gradient(135deg, #2D7A3E 0%, #3FA055 100%); } // Nubian green
      &--people .stat-card__icon { background: linear-gradient(135deg, #C17E3E 0%, #D4A574 100%); } // Nubian gold
      &--relations .stat-card__icon { background: linear-gradient(135deg, #E85D35 0%, #FF7A52 100%); } // Nubian orange
    }

    .quick-links {
      margin-top: 24px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;

      .quick-link {
        text-decoration: none;
        color: inherit;
        flex: 1;
        min-width: 200px;
        max-width: 300px;

        mat-card {
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;

          &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }

          mat-card-content {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px !important;

            i.fa-globe {
              font-size: 1.5rem;
              color: var(--ft-primary);
            }

            span {
              flex: 1;
              font-weight: 500;
            }

            i.fa-chevron-right {
              color: var(--ft-on-surface-variant);
            }
          }
        }
      }
    }

    .tab-content {
      padding: 24px;
    }

    .tab-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .users-table, .assignments-table, .trees-table {
      width: 100%;
      
      th {
        font-weight: 600;
        color: var(--ft-on-surface-variant);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    .user-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #187573 0%, #2B9A97 100%); // Nubian teal
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;

      &--small {
        width: 32px;
        height: 32px;
        font-size: 12px;
      }
    }

    .user-info {
      display: flex;
      flex-direction: column;
    }

    .user-name {
      font-weight: 500;
      color: var(--ft-on-surface);
    }

    .user-email {
      font-size: 12px;
      color: var(--ft-on-surface-variant);
    }

    .role-select {
      width: 140px;
      
      ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
    }

    .tree-count {
      background: var(--ft-surface-variant);
      padding: 4px 12px;
      border-radius: 16px;
      font-weight: 500;
      font-size: 13px;
    }

    .tree-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tree-icon {
      color: var(--ft-primary);
    }

    .tree-info {
      display: flex;
      flex-direction: column;
    }

    .tree-name {
      font-weight: 500;
    }

    .tree-desc {
      font-size: 12px;
      color: var(--ft-on-surface-variant);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .visibility-chip {
      font-size: 12px;

      i.fa-solid {
        font-size: 0.75rem;
        margin-right: 4px;
      }

      &--public {
        background-color: #EDF7EF !important; // Nubian green-50
        color: #2D7A3E !important; // Nubian green
      }

      &--private {
        background-color: #FFF8F0 !important; // Nubian gold-50
        color: #8B5A2B !important; // Nubian gold-700
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: var(--ft-on-surface-variant);

      i.fa-solid {
        font-size: 3rem;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      p {
        margin: 0;
      }

      .empty-hint {
        font-size: 13px;
        margin-top: 8px;
        opacity: 0.7;
      }
    }

    .tab-description {
      font-size: 13px;
      color: var(--ft-on-surface-variant);
      margin: 0 0 16px;
      flex: 1;
    }

    .tab-header {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
    }

    .town-chip {
      background-color: #E6F5F5 !important; // Nubian teal-50
      color: #187573 !important; // Nubian teal
    }

    .modal-hint {
      font-size: 13px;
      color: var(--ft-on-surface-variant);
      margin: 0 0 16px;
      padding: 12px;
      background: var(--ft-surface-variant);
      border-radius: 8px;
    }

    .option-secondary {
      opacity: 0.7;
    }

    .town-option {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .town-option-name {
      font-weight: 500;
    }

    .town-option-country {
      color: var(--ft-on-surface-variant);
      font-size: 12px;
    }

    .town-option-trees {
      margin-left: auto;
      font-size: 11px;
      color: var(--ft-on-surface-variant);
      background: var(--ft-surface-variant);
      padding: 2px 8px;
      border-radius: 10px;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999;  /* Below CDK overlay (1100) so mat-select dropdowns appear above */
    }

    .modal-card {
      width: 100%;
      max-width: 480px;
      margin: 16px;
      z-index: 1000;  /* Above backdrop but below CDK overlay */
      position: relative;
    }

    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    .half-width {
      flex: 1;
    }

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #ffebee;
      color: #c62828;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;

      i.fa-solid {
        font-size: 1.125rem;
      }
    }

    .input-prefix-icon {
      font-size: 1rem;
      color: var(--ft-on-surface-variant);
      margin-right: 8px;
    }

    ::ng-deep {
      .mat-mdc-tab-labels {
        gap: 8px;
      }

      .mat-mdc-tab {
        min-width: auto;
        padding: 0 24px;

        .mdc-tab__content {
          gap: 8px;
        }
      }
    }

    // Transliteration Tab Styles
    .transliteration-tab {
      .transliteration-header {
        margin-bottom: 24px;

        h3 {
          margin: 0 0 8px;
          font-size: 1.25rem;
        }

        .transliteration-desc {
          color: var(--ft-on-surface-variant);
          margin: 0;
        }
      }

      .transliteration-card {
        margin-bottom: 24px;

        mat-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1rem;

          i.fa-solid {
            color: var(--ft-primary);
          }
        }
      }

      .bulk-options {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 16px;

        mat-form-field {
          min-width: 200px;
        }
      }

      .translit-result {
        padding: 16px;
        border-radius: 8px;
        background: var(--ft-surface-variant);
        margin-top: 16px;

        &--success {
          background: #e8f5e9;
        }

        &__header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
          margin-bottom: 8px;

          .fa-check-circle { color: #4caf50; }
          .fa-exclamation-circle { color: #f44336; }
        }

        &__stats {
          display: flex;
          gap: 24px;
          font-size: 14px;
          color: var(--ft-on-surface-variant);

          .error-count {
            color: #f44336;
          }
        }
      }

      .mappings-table {
        width: 100%;

        .rtl-cell {
          direction: rtl;
          text-align: right;
          font-family: 'Noto Sans Arabic', 'Amiri', serif;
        }

        .nobiin-cell {
          font-family: 'Noto Sans Coptic', 'Antinoou', serif;
        }
      }

      .confidence-high { background: #e8f5e9 !important; color: #2e7d32 !important; }
      .confidence-medium { background: #fff3e0 !important; color: #e65100 !important; }
      .confidence-low { background: #ffebee !important; color: #c62828 !important; }

      .empty-state--small {
        padding: 24px;

        i.fa-solid {
          font-size: 2rem;
          color: #4caf50;
        }
      }
    }
  `]
})
export class AdminPanelComponent implements OnInit {
  loading = signal(true);
  users = signal<AdminUser[]>([]);
  townAssignments = signal<AdminTownAssignment[]>([]);
  allTrees = signal<FamilyTreeListItem[]>([]);
  allTowns = signal<TownListItem[]>([]);
  stats = signal<PlatformStats | null>(null);

  showCreateUserModal = false;
  creatingUser = signal(false);
  createUserError = '';
  hidePassword = true;
  newUser: CreateUserRequest = {
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    systemRole: 'User'
  };

  userColumns = ['user', 'role', 'trees', 'created', 'actions'];
  townAssignmentColumns = ['admin', 'town', 'trees', 'assignedBy', 'date', 'actions'];
  treeColumns = ['name', 'people', 'public', 'created'];
  mappingColumns = ['arabic', 'english', 'nobiin', 'confidence', 'actions'];

  // Transliteration state
  bulkTranslitLoading = signal(false);
  bulkTranslitResult = signal<BulkTransliterationResult | null>(null);
  mappingsNeedingReview = signal<NameMapping[]>([]);
  bulkTranslitOptions = {
    maxPersons: 100,
    orgId: ''
  };

  constructor(
    private adminService: AdminService,
    private treeService: FamilyTreeService,
    private townService: TownService,
    private transliterationService: TransliterationService,
    private i18n: I18nService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadData();
    this.loadMappingsNeedingReview();
  }

  loadData() {
    this.loading.set(true);

    this.adminService.getStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => {}
    });

    this.adminService.getAllUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });

    this.adminService.getAllTownAssignments().subscribe({
      next: (assignments) => this.townAssignments.set(assignments),
      error: () => {}
    });

    this.treeService.getMyTrees().subscribe({
      next: (trees) => this.allTrees.set(trees),
      error: () => {}
    });

    this.townService.getAllTowns().subscribe({
      next: (towns) => {
        console.log('Towns loaded:', towns.length);
        this.allTowns.set(towns);
      },
      error: (err) => {
        console.error('Failed to load towns:', err);
      }
    });
  }

  adminUsers() {
    return this.users().filter(u => u.systemRole === 'Admin');
  }

  getInitials(firstName?: string, lastName?: string): string {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  updateUserRole(user: AdminUser, newRole: string) {
    this.adminService.updateUserRole(user.userId, { systemRole: newRole }).subscribe({
      next: () => this.loadData(),
      error: (err) => alert(err.error?.message || this.i18n.t('admin.errors.updateRoleFailed'))
    });
  }

  // Town Assignment Methods
  openAssignTownDialog(user?: AdminUser) {
    // Load towns fresh when dialog opens
    this.townService.getAllTowns().subscribe({
      next: (towns) => {
        this.allTowns.set(towns);

        const dialogRef = this.dialog.open(AssignTownDialogComponent, {
          width: '480px',
          autoFocus: 'first-tabbable',
          disableClose: true,
          data: {
            user,
            users: user ? undefined : this.adminUsers(),
            towns
          } as AssignTownDialogData
        });

        dialogRef.afterClosed().subscribe((result: AssignTownDialogResult | undefined) => {
          if (result) {
            this.adminService.createTownAssignment({
              userId: result.userId,
              townId: result.townId
            }).subscribe({
              next: () => this.loadData(),
              error: (err) => alert(err.error?.message || this.i18n.t('admin.errors.assignTownFailed'))
            });
          }
        });
      },
      error: (err) => {
        console.error('Failed to load towns:', err);
        alert(this.i18n.t('admin.errors.loadTownsFailed'));
      }
    });
  }

  removeTownAssignment(assignment: AdminTownAssignment) {
    if (!confirm(this.i18n.t('admin.confirmRemoveTownAssignment', { user: assignment.userName || '', town: assignment.townName || '' }))) return;

    this.adminService.deleteTownAssignment(assignment.id).subscribe({
      next: () => this.loadData(),
      error: (err) => alert(err.error?.message || this.i18n.t('admin.errors.removeTownAssignmentFailed'))
    });
  }

  createUser() {
    if (!this.newUser.email || !this.newUser.password) {
      this.createUserError = this.i18n.t('admin.errors.emailPasswordRequired');
      return;
    }

    this.creatingUser.set(true);
    this.createUserError = '';

    this.adminService.createUser(this.newUser).subscribe({
      next: () => {
        this.creatingUser.set(false);
        this.closeCreateUserModal();
        this.loadData();
      },
      error: (err) => {
        this.creatingUser.set(false);
        this.createUserError = err.error?.message || this.i18n.t('admin.errors.createUserFailed');
      }
    });
  }

  closeCreateUserModal() {
    this.showCreateUserModal = false;
    this.createUserError = '';
    this.newUser = {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      systemRole: 'User'
    };
  }

  getLocalizedTownName(town: TownListItem): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return town.nameAr || town.name;
      case 'nob':
        return town.nameLocal || town.name;
      case 'en':
      default:
        return town.nameEn || town.name;
    }
  }

  getLocalizedAssignmentTownName(assignment: AdminTownAssignment): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return assignment.townNameAr || assignment.townName || '';
      case 'nob':
        return assignment.townNameLocal || assignment.townName || '';
      case 'en':
      default:
        return assignment.townNameEn || assignment.townName || '';
    }
  }

  // ============================================================================
  // Transliteration Methods
  // ============================================================================

  loadMappingsNeedingReview(): void {
    this.transliterationService.getMappingsNeedingReview().subscribe({
      next: (mappings) => this.mappingsNeedingReview.set(mappings),
      error: (err) => console.error('Failed to load mappings:', err)
    });
  }

  runBulkTransliteration(): void {
    this.bulkTranslitLoading.set(true);
    this.bulkTranslitResult.set(null);

    const request = {
      maxPersons: this.bulkTranslitOptions.maxPersons,
      orgId: this.bulkTranslitOptions.orgId || undefined,
      skipComplete: true
    };

    this.transliterationService.bulkGenerate(request).subscribe({
      next: (result) => {
        this.bulkTranslitResult.set(result);
        this.bulkTranslitLoading.set(false);
        // Refresh mappings needing review
        this.loadMappingsNeedingReview();
      },
      error: (err) => {
        this.bulkTranslitLoading.set(false);
        this.bulkTranslitResult.set({
          success: false,
          message: err.error?.message || this.i18n.t('admin.failedBulkTransliteration'),
          totalPersonsProcessed: 0,
          totalNamesGenerated: 0,
          personsSkipped: 0,
          errors: 1,
          results: []
        });
      }
    });
  }

  verifyMapping(mapping: NameMapping): void {
    this.transliterationService.verifyMapping({
      mappingId: mapping.id
    }).subscribe({
      next: () => {
        // Remove from list
        this.mappingsNeedingReview.update(list =>
          list.filter(m => m.id !== mapping.id)
        );
      },
      error: (err) => alert(err.error?.message || this.i18n.t('admin.errors.verifyMappingFailed'))
    });
  }

  getConfidenceLevel(confidence: number | null): string {
    if (confidence === null) return 'low';
    return getConfidenceLevel(confidence);
  }
}