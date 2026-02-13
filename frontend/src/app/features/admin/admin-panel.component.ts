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
import { AnalyticsTabComponent } from './analytics/analytics-tab.component';

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
    TranslatePipe,
    AnalyticsTabComponent
  ],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.scss']
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
      error: () => console.warn('Failed to load stats')
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
      error: () => {
        console.warn('Failed to load towns');
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
      error: () => alert(this.i18n.t('admin.errors.updateRoleFailed'))
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
              error: () => alert(this.i18n.t('admin.errors.assignTownFailed'))
            });
          }
        });
      },
      error: () => {
        console.warn('Failed to load towns for dialog');
        alert(this.i18n.t('admin.errors.loadTownsFailed'));
      }
    });
  }

  removeTownAssignment(assignment: AdminTownAssignment) {
    if (!confirm(this.i18n.t('admin.confirmRemoveTownAssignment', { user: assignment.userName || '', town: assignment.townName || '' }))) return;

    this.adminService.deleteTownAssignment(assignment.id).subscribe({
      next: () => this.loadData(),
      error: () => alert(this.i18n.t('admin.errors.removeTownAssignmentFailed'))
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
        this.createUserError = this.i18n.t('admin.errors.createUserFailed');
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
    return this.i18n.getTownName(town);
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
