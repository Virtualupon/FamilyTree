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
import { I18nService } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-tree-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="container mx-auto p-6 max-w-4xl">
      <!-- Back Link -->
      <a routerLink="/trees" class="text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Trees
      </a>

      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }

      @if (tree()) {
        <h1 class="text-2xl font-bold mb-6">{{ tree()!.name }} - Settings</h1>

        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-6">
          <nav class="flex gap-4">
            <button 
              (click)="activeTab = 'general'"
              [class.border-blue-600]="activeTab === 'general'"
              [class.text-blue-600]="activeTab === 'general'"
              class="pb-3 px-1 border-b-2 border-transparent hover:border-gray-300 font-medium">
              General
            </button>
            <button 
              (click)="activeTab = 'members'"
              [class.border-blue-600]="activeTab === 'members'"
              [class.text-blue-600]="activeTab === 'members'"
              class="pb-3 px-1 border-b-2 border-transparent hover:border-gray-300 font-medium">
              Members ({{ members().length }})
            </button>
            <button 
              (click)="activeTab = 'invitations'"
              [class.border-blue-600]="activeTab === 'invitations'"
              [class.text-blue-600]="activeTab === 'invitations'"
              class="pb-3 px-1 border-b-2 border-transparent hover:border-gray-300 font-medium">
              Invitations
            </button>
          </nav>
        </div>

        <!-- General Tab -->
        @if (activeTab === 'general') {
          <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold mb-4">Tree Settings</h2>
            
            <form (ngSubmit)="saveSettings()">
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input 
                  type="text"
                  [(ngModel)]="editTree.name"
                  name="name"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  [(ngModel)]="editTree.description"
                  name="description"
                  rows="3"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"></textarea>
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Town/City</label>
                <select
                  [(ngModel)]="editTree.townId"
                  name="townId"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option [ngValue]="undefined">-- No town selected --</option>
                  @for (town of towns(); track town.id) {
                    <option [ngValue]="town.id">{{ getLocalizedTownName(town) }}{{ town.country ? ' (' + town.country + ')' : '' }}</option>
                  }
                </select>
                <p class="text-xs text-gray-500 mt-1">Associate this tree with a town or city</p>
              </div>

              <div class="mb-4">
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    [(ngModel)]="editTree.isPublic"
                    name="isPublic"
                    class="rounded border-gray-300 text-blue-600">
                  <span class="text-sm text-gray-700">Public tree (anyone can view)</span>
                </label>
              </div>

              <div class="mb-6">
                <label class="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    [(ngModel)]="editTree.allowCrossTreeLinking"
                    name="allowCrossTreeLinking"
                    class="rounded border-gray-300 text-blue-600">
                  <span class="text-sm text-gray-700">Allow cross-tree linking</span>
                </label>
              </div>

              @if (saveError()) {
                <div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ saveError() }}</div>
              }
              @if (saveSuccess()) {
                <div class="bg-green-50 text-green-700 px-3 py-2 rounded mb-4 text-sm">Settings saved!</div>
              }

              <button 
                type="submit"
                [disabled]="saving()"
                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {{ saving() ? 'Saving...' : 'Save Changes' }}
              </button>
            </form>

            <!-- Danger Zone -->
            <div class="mt-8 pt-6 border-t border-red-200">
              <h3 class="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
              <p class="text-sm text-gray-600 mb-4">Deleting a tree is permanent and cannot be undone.</p>
              <button 
                (click)="confirmDelete()"
                class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                Delete Tree
              </button>
            </div>
          </div>
        }

        <!-- Members Tab -->
        @if (activeTab === 'members') {
          <div class="bg-white rounded-lg shadow">
            <div class="p-4 border-b flex justify-between items-center">
              <h2 class="text-lg font-semibold">Members</h2>
            </div>
            
            <div class="divide-y">
              @for (member of members(); track member.id) {
                <div class="p-4 flex items-center justify-between">
                  <div>
                    <div class="font-medium">
                      {{ member.firstName }} {{ member.lastName }}
                      @if (!member.firstName && !member.lastName) {
                        <span class="text-gray-500">{{ member.email }}</span>
                      }
                    </div>
                    <div class="text-sm text-gray-500">{{ member.email }}</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <select 
                      [ngModel]="member.role"
                      (ngModelChange)="updateMemberRole(member, $event)"
                      [disabled]="member.role === OrgRole.Owner"
                      class="border border-gray-300 rounded px-2 py-1 text-sm">
                      @for (role of roleOptions; track role.value) {
                        <option [value]="role.value">{{ role.label }}</option>
                      }
                    </select>
                    @if (member.role !== OrgRole.Owner) {
                      <button 
                        (click)="removeMember(member)"
                        class="text-red-600 hover:text-red-800 text-sm">
                        Remove
                      </button>
                    }
                  </div>
                </div>
              }
            </div>

            @if (members().length === 0) {
              <div class="p-8 text-center text-gray-500">No members yet</div>
            }
          </div>
        }

        <!-- Invitations Tab -->
        @if (activeTab === 'invitations') {
          <div class="bg-white rounded-lg shadow">
            <div class="p-4 border-b flex justify-between items-center">
              <h2 class="text-lg font-semibold">Invitations</h2>
              <button 
                (click)="showInviteModal = true"
                class="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
                Invite Member
              </button>
            </div>
            
            <div class="divide-y">
              @for (invite of invitations(); track invite.id) {
                <div class="p-4 flex items-center justify-between">
                  <div>
                    <div class="font-medium">{{ invite.email }}</div>
                    <div class="text-sm text-gray-500">
                      Role: {{ getRoleLabel(invite.role) }} · 
                      Expires: {{ invite.expiresAt | date:'short' }}
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    @if (invite.isAccepted) {
                      <span class="text-green-600 text-sm">Accepted</span>
                    } @else {
                      <span class="text-yellow-600 text-sm">Pending</span>
                      <button 
                        (click)="deleteInvitation(invite)"
                        class="text-red-600 hover:text-red-800 text-sm">
                        Revoke
                      </button>
                    }
                  </div>
                </div>
              }
            </div>

            @if (invitations().length === 0) {
              <div class="p-8 text-center text-gray-500">No pending invitations</div>
            }
          </div>
        }
      }

      <!-- Invite Modal -->
      @if (showInviteModal) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showInviteModal = false">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" (click)="$event.stopPropagation()">
            <div class="p-6">
              <h2 class="text-xl font-semibold mb-4">Invite Member</h2>
              
              <form (ngSubmit)="sendInvitation()">
                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input 
                    type="email"
                    [(ngModel)]="newInvite.email"
                    name="email"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                </div>

                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select 
                    [(ngModel)]="newInvite.role"
                    name="role"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    @for (role of inviteRoleOptions; track role.value) {
                      <option [value]="role.value">{{ role.label }}</option>
                    }
                  </select>
                </div>

                @if (inviteError()) {
                  <div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ inviteError() }}</div>
                }

                <div class="flex gap-3">
                  <button 
                    type="button"
                    (click)="showInviteModal = false"
                    class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    [disabled]="inviting()"
                    class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {{ inviting() ? 'Sending...' : 'Send Invitation' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      }
    </div>
  `
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
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);

    this.treeService.updateTree(this.treeId, this.editTree).subscribe({
      next: (tree) => {
        this.tree.set(tree);
        this.saving.set(false);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        this.saveError.set(err.error?.message || 'Failed to save');
        this.saving.set(false);
      }
    });
  }

  updateMemberRole(member: TreeMember, newRole: OrgRole) {
    this.treeService.updateMemberRole(this.treeId, member.userId, { role: newRole }).subscribe({
      next: () => this.loadMembers(),
      error: (err) => alert(err.error?.message || 'Failed to update role')
    });
  }

  removeMember(member: TreeMember) {
    if (!confirm(`Remove ${member.email} from this tree?`)) return;
    
    this.treeService.removeMember(this.treeId, member.userId).subscribe({
      next: () => this.loadMembers(),
      error: (err) => alert(err.error?.message || 'Failed to remove member')
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
        this.inviteError.set(err.error?.message || 'Failed to send invitation');
        this.inviting.set(false);
      }
    });
  }

  deleteInvitation(invite: TreeInvitation) {
    if (!confirm(`Revoke invitation for ${invite.email}?`)) return;

    this.treeService.deleteInvitation(this.treeId, invite.id).subscribe({
      next: () => this.loadInvitations()
    });
  }

  confirmDelete() {
    const name = this.tree()?.name;
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;
    if (!confirm(`Really delete "${name}" and all its data?`)) return;

    this.treeService.deleteTree(this.treeId).subscribe({
      next: () => this.router.navigate(['/trees']),
      error: (err) => alert(err.error?.message || 'Failed to delete tree')
    });
  }

  getRoleLabel(role: OrgRole): string {
    return OrgRoleLabels[role] || 'Unknown';
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
}
