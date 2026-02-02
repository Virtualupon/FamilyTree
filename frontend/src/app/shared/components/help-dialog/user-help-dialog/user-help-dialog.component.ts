import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { HelpDialogData, USER_HELP_TABS, UserHelpTab } from '../help-dialog.service';

interface TabConfig {
  id: UserHelpTab;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-user-help-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule
  ],
  templateUrl: './user-help-dialog.component.html',
  styleUrls: ['./user-help-dialog.component.scss']
})
export class UserHelpDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<UserHelpDialogComponent>);
  private readonly data = inject<HelpDialogData>(MAT_DIALOG_DATA, { optional: true });
  protected readonly i18n = inject(I18nService);

  activeTab: UserHelpTab = 'overview';

  readonly tabs: TabConfig[] = [
    { id: 'overview', labelKey: 'HELP.USER.TABS.OVERVIEW', icon: 'home' },
    { id: 'onboarding', labelKey: 'HELP.USER.TABS.ONBOARDING', icon: 'rocket_launch' },
    { id: 'dashboard', labelKey: 'HELP.USER.TABS.DASHBOARD', icon: 'dashboard' },
    { id: 'trees', labelKey: 'HELP.USER.TABS.TREES', icon: 'forest' },
    { id: 'people', labelKey: 'HELP.USER.TABS.PEOPLE', icon: 'people' },
    { id: 'tree-view', labelKey: 'HELP.USER.TABS.TREE_VIEW', icon: 'account_tree' },
    { id: 'media', labelKey: 'HELP.USER.TABS.MEDIA', icon: 'photo_library' },
    { id: 'suggestions', labelKey: 'HELP.USER.TABS.SUGGESTIONS', icon: 'lightbulb' },
    { id: 'profile', labelKey: 'HELP.USER.TABS.PROFILE', icon: 'person' },
    { id: 'tips', labelKey: 'HELP.USER.TABS.TIPS', icon: 'tips_and_updates' }
  ];

  ngOnInit(): void {
    if (this.data?.initialTab && USER_HELP_TABS.includes(this.data.initialTab as UserHelpTab)) {
      this.activeTab = this.data.initialTab as UserHelpTab;
    }
  }

  setActiveTab(tabId: UserHelpTab): void {
    this.activeTab = tabId;
  }

  close(): void {
    this.dialogRef.close();
  }

  onTabKeydown(event: KeyboardEvent, tabId: UserHelpTab): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.setActiveTab(tabId);
    }
  }
}
