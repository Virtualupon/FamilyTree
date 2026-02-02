import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { HelpDialogData, SUPERADMIN_HELP_TABS, SuperAdminHelpTab } from '../help-dialog.service';

interface TabConfig {
  id: SuperAdminHelpTab;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-superadmin-help-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule
  ],
  templateUrl: './superadmin-help-dialog.component.html',
  styleUrls: ['./superadmin-help-dialog.component.scss']
})
export class SuperAdminHelpDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<SuperAdminHelpDialogComponent>);
  private readonly data = inject<HelpDialogData>(MAT_DIALOG_DATA, { optional: true });
  protected readonly i18n = inject(I18nService);

  activeTab: SuperAdminHelpTab = 'overview';

  readonly tabs: TabConfig[] = [
    { id: 'overview', labelKey: 'HELP.SUPERADMIN.TABS.OVERVIEW', icon: 'home' },
    { id: 'admin-panel', labelKey: 'HELP.SUPERADMIN.TABS.ADMIN_PANEL', icon: 'admin_panel_settings' },
    { id: 'countries', labelKey: 'HELP.SUPERADMIN.TABS.COUNTRIES', icon: 'public' },
    { id: 'towns', labelKey: 'HELP.SUPERADMIN.TABS.TOWNS', icon: 'location_city' },
    { id: 'carousel', labelKey: 'HELP.SUPERADMIN.TABS.CAROUSEL', icon: 'view_carousel' },
    { id: 'town-images', labelKey: 'HELP.SUPERADMIN.TABS.TOWN_IMAGES', icon: 'collections' },
    { id: 'users', labelKey: 'HELP.SUPERADMIN.TABS.USERS', icon: 'manage_accounts' },
    { id: 'suggestions', labelKey: 'HELP.SUPERADMIN.TABS.SUGGESTIONS', icon: 'rate_review' },
    { id: 'bulk-ops', labelKey: 'HELP.SUPERADMIN.TABS.BULK_OPS', icon: 'dynamic_feed' },
    { id: 'statistics', labelKey: 'HELP.SUPERADMIN.TABS.STATISTICS', icon: 'analytics' },
    { id: 'tips', labelKey: 'HELP.SUPERADMIN.TABS.TIPS', icon: 'tips_and_updates' }
  ];

  ngOnInit(): void {
    if (this.data?.initialTab && SUPERADMIN_HELP_TABS.includes(this.data.initialTab as SuperAdminHelpTab)) {
      this.activeTab = this.data.initialTab as SuperAdminHelpTab;
    }
  }

  setActiveTab(tabId: SuperAdminHelpTab): void {
    this.activeTab = tabId;
  }

  close(): void {
    this.dialogRef.close();
  }

  onTabKeydown(event: KeyboardEvent, tabId: SuperAdminHelpTab): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.setActiveTab(tabId);
    }
  }
}
