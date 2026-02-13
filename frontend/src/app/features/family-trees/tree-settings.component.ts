import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TownService } from '../../core/services/town.service';
import {
  FamilyTree,
  UpdateFamilyTreeRequest,
  TreeMember,
  TreeInvitation,
  CreateInvitationRequest
} from '../../core/models/family-tree.models';
import { TownListItem } from '../../core/models/town.models';
import { OrgRole, OrgRoleLabels } from '../../core/models/auth.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-tree-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslatePipe],
  templateUrl: './tree-settings.component.html'
})
export class TreeSettingsComponent implements OnInit {
  treeId: string = '';
  tree = signal<FamilyTree | null>(null);
  towns = signal<TownListItem[]>([]);
  members = signal<TreeMember[]>([]);
  invitations = signal<TreeInvitation[]>([]);
  loading = signal(true);

  activeTab: 'general' | 'members' | 'invitations' = 'general';

  editTree: UpdateFamilyTreeRequest = {};
  saving = signal(false);
  saveError = signal<string | null>(null);
  saveSuccess = signal(false);

  showInviteModal = false;
  newInvite: CreateInvitationRequest = { email: '', role: OrgRole.Viewer };
  inviting = signal(false);
  inviteError = signal<string | null>(null);

  OrgRole = OrgRole;

  roleOptions = [
    { value: OrgRole.Viewer, label: 'Viewer' },
    { value: OrgRole.Contributor, label: 'Contributor' },
    { value: OrgRole.Editor, label: 'Editor' },
    { value: OrgRole.SubAdmin, label: 'Sub-Admin' },
    { value: OrgRole.Admin, label: 'Admin' },
    { value: OrgRole.Owner, label: 'Owner' }
  ];

  inviteRoleOptions = this.roleOptions.filter(r => r.value !== OrgRole.Owner);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private treeService: FamilyTreeService,
    private townService: TownService,
    private i18n: I18nService
  ) {}

  ngOnInit() {
    this.treeId = this.route.snapshot.paramMap.get('id') || '';
    this.loadTree();
    this.loadTowns();
    this.loadMembers();
    this.loadInvitations();
  }

  loadTowns() {
    this.townService.getTowns({ page: 1, pageSize: 500 }).subscribe({
      next: (result) => {
        this.towns.set(result.items);
      },
      error: () => {
        this.towns.set([]);
      }
    });
  }

  loadTree() {
    this.treeService.getTree(this.treeId).subscribe({
      next: (tree) => {
        this.tree.set(tree);
        this.editTree = {
          name: tree.name,
          description: tree.description || '',
          isPublic: tree.isPublic,
          allowCrossTreeLinking: tree.allowCrossTreeLinking,
          townId: tree.townId || undefined
        };
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadMembers() {
    this.treeService.getMembers(this.treeId).subscribe({
      next: (members) => this.members.set(members)
    });
  }

  loadInvitations() {
    this.treeService.getInvitations(this.treeId).subscribe({
      next: (invitations) => this.invitations.set(invitations)
    });
  }

  saveSettings() {
    console.log('saveSettings called');
    console.log('treeId:', this.treeId);
    console.log('editTree:', JSON.stringify(this.editTree, null, 2));

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);

    this.treeService.updateTree(this.treeId, this.editTree).subscribe({
      next: (tree) => {
        console.log('Save successful:', tree);
        this.tree.set(tree);
        this.saving.set(false);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        console.error('Save failed:', err);
        console.error('Error status:', err.status);
        console.error('Error body:', err.error);
        this.saveError.set(err.error?.message || this.i18n.t('treeSettings.errors.saveFailed'));
        this.saving.set(false);
      }
    });
  }

  updateMemberRole(member: TreeMember, newRole: OrgRole) {
    this.treeService.updateMemberRole(this.treeId, member.userId, { role: newRole }).subscribe({
      next: () => this.loadMembers(),
      error: (err) => alert(err.error?.message || this.i18n.t('treeSettings.errors.updateRoleFailed'))
    });
  }

  removeMember(member: TreeMember) {
    if (!confirm(this.i18n.t('treeActions.confirmRemoveMember', { email: member.email }))) return;

    this.treeService.removeMember(this.treeId, member.userId).subscribe({
      next: () => this.loadMembers(),
      error: (err) => alert(err.error?.message || this.i18n.t('treeActions.failedRemoveMember'))
    });
  }

  sendInvitation() {
    if (!this.newInvite.email) return;

    this.inviting.set(true);
    this.inviteError.set(null);

    this.treeService.createInvitation(this.treeId, this.newInvite).subscribe({
      next: () => {
        this.showInviteModal = false;
        this.newInvite = { email: '', role: OrgRole.Viewer };
        this.loadInvitations();
        this.inviting.set(false);
      },
      error: (err) => {
        this.inviteError.set(err.error?.message || this.i18n.t('treeActions.failedSendInvitation'));
        this.inviting.set(false);
      }
    });
  }

  deleteInvitation(invite: TreeInvitation) {
    if (!confirm(this.i18n.t('treeActions.confirmRevokeInvitation', { email: invite.email }))) return;

    this.treeService.deleteInvitation(this.treeId, invite.id).subscribe({
      next: () => this.loadInvitations()
    });
  }

  confirmDelete() {
    const name = this.tree()?.name || '';
    if (!confirm(this.i18n.t('treeActions.confirmDelete', { name }))) return;
    if (!confirm(this.i18n.t('treeSettings.confirmDeleteFinal', { name }))) return;

    this.treeService.deleteTree(this.treeId).subscribe({
      next: () => this.router.navigate(['/trees']),
      error: (err) => alert(err.error?.message || this.i18n.t('treeActions.failedDelete'))
    });
  }

  getRoleLabel(role: OrgRole): string {
    return OrgRoleLabels[role] || this.i18n.t('common.unknown');
  }

  getLocalizedTownName(town: TownListItem): string {
    return this.i18n.getTownName(town);
  }
}
