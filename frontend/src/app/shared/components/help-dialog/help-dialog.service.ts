import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../../core/services/auth.service';
import { SystemRole } from '../../../core/models/auth.models';
import { UserHelpDialogComponent } from './user-help-dialog/user-help-dialog.component';
import { AdminHelpDialogComponent } from './admin-help-dialog/admin-help-dialog.component';
import { SuperAdminHelpDialogComponent } from './superadmin-help-dialog/superadmin-help-dialog.component';

// =============================================================================
// Tab ID Constants for Validation
// =============================================================================

export const USER_HELP_TABS = [
  'overview',
  'onboarding',
  'dashboard',
  'trees',
  'people',
  'tree-view',
  'media',
  'suggestions',
  'profile',
  'tips'
] as const;

export const ADMIN_HELP_TABS = [
  'overview',
  'towns',
  'trees',
  'people',
  'relationships',
  'suggestions',
  'media',
  'tree-view',
  'users',
  'tips'
] as const;

export const SUPERADMIN_HELP_TABS = [
  'overview',
  'admin-panel',
  'countries',
  'towns',
  'carousel',
  'town-images',
  'users',
  'suggestions',
  'bulk-ops',
  'statistics',
  'tips'
] as const;

// Type definitions
export type UserHelpTab = typeof USER_HELP_TABS[number];
export type AdminHelpTab = typeof ADMIN_HELP_TABS[number];
export type SuperAdminHelpTab = typeof SUPERADMIN_HELP_TABS[number];

export interface HelpDialogData {
  initialTab?: string;
}

/**
 * Service for opening role-appropriate help dialogs.
 *
 * This service determines which help dialog to display based on the current
 * user's system role (User, Admin, SuperAdmin) and handles tab validation.
 *
 * @security Requires authenticated user - returns null if not authenticated
 * @a11y Configures dialogs with proper focus management and ARIA labels
 */
@Injectable({ providedIn: 'root' })
export class HelpDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly authService = inject(AuthService);

  /**
   * Opens the appropriate help dialog based on user's system role.
   *
   * @param initialTab - Optional tab ID to open initially. Will be validated against valid tabs for the role.
   * @returns MatDialogRef or null if user is not authenticated or dialog fails to open
   *
   * @example
   * // Open help dialog to default tab
   * this.helpService.openHelp();
   *
   * @example
   * // Open help dialog to specific tab
   * this.helpService.openHelp('tree-view');
   */
  openHelp(initialTab?: string): MatDialogRef<unknown> | null {
    // Authentication check - must have valid user
    const user = this.authService.getCurrentUser();
    if (!user) {
      console.warn('HelpDialogService: Cannot open help dialog - user not authenticated');
      return null;
    }

    // Type-safe role extraction
    const role: SystemRole = user.systemRole;

    try {
      // Type-safe role comparison using SystemRole type
      switch (role) {
        case 'SuperAdmin':
          return this.openSuperAdminHelp(initialTab);
        case 'Admin':
          return this.openAdminHelp(initialTab);
        case 'User':
        default:
          // Default to User dialog for unknown roles (defensive)
          return this.openUserHelp(initialTab);
      }
    } catch (error) {
      // Error handling for dialog open failures
      console.error('HelpDialogService: Failed to open help dialog', error);
      return null;
    }
  }

  /**
   * Opens the User help dialog.
   */
  private openUserHelp(initialTab?: string): MatDialogRef<UserHelpDialogComponent> {
    const validTab = this.validateTab(initialTab, USER_HELP_TABS);

    return this.dialog.open(UserHelpDialogComponent, {
      ...this.getConfig(),
      data: { initialTab: validTab } as HelpDialogData
    });
  }

  /**
   * Opens the Admin help dialog.
   */
  private openAdminHelp(initialTab?: string): MatDialogRef<AdminHelpDialogComponent> {
    const validTab = this.validateTab(initialTab, ADMIN_HELP_TABS);

    return this.dialog.open(AdminHelpDialogComponent, {
      ...this.getConfig(),
      data: { initialTab: validTab } as HelpDialogData
    });
  }

  /**
   * Opens the SuperAdmin help dialog.
   */
  private openSuperAdminHelp(initialTab?: string): MatDialogRef<SuperAdminHelpDialogComponent> {
    const validTab = this.validateTab(initialTab, SUPERADMIN_HELP_TABS);

    return this.dialog.open(SuperAdminHelpDialogComponent, {
      ...this.getConfig(),
      data: { initialTab: validTab } as HelpDialogData
    });
  }

  /**
   * Validates that the provided tab ID exists in the valid tabs list.
   * Returns 'overview' as fallback if invalid or not provided.
   */
  private validateTab(tab: string | undefined, validTabs: readonly string[]): string {
    if (!tab) return 'overview';
    if (validTabs.includes(tab)) return tab;

    console.warn(`HelpDialogService: Invalid tab "${tab}", falling back to "overview"`);
    return 'overview';
  }

  /**
   * Returns the common dialog configuration.
   */
  private getConfig(): MatDialogConfig {
    return {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'help-dialog-panel',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ariaLabel: 'Help Guide'
    };
  }
}
