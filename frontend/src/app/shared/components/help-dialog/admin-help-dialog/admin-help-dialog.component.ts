import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { HelpDialogData, ADMIN_HELP_TABS, AdminHelpTab } from '../help-dialog.service';

interface TabConfig {
  id: AdminHelpTab;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-admin-help-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule
  ],
  templateUrl: './admin-help-dialog.component.html',
  styleUrls: ['./admin-help-dialog.component.scss']
})
export class AdminHelpDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<AdminHelpDialogComponent>);
  private readonly data = inject<HelpDialogData>(MAT_DIALOG_DATA, { optional: true });
  protected readonly i18n = inject(I18nService);

  activeTab: AdminHelpTab = 'overview';

  readonly tabs: TabConfig[] = [
    { id: 'overview', labelKey: 'HELP.ADMIN.TABS.OVERVIEW', icon: 'home' },
    { id: 'towns', labelKey: 'HELP.ADMIN.TABS.TOWNS', icon: 'location_city' },
    { id: 'trees', labelKey: 'HELP.ADMIN.TABS.TREES', icon: 'forest' },
    { id: 'people', labelKey: 'HELP.ADMIN.TABS.PEOPLE', icon: 'people' },
    { id: 'relationships', labelKey: 'HELP.ADMIN.TABS.RELATIONSHIPS', icon: 'link' },
    { id: 'suggestions', labelKey: 'HELP.ADMIN.TABS.SUGGESTIONS', icon: 'rate_review' },
    { id: 'media', labelKey: 'HELP.ADMIN.TABS.MEDIA', icon: 'photo_library' },
    { id: 'tree-view', labelKey: 'HELP.ADMIN.TABS.TREE_VIEW', icon: 'account_tree' },
    { id: 'users', labelKey: 'HELP.ADMIN.TABS.USERS', icon: 'manage_accounts' },
    { id: 'tips', labelKey: 'HELP.ADMIN.TABS.TIPS', icon: 'tips_and_updates' }
  ];

  ngOnInit(): void {
    if (this.data?.initialTab && ADMIN_HELP_TABS.includes(this.data.initialTab as AdminHelpTab)) {
      this.activeTab = this.data.initialTab as AdminHelpTab;
    }
  }

  setActiveTab(tabId: AdminHelpTab): void {
    this.activeTab = tabId;
  }

  close(): void {
    this.dialogRef.close();
  }

  onTabKeydown(event: KeyboardEvent, tabId: AdminHelpTab): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.setActiveTab(tabId);
    }
  }
}
