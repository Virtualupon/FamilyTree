import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TownService } from '../../core/services/town.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Town, UpdateTownRequest } from '../../core/models/town.models';
import { FamilyTreeListItem } from '../../core/models/family-tree.models';
import { OrgRole, OrgRoleLabels } from '../../core/models/auth.models';

@Component({
  selector: 'app-town-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './town-detail.component.html',
  styleUrls: ['./town-detail.component.scss']
})
export class TownDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private townService = inject(TownService);
  private authService = inject(AuthService);
  i18n = inject(I18nService);

  town = signal<Town | null>(null);
  trees = signal<FamilyTreeListItem[]>([]);
  loading = signal(true);
  treesLoading = signal(true);
  error = signal<string | null>(null);

  showEditModal = false;
  saving = signal(false);
  editError = signal<string | null>(null);
  editTown: UpdateTownRequest = {};

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadTown(id);
      this.loadTrees(id);
    }
  }

  loadTown(id: string) {
    this.loading.set(true);
    this.error.set(null);

    this.townService.getTown(id).subscribe({
      next: (town) => {
        this.town.set(town);
        this.editTown = {
          name: town.name,
          nameEn: town.nameEn,
          nameAr: town.nameAr,
          nameLocal: town.nameLocal,
          description: town.description,
          country: town.country
        };
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('towns.failedLoad'));
        this.loading.set(false);
      }
    });
  }

  loadTrees(townId: string) {
    this.treesLoading.set(true);

    this.townService.getTownTrees(townId).subscribe({
      next: (trees) => {
        this.trees.set(trees);
        this.treesLoading.set(false);
      },
      error: () => {
        this.treesLoading.set(false);
      }
    });
  }

  updateTown() {
    const townId = this.town()?.id;
    if (!townId || !this.editTown.name?.trim()) return;

    this.saving.set(true);
    this.editError.set(null);

    this.townService.updateTown(townId, this.editTown).subscribe({
      next: (updated) => {
        this.town.set(updated);
        this.showEditModal = false;
        this.saving.set(false);
      },
      error: (err) => {
        this.editError.set(err.error?.message || this.i18n.t('towns.failedUpdate'));
        this.saving.set(false);
      }
    });
  }

  confirmDelete() {
    const townId = this.town()?.id;
    if (!townId) return;

    if (confirm(this.i18n.t('towns.confirmDelete'))) {
      this.townService.deleteTown(townId).subscribe({
        next: () => {
          this.router.navigate(['/towns']);
        },
        error: (err) => {
          this.error.set(err.error?.message || this.i18n.t('towns.failedDelete'));
        }
      });
    }
  }

  getTownDisplayName(): string {
    const t = this.town();
    if (!t) return '';
    return this.i18n.getTownName(t);
  }

  getRoleLabel(role: OrgRole | null): string {
    if (role === null) return '';
    return OrgRoleLabels[role] || this.i18n.t('common.unknown');
  }

  isAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'SuperAdmin' || user?.systemRole === 'Admin';
  }

  isSuperAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'SuperAdmin';
  }
}
