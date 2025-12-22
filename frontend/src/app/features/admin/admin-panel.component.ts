import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';

import { AdminService } from '../../core/services/admin.service';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TownService } from '../../core/services/town.service';
import {
  AdminUser,
  AdminTreeAssignment,
  AdminTownAssignment,
  PlatformStats,
  FamilyTreeListItem,
  CreateUserRequest
} from '../../core/models/family-tree.models';
import { TownListItem } from '../../core/models/town.models';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  template: `
    <div class="admin-panel">
      <div class="admin-panel__header">
        <h1 class="admin-panel__title">
          <mat-icon>admin_panel_settings</mat-icon>
          Admin Panel
        </h1>
        <p class="admin-panel__subtitle">Manage users, roles, and platform settings</p>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <mat-card class="stat-card stat-card--users">
          <mat-card-content>
            <div class="stat-card__icon">
              <mat-icon>people</mat-icon>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalUsers || 0 }}</span>
              <span class="stat-card__label">Total Users</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card stat-card--trees">
          <mat-card-content>
            <div class="stat-card__icon">
              <mat-icon>account_tree</mat-icon>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalTrees || 0 }}</span>
              <span class="stat-card__label">Family Trees</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card stat-card--people">
          <mat-card-content>
            <div class="stat-card__icon">
              <mat-icon>person</mat-icon>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalPeople || 0 }}</span>
              <span class="stat-card__label">People</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card stat-card--relations">
          <mat-card-content>
            <div class="stat-card__icon">
              <mat-icon>family_restroom</mat-icon>
            </div>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats()?.totalRelationships || 0 }}</span>
              <span class="stat-card__label">Relationships</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Tabs -->
      <mat-card class="admin-panel__content">
        <mat-tab-group animationDuration="200ms">
          <!-- Users Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>people</mat-icon>
              <span>Users</span>
            </ng-template>
            
            <div class="tab-content">
              <div class="tab-header">
                <h3>System Users</h3>
                <button mat-flat-button color="primary" (click)="showCreateUserModal = true">
                  <mat-icon>person_add</mat-icon>
                  Create User
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
                    <th mat-header-cell *matHeaderCellDef>User</th>
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
                    <th mat-header-cell *matHeaderCellDef>System Role</th>
                    <td mat-cell *matCellDef="let user">
                      <mat-form-field appearance="outline" class="role-select">
                        <mat-select 
                          [value]="user.systemRole"
                          (selectionChange)="updateUserRole(user, $event.value)">
                          <mat-option value="User">User</mat-option>
                          <mat-option value="Admin">Admin</mat-option>
                          <mat-option value="SuperAdmin">SuperAdmin</mat-option>
                        </mat-select>
                      </mat-form-field>
                    </td>
                  </ng-container>

                  <!-- Trees Column -->
                  <ng-container matColumnDef="trees">
                    <th mat-header-cell *matHeaderCellDef>Trees</th>
                    <td mat-cell *matCellDef="let user">
                      <span class="tree-count">{{ user.treeCount || 0 }}</span>
                    </td>
                  </ng-container>

                  <!-- Created Column -->
                  <ng-container matColumnDef="created">
                    <th mat-header-cell *matHeaderCellDef>Created</th>
                    <td mat-cell *matCellDef="let user">
                      {{ user.createdAt | date:'mediumDate' }}
                    </td>
                  </ng-container>

                  <!-- Actions Column -->
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let user">
                      @if (user.systemRole === 'Admin') {
                        <button mat-stroked-button color="primary" (click)="showAssignModal(user)">
                          <mat-icon>assignment</mat-icon>
                          Manage Trees
                        </button>
                      }
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="userColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: userColumns;"></tr>
                </table>

                @if (users().length === 0) {
                  <div class="empty-state">
                    <mat-icon>people_outline</mat-icon>
                    <p>No users found</p>
                  </div>
                }
              }
            </div>
          </mat-tab>

          <!-- Town Assignments Tab (Primary - Town-scoped access) -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>location_city</mat-icon>
              <span>Town Assignments</span>
            </ng-template>

            <div class="tab-content">
              <div class="tab-header">
                <h3>Admin Town Assignments</h3>
                <p class="tab-description">Assign admins to towns. Admins can manage all trees within their assigned towns.</p>
                <button mat-flat-button color="primary" (click)="showNewTownAssignmentModal = true">
                  <mat-icon>add</mat-icon>
                  Assign Town
                </button>
              </div>

              <table mat-table [dataSource]="townAssignments()" class="assignments-table">
                <ng-container matColumnDef="admin">
                  <th mat-header-cell *matHeaderCellDef>Admin</th>
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
                  <th mat-header-cell *matHeaderCellDef>Town</th>
                  <td mat-cell *matCellDef="let a">
                    <mat-chip-set>
                      <mat-chip class="town-chip">
                        <mat-icon>location_city</mat-icon>
                        {{ a.townName }}
                      </mat-chip>
                    </mat-chip-set>
                  </td>
                </ng-container>

                <ng-container matColumnDef="trees">
                  <th mat-header-cell *matHeaderCellDef>Trees</th>
                  <td mat-cell *matCellDef="let a">
                    <span class="tree-count">{{ a.treeCount }} trees</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="assignedBy">
                  <th mat-header-cell *matHeaderCellDef>Assigned By</th>
                  <td mat-cell *matCellDef="let a">{{ a.assignedByName || 'System' }}</td>
                </ng-container>

                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Date</th>
                  <td mat-cell *matCellDef="let a">{{ a.assignedAt | date:'mediumDate' }}</td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let a">
                    <button mat-icon-button color="warn" (click)="removeTownAssignment(a)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="townAssignmentColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: townAssignmentColumns;"></tr>
              </table>

              @if (townAssignments().length === 0) {
                <div class="empty-state">
                  <mat-icon>location_city</mat-icon>
                  <p>No town assignments yet</p>
                  <span class="empty-hint">Assign admins to towns to give them access to all trees within those towns</span>
                </div>
              }
            </div>
          </mat-tab>

          <!-- Admin Tree Assignments Tab (Legacy) -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>assignment_ind</mat-icon>
              <span>Tree Assignments</span>
            </ng-template>

            <div class="tab-content">
              <div class="tab-header">
                <h3>Direct Tree Assignments (Legacy)</h3>
                <button mat-flat-button color="primary" (click)="showNewAssignmentModal = true">
                  <mat-icon>add</mat-icon>
                  Add Assignment
                </button>
              </div>

              <table mat-table [dataSource]="assignments()" class="assignments-table">
                <ng-container matColumnDef="admin">
                  <th mat-header-cell *matHeaderCellDef>Admin</th>
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

                <ng-container matColumnDef="tree">
                  <th mat-header-cell *matHeaderCellDef>Tree</th>
                  <td mat-cell *matCellDef="let a">
                    <mat-chip-set>
                      <mat-chip>
                        <mat-icon>account_tree</mat-icon>
                        {{ a.treeName }}
                      </mat-chip>
                    </mat-chip-set>
                  </td>
                </ng-container>

                <ng-container matColumnDef="assignedBy">
                  <th mat-header-cell *matHeaderCellDef>Assigned By</th>
                  <td mat-cell *matCellDef="let a">{{ a.assignedByName || 'System' }}</td>
                </ng-container>

                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Date</th>
                  <td mat-cell *matCellDef="let a">{{ a.assignedAt | date:'mediumDate' }}</td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let a">
                    <button mat-icon-button color="warn" (click)="removeAssignment(a)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="assignmentColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: assignmentColumns;"></tr>
              </table>

              @if (assignments().length === 0) {
                <div class="empty-state">
                  <mat-icon>assignment</mat-icon>
                  <p>No tree assignments yet</p>
                </div>
              }
            </div>
          </mat-tab>

          <!-- All Trees Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>forest</mat-icon>
              <span>All Trees</span>
            </ng-template>
            
            <div class="tab-content">
              <table mat-table [dataSource]="allTrees()" class="trees-table">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let tree">
                    <div class="tree-cell">
                      <mat-icon class="tree-icon">account_tree</mat-icon>
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
                  <th mat-header-cell *matHeaderCellDef>People</th>
                  <td mat-cell *matCellDef="let tree">{{ tree.personCount }}</td>
                </ng-container>

                <ng-container matColumnDef="public">
                  <th mat-header-cell *matHeaderCellDef>Visibility</th>
                  <td mat-cell *matCellDef="let tree">
                    @if (tree.isPublic) {
                      <mat-chip class="visibility-chip visibility-chip--public">
                        <mat-icon>public</mat-icon>
                        Public
                      </mat-chip>
                    } @else {
                      <mat-chip class="visibility-chip visibility-chip--private">
                        <mat-icon>lock</mat-icon>
                        Private
                      </mat-chip>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="created">
                  <th mat-header-cell *matHeaderCellDef>Created</th>
                  <td mat-cell *matCellDef="let tree">{{ tree.createdAt | date:'mediumDate' }}</td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="treeColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: treeColumns;"></tr>
              </table>

              @if (allTrees().length === 0) {
                <div class="empty-state">
                  <mat-icon>forest</mat-icon>
                  <p>No family trees yet</p>
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-card>

      <!-- New Assignment Modal -->
      @if (showNewAssignmentModal) {
        <div class="modal-backdrop" (click)="showNewAssignmentModal = false">
          <mat-card class="modal-card" (click)="$event.stopPropagation()">
            <mat-card-header>
              <mat-card-title>Assign Admin to Tree</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Select Admin</mat-label>
                <mat-select [(ngModel)]="newAssignment.userId">
                  @for (user of adminUsers(); track user.userId) {
                    <mat-option [value]="user.userId">
                      {{ user.firstName }} {{ user.lastName }} ({{ user.email }})
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Select Tree</mat-label>
                <mat-select [(ngModel)]="newAssignment.treeId">
                  @for (tree of allTrees(); track tree.id) {
                    <mat-option [value]="tree.id">{{ tree.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button (click)="showNewAssignmentModal = false">Cancel</button>
              <button mat-flat-button color="primary" (click)="createAssignment()">Assign</button>
            </mat-card-actions>
          </mat-card>
        </div>
      }

      <!-- Create User Modal -->
      @if (showCreateUserModal) {
        <div class="modal-backdrop" (click)="showCreateUserModal = false">
          <mat-card class="modal-card" (click)="$event.stopPropagation()">
            <mat-card-header>
              <mat-card-title>Create New User</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Email</mat-label>
                <input matInput type="email" [(ngModel)]="newUser.email" placeholder="user@example.com">
                <mat-icon matPrefix>email</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Password</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" [(ngModel)]="newUser.password">
                <mat-icon matPrefix>lock</mat-icon>
                <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword" type="button">
                  <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </mat-form-field>

              <div class="form-row">
                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>First Name</mat-label>
                  <input matInput [(ngModel)]="newUser.firstName">
                  <mat-icon matPrefix>person</mat-icon>
                </mat-form-field>

                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Last Name</mat-label>
                  <input matInput [(ngModel)]="newUser.lastName">
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>System Role</mat-label>
                <mat-select [(ngModel)]="newUser.systemRole">
                  <mat-option value="User">User</mat-option>
                  <mat-option value="Admin">Admin</mat-option>
                  <mat-option value="SuperAdmin">SuperAdmin</mat-option>
                </mat-select>
                <mat-icon matPrefix>admin_panel_settings</mat-icon>
              </mat-form-field>

              @if (createUserError) {
                <div class="error-message">
                  <mat-icon>error</mat-icon>
                  {{ createUserError }}
                </div>
              }
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button (click)="closeCreateUserModal()">Cancel</button>
              <button mat-flat-button color="primary" (click)="createUser()" [disabled]="creatingUser()">
                @if (creatingUser()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  Create User
                }
              </button>
            </mat-card-actions>
          </mat-card>
        </div>
      }

      <!-- Town Assignment Modal -->
      @if (showNewTownAssignmentModal) {
        <div class="modal-backdrop" (click)="showNewTownAssignmentModal = false">
          <mat-card class="modal-card" (click)="$event.stopPropagation()">
            <mat-card-header>
              <mat-card-title>Assign Admin to Town</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <p class="modal-hint">
                Assigning an admin to a town gives them access to all trees within that town.
              </p>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Select Admin</mat-label>
                <mat-select [(ngModel)]="newTownAssignment.userId">
                  @for (user of adminUsers(); track user.userId) {
                    <mat-option [value]="user.userId">
                      {{ user.firstName }} {{ user.lastName }} ({{ user.email }})
                    </mat-option>
                  }
                </mat-select>
                <mat-icon matPrefix>person</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Select Town</mat-label>
                <mat-select [(ngModel)]="newTownAssignment.townId">
                  @for (town of allTowns(); track town.id) {
                    <mat-option [value]="town.id">
                      <span class="town-option">
                        <span class="town-option-name">{{ town.name }}</span>
                        @if (town.country) {
                          <span class="town-option-country">({{ town.country }})</span>
                        }
                        <span class="town-option-trees">{{ town.treeCount || 0 }} trees</span>
                      </span>
                    </mat-option>
                  }
                  @if (allTowns().length === 0) {
                    <mat-option disabled>No towns available</mat-option>
                  }
                </mat-select>
                <mat-icon matPrefix>location_city</mat-icon>
                <mat-hint>Towns are geographic locations (cities/villages)</mat-hint>
              </mat-form-field>
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button (click)="showNewTownAssignmentModal = false">Cancel</button>
              <button mat-flat-button color="primary" (click)="createTownAssignment()">
                Assign Town
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

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
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

        mat-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
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

      &--users .stat-card__icon { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
      &--trees .stat-card__icon { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
      &--people .stat-card__icon { background: linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%); }
      &--relations .stat-card__icon { background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%); }
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        margin-right: 4px;
      }

      &--public {
        background-color: #e8f5e9 !important;
        color: #2e7d32 !important;
      }

      &--private {
        background-color: #fff3e0 !important;
        color: #e65100 !important;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: var(--ft-on-surface-variant);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
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
      background-color: #e3f2fd !important;
      color: #1565c0 !important;
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
      z-index: 1000;
    }

    .modal-card {
      width: 100%;
      max-width: 480px;
      margin: 16px;
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

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
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
  `]
})
export class AdminPanelComponent implements OnInit {
  loading = signal(true);
  users = signal<AdminUser[]>([]);
  assignments = signal<AdminTreeAssignment[]>([]);
  townAssignments = signal<AdminTownAssignment[]>([]);
  allTrees = signal<FamilyTreeListItem[]>([]);
  allTowns = signal<TownListItem[]>([]);
  stats = signal<PlatformStats | null>(null);

  showNewAssignmentModal = false;
  newAssignment = { userId: 0, treeId: '' };

  showNewTownAssignmentModal = false;
  newTownAssignment = { userId: 0, townId: '' };

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
  assignmentColumns = ['admin', 'tree', 'assignedBy', 'date', 'actions'];
  townAssignmentColumns = ['admin', 'town', 'trees', 'assignedBy', 'date', 'actions'];
  treeColumns = ['name', 'people', 'public', 'created'];

  constructor(
    private adminService: AdminService,
    private treeService: FamilyTreeService,
    private townService: TownService
  ) {}

  ngOnInit() {
    this.loadData();
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

    this.adminService.getAllAssignments().subscribe({
      next: (assignments) => this.assignments.set(assignments),
      error: () => {}
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
      next: (towns) => this.allTowns.set(towns),
      error: () => {}
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
      error: (err) => alert(err.error?.message || 'Failed to update role')
    });
  }

  showAssignModal(user: AdminUser) {
    this.newAssignment = { userId: user.userId, treeId: '' };
    this.showNewAssignmentModal = true;
  }

  createAssignment() {
    if (!this.newAssignment.userId || !this.newAssignment.treeId) return;

    this.adminService.createAssignment({
      userId: this.newAssignment.userId,
      treeId: this.newAssignment.treeId
    }).subscribe({
      next: () => {
        this.showNewAssignmentModal = false;
        this.loadData();
      },
      error: (err) => alert(err.error?.message || 'Failed to create assignment')
    });
  }

  removeAssignment(assignment: AdminTreeAssignment) {
    if (!confirm(`Remove ${assignment.userName} from ${assignment.treeName}?`)) return;

    this.adminService.deleteAssignment(assignment.id).subscribe({
      next: () => this.loadData(),
      error: (err) => alert(err.error?.message || 'Failed to remove assignment')
    });
  }

  // Town Assignment Methods
  createTownAssignment() {
    if (!this.newTownAssignment.userId || !this.newTownAssignment.townId) return;

    this.adminService.createTownAssignment({
      userId: this.newTownAssignment.userId,
      townId: this.newTownAssignment.townId
    }).subscribe({
      next: () => {
        this.showNewTownAssignmentModal = false;
        this.newTownAssignment = { userId: 0, townId: '' };
        this.loadData();
      },
      error: (err) => alert(err.error?.message || 'Failed to create town assignment')
    });
  }

  removeTownAssignment(assignment: AdminTownAssignment) {
    if (!confirm(`Remove ${assignment.userName} from ${assignment.townName}?`)) return;

    this.adminService.deleteTownAssignment(assignment.id).subscribe({
      next: () => this.loadData(),
      error: (err) => alert(err.error?.message || 'Failed to remove town assignment')
    });
  }

  createUser() {
    if (!this.newUser.email || !this.newUser.password) {
      this.createUserError = 'Email and password are required';
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
        this.createUserError = err.error?.message || 'Failed to create user';
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
}