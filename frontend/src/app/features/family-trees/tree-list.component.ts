import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TownService } from '../../core/services/town.service';
import { FamilyService } from '../../core/services/family.service';
import { AuthService } from '../../core/services/auth.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { AdminService } from '../../core/services/admin.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyTreeListItem, CreateFamilyTreeRequest } from '../../core/models/family-tree.models';
import { TownListItem } from '../../core/models/town.models';
import { FamilyListItem, FamilyWithMembers } from '../../core/models/family.models';
import { OrgRole, OrgRoleLabels } from '../../core/models/auth.models';
import { GedcomImportDialogComponent } from './gedcom-import-dialog.component';

@Component({
  selector: 'app-tree-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslatePipe, GedcomImportDialogComponent],
  template: `
    <div class="tree-list-page">
      <!-- Greeting Header with Town Selector -->
      <div class="greeting-header">
        <div class="greeting-content">
          <div class="greeting-text">
            <h1>{{ getGreeting() }}, {{ getUserFirstName() }}!</h1>
            <p class="greeting-subtitle">{{ 'trees.greetingSubtitle' | translate }}</p>
          </div>

          <!-- Town Selector Dropdown -->
          <div class="town-selector-container">
            <label class="town-selector-label">{{ 'trees.selectYourTown' | translate }}</label>
            <div class="town-selector-dropdown" (click)="toggleTownDropdown()">
              <div class="town-selector-value">
                <svg class="town-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <span>{{ getSelectedTownDisplayName() || ('trees.chooseTown' | translate) }}</span>
                <svg class="dropdown-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>

              @if (showTownDropdown()) {
                <div class="town-dropdown-menu">
                  @for (town of availableTowns(); track town.id) {
                    <div
                      class="town-dropdown-item"
                      [class.active]="selectedTownId === town.id"
                      (click)="selectTown(town); $event.stopPropagation()">
                      <span class="town-name">{{ getLocalizedTownName(town) }}</span>
                      <span class="town-meta">{{ town.treeCount || 0 }} {{ 'nav.trees' | translate }}</span>
                      @if (selectedTownId === town.id) {
                        <svg class="check-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                      }
                    </div>
                  }
                  @if (availableTowns().length === 0) {
                    <div class="town-dropdown-empty">
                      {{ 'nav.noTownsAssigned' | translate }}
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content Area -->
      @if (!selectedTownId) {
        <!-- No Town Selected - Show prompt -->
        <div class="empty-state select-town-prompt">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
          <h3>{{ 'trees.selectTownFirst' | translate }}</h3>
          <p>{{ 'trees.selectTownHint' | translate }}</p>
        </div>
      } @else if (!selectedFamilyId()) {
        <!-- Town Selected - Show Families -->
        <div class="section-header">
          <div class="section-title">
            <h2>{{ getSelectedTownDisplayName() }} - {{ 'trees.title' | translate }}</h2>
            <p class="section-subtitle">{{ 'trees.manageFamilies' | translate }}</p>
          </div>
          <div class="section-actions">
            <button class="btn-secondary" (click)="showImportModal = true">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              {{ 'trees.import' | translate }}
            </button>
            <button class="btn-primary" (click)="showCreateModal = true">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ 'familyGroups.create' | translate }}
            </button>
          </div>
        </div>

        <!-- Search Families -->
        <div class="filters">
          <div class="search-box">
            <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              [(ngModel)]="familySearchQuery"
              [placeholder]="'familyGroups.searchPlaceholder' | translate"
              class="search-input">
          </div>
        </div>

        <!-- Loading Families -->
        @if (loadingFamilies()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{{ 'common.loading' | translate }}</p>
          </div>
        }

        <!-- Families Grid -->
        @if (!loadingFamilies() && filteredFamilies().length > 0) {
          <div class="stats-bar">
            <span>{{ filteredFamilies().length }} {{ 'familyGroups.found' | translate }}</span>
          </div>
          <div class="family-grid">
            @for (family of filteredFamilies(); track family.id) {
              <div class="family-card" (click)="selectFamily(family.id)" [style.border-left-color]="family.color || '#6366f1'">
                <div class="family-card-header">
                  <div class="family-color-badge" [style.background-color]="family.color || '#6366f1'"></div>
                  <h3 class="family-name">{{ getLocalizedFamilyName(family) }}</h3>
                </div>
                <div class="family-card-body">
                  <div class="family-meta">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <span>{{ family.memberCount }} {{ 'trees.people' | translate }}</span>
                  </div>
                </div>
                <div class="family-card-action">
                  <span>{{ 'trees.viewMembers' | translate }}</span>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            }
          </div>
        }

        <!-- No Families -->
        @if (!loadingFamilies() && filteredFamilies().length === 0) {
          <div class="empty-state">
            @if (familySearchQuery) {
              <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <h3>{{ 'familyGroups.noResults' | translate }}</h3>
              <p>{{ 'familyGroups.tryDifferentSearch' | translate }}</p>
              <button class="btn-secondary" (click)="familySearchQuery = ''">{{ 'trees.clearFilters' | translate }}</button>
            } @else {
              <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <h3>{{ 'familyGroups.noFamilies' | translate }}</h3>
              <p>{{ 'familyGroups.createFirst' | translate }}</p>
              <button class="btn-primary" (click)="showCreateModal = true">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                {{ 'familyGroups.createFirstButton' | translate }}
              </button>
            }
          </div>
        }
      } @else {
        <!-- Family Selected - Show People -->
        <div class="section-header with-back">
          <button class="back-button" (click)="clearFamilySelection()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            {{ 'common.back' | translate }}
          </button>
          <div class="section-title">
            <h2>{{ getSelectedFamilyDisplayName() }}</h2>
            <p class="section-subtitle">{{ selectedFamilyDetails()?.memberCount || 0 }} {{ 'trees.people' | translate }}</p>
          </div>
        </div>

        <!-- Loading Members -->
        @if (loadingMembers()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{{ 'common.loading' | translate }}</p>
          </div>
        }

        <!-- Members List -->
        @if (!loadingMembers() && selectedFamilyDetails()) {
          <div class="members-grid">
            @for (member of selectedFamilyDetails()!.members; track member.id) {
              <div class="member-card" [routerLink]="['/people', member.id]">
                <div class="member-avatar" [class.female]="member.sex === 1" [class.unknown]="member.sex !== 0 && member.sex !== 1">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                </div>
                <div class="member-info">
                  <h4 class="member-name">{{ member.primaryName || ('person.unknown' | translate) }}</h4>
                  <div class="member-meta">
                    @if (member.birthDate) {
                      <span>{{ formatYear(member.birthDate) }}</span>
                    }
                    @if (member.birthDate && member.deathDate) {
                      <span>-</span>
                    }
                    @if (member.deathDate) {
                      <span>{{ formatYear(member.deathDate) }}</span>
                    }
                    @if (!member.birthDate && !member.deathDate && member.isLiving) {
                      <span class="living-badge">{{ 'personForm.isLiving' | translate }}</span>
                    }
                  </div>
                </div>
                <svg class="member-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            }
            @if (selectedFamilyDetails()!.members.length === 0) {
              <div class="empty-state small">
                <p>{{ 'familyGroups.noMembers' | translate }}</p>
              </div>
            }
          </div>
        }
      }

      <!-- Old Filters - Hidden -->
      <div class="filters" style="display: none;">
        <div class="search-box">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            [(ngModel)]="searchQuery"
            [placeholder]="'trees.searchPlaceholder' | translate"
            class="search-input">
        </div>
        <select [(ngModel)]="selectedTownId" class="town-filter">
          <option [ngValue]="null">{{ 'trees.allTowns' | translate }}</option>
          @for (town of towns(); track town.id) {
            <option [ngValue]="town.id">{{ getLocalizedTownName(town) }}</option>
          }
        </select>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>{{ 'common.loading' | translate }}</p>
        </div>
      }

      <!-- Error -->
      @if (error()) {
        <div class="error-state">
          <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p>{{ error() }}</p>
          <button class="btn-secondary" (click)="loadTrees()">{{ 'common.retry' | translate }}</button>
        </div>
      }

      <!-- Tree Grid -->
      @if (!loading() && filteredTrees().length > 0) {
        <div class="stats-bar">
          <span>{{ filteredTrees().length }} {{ 'trees.treesFound' | translate }}</span>
        </div>
        <div class="tree-grid">
          @for (tree of filteredTrees(); track tree.id) {
            <div class="tree-card" [class.public]="tree.isPublic">
              <!-- Cover -->
              <div class="card-cover">
                @if (tree.coverImageUrl) {
                  <img [src]="tree.coverImageUrl" alt="" class="cover-image">
                } @else {
                  <div class="cover-gradient"></div>
                }
                <div class="cover-overlay">
                  @if (tree.isPublic) {
                    <span class="badge public-badge">
                      <svg class="badge-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/>
                      </svg>
                      {{ 'trees.public' | translate }}
                    </span>
                  }
                </div>
                <div class="tree-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/>
                  </svg>
                </div>
              </div>

              <!-- Content -->
              <div class="card-content">
                <h3 class="tree-name">{{ tree.name }}</h3>
                @if (tree.description) {
                  <p class="tree-description">{{ tree.description }}</p>
                }

                <div class="tree-meta">
                  <div class="meta-item">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <span>{{ tree.personCount }} {{ 'trees.people' | translate }}</span>
                  </div>
                  @if (tree.userRole !== null && tree.userRole !== undefined) {
                    <span class="role-badge" [class]="'role-' + tree.userRole">
                      {{ getRoleLabel(tree.userRole) }}
                    </span>
                  }
                </div>

                <div class="card-actions">
                  <a [routerLink]="['/trees', tree.id]" class="btn-primary btn-sm">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    {{ 'trees.open' | translate }}
                  </a>
                  @if (canManage(tree.userRole)) {
                    <a [routerLink]="['/trees', tree.id, 'settings']" class="btn-icon" [title]="'trees.settings' | translate">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    </a>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @if (!loading() && !error() && filteredTrees().length === 0) {
        <div class="empty-state">
          @if (searchQuery || selectedTownId) {
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <h3>{{ 'trees.noResults' | translate }}</h3>
            <p>{{ 'trees.tryDifferentSearch' | translate }}</p>
            <button class="btn-secondary" (click)="clearFilters()">{{ 'trees.clearFilters' | translate }}</button>
          } @else {
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/>
            </svg>
            <h3>{{ 'trees.noTrees' | translate }}</h3>
            <p>{{ 'trees.createFirst' | translate }}</p>
            <button class="btn-primary" (click)="showCreateModal = true">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ 'trees.createFirstButton' | translate }}
            </button>
          }
        </div>
      }

      <!-- Create Modal -->
      @if (showCreateModal) {
        <div class="modal-backdrop" (click)="showCreateModal = false">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>{{ 'trees.createTitle' | translate }}</h2>
              <button class="modal-close" (click)="showCreateModal = false">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form (ngSubmit)="createTree()" class="modal-body">
              <div class="form-group">
                <label class="form-label required">{{ 'trees.name' | translate }}</label>
                <input
                  type="text"
                  [(ngModel)]="newTree.name"
                  name="name"
                  required
                  class="form-input"
                  [placeholder]="'trees.namePlaceholder' | translate">
              </div>

              <div class="form-group">
                <label class="form-label">{{ 'trees.description' | translate }}</label>
                <textarea
                  [(ngModel)]="newTree.description"
                  name="description"
                  rows="3"
                  class="form-input"
                  [placeholder]="'trees.descriptionPlaceholder' | translate"></textarea>
              </div>

              <div class="form-group">
                <label class="form-label required">{{ 'trees.town' | translate }}</label>
                <select [(ngModel)]="newTree.townId" name="townId" class="form-input" required>
                  <option [ngValue]="''" disabled>{{ 'trees.selectTown' | translate }}</option>
                  @for (town of towns(); track town.id) {
                    <option [ngValue]="town.id">{{ getLocalizedTownName(town) }}{{ town.country ? ' (' + town.country + ')' : '' }}</option>
                  }
                </select>
                <p class="form-hint">{{ 'trees.townHintRequired' | translate }}</p>
              </div>

              <div class="form-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="newTree.isPublic"
                    name="isPublic"
                    class="checkbox">
                  <span>{{ 'trees.makePublic' | translate }}</span>
                </label>
              </div>

              <div class="form-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="newTree.allowCrossTreeLinking"
                    name="allowCrossTreeLinking"
                    class="checkbox">
                  <span>{{ 'trees.allowLinking' | translate }}</span>
                </label>
                <p class="form-hint">{{ 'trees.linkingHint' | translate }}</p>
              </div>

              @if (createError()) {
                <div class="error-message">{{ createError() }}</div>
              }

              <div class="modal-actions">
                <button type="button" class="btn-secondary" (click)="showCreateModal = false">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="submit" class="btn-primary" [disabled]="creating()">
                  @if (creating()) {
                    <span class="spinner-sm"></span>
                  }
                  {{ creating() ? ('common.creating' | translate) : ('trees.create' | translate) }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- GEDCOM Import Dialog -->
      @if (showImportModal) {
        <app-gedcom-import-dialog
          (close)="showImportModal = false"
          (imported)="onImportComplete()">
        </app-gedcom-import-dialog>
      }
    </div>
  `,
  styles: [`
    .tree-list-page {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Greeting Header */
    .greeting-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 32px;
      color: white;
    }

    .greeting-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 24px;
    }

    .greeting-text h1 {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 8px 0;
    }

    .greeting-subtitle {
      margin: 0;
      opacity: 0.9;
      font-size: 16px;
    }

    .town-selector-container {
      min-width: 280px;
    }

    .town-selector-label {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.8;
      margin-bottom: 8px;
    }

    .town-selector-dropdown {
      position: relative;
      cursor: pointer;
    }

    .town-selector-value {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 12px;
      backdrop-filter: blur(10px);
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }

      span {
        flex: 1;
        font-weight: 500;
      }
    }

    .town-icon {
      width: 24px;
      height: 24px;
    }

    .dropdown-arrow {
      width: 20px;
      height: 20px;
      transition: transform 0.2s;
    }

    .town-dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 8px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      z-index: 100;
      overflow: hidden;
      max-height: 300px;
      overflow-y: auto;
    }

    .town-dropdown-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      color: #1a1a2e;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #f3f4f6;
      }

      &.active {
        background: #ede9fe;
      }

      .town-name {
        flex: 1;
        font-weight: 500;
      }

      .town-meta {
        font-size: 12px;
        color: #6b7280;
      }

      .check-icon {
        width: 20px;
        height: 20px;
        color: #6366f1;
      }
    }

    .town-dropdown-empty {
      padding: 20px;
      text-align: center;
      color: #6b7280;
    }

    /* Section Header */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;

      &.with-back {
        justify-content: flex-start;
        gap: 20px;
      }
    }

    .section-title h2 {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 4px 0;
    }

    .section-subtitle {
      color: #6b7280;
      font-size: 14px;
      margin: 0;
    }

    .section-actions {
      display: flex;
      gap: 12px;
    }

    .back-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #f3f4f6;
      border: none;
      border-radius: 8px;
      color: #374151;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      svg {
        width: 20px;
        height: 20px;
      }

      &:hover {
        background: #e5e7eb;
      }
    }

    /* Family Grid */
    .family-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    .family-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-left: 4px solid #6366f1;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }
    }

    .family-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .family-color-badge {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .family-name {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0;
    }

    .family-card-body {
      margin-bottom: 16px;
    }

    .family-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #6b7280;
      font-size: 14px;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .family-card-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      color: #6366f1;
      font-size: 14px;
      font-weight: 500;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    /* Members Grid */
    .members-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .member-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: inherit;

      &:hover {
        background: #f9fafb;
        transform: translateX(4px);
      }
    }

    .member-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #dbeafe;
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 24px;
        height: 24px;
        color: #3b82f6;
      }

      &.female {
        background: #fce7f3;
        svg { color: #ec4899; }
      }

      &.unknown {
        background: #e5e7eb;
        svg { color: #6b7280; }
      }
    }

    .member-info {
      flex: 1;
    }

    .member-name {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 4px 0;
    }

    .member-meta {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #6b7280;
      font-size: 13px;
    }

    .living-badge {
      background: #d1fae5;
      color: #047857;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }

    .member-arrow {
      width: 20px;
      height: 20px;
      color: #9ca3af;
    }

    .select-town-prompt {
      margin-top: 40px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .header-title h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 4px 0;
    }

    .subtitle {
      color: #6b7280;
      font-size: 14px;
      margin: 0;
    }

    .filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 250px;
      max-width: 400px;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      color: #9ca3af;
    }

    .search-input {
      width: 100%;
      padding: 10px 12px 10px 40px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      transition: all 0.2s;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }

    .town-filter {
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      min-width: 180px;
      background: white;
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }

    .stats-bar {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .tree-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }

    .tree-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: all 0.3s ease;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
      }
    }

    .card-cover {
      height: 120px;
      position: relative;
      overflow: hidden;
    }

    .cover-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-gradient {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .cover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 12px;
      display: flex;
      justify-content: flex-end;
    }

    .tree-icon {
      position: absolute;
      bottom: -20px;
      left: 20px;
      width: 48px;
      height: 48px;
      background: white;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

      svg {
        width: 24px;
        height: 24px;
        color: #667eea;
      }
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .public-badge {
      background: rgba(255, 255, 255, 0.95);
      color: #059669;

      .badge-icon {
        width: 12px;
        height: 12px;
      }
    }

    .card-content {
      padding: 28px 20px 20px;
    }

    .tree-name {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 8px 0;
    }

    .tree-description {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 16px 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .tree-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #6b7280;
      font-size: 13px;

      svg {
        width: 16px;
        height: 16px;
      }
    }

    .role-badge {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;

      &.role-0 { background: #f3f4f6; color: #6b7280; } // Viewer
      &.role-1 { background: #dbeafe; color: #1d4ed8; } // Contributor
      &.role-2 { background: #d1fae5; color: #047857; } // Editor
      &.role-3 { background: #fef3c7; color: #b45309; } // SubAdmin
      &.role-4 { background: #ede9fe; color: #6d28d9; } // Admin
      &.role-5 { background: #fce7f3; color: #be185d; } // Owner
    }

    .card-actions {
      display: flex;
      gap: 8px;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        transform: translateY(-1px);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .icon {
        width: 18px;
        height: 18px;
      }
    }

    .btn-sm {
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
    }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px;
      background: white;
      color: #374151;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: #f9fafb;
        border-color: #d1d5db;
      }
    }

    .btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      background: #f3f4f6;
      border: none;
      border-radius: 8px;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s;

      svg {
        width: 18px;
        height: 18px;
      }

      &:hover {
        background: #e5e7eb;
        color: #374151;
      }
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      color: #6b7280;

      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
      }
    }

    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;

      .error-icon {
        width: 48px;
        height: 48px;
        color: #ef4444;
        margin-bottom: 16px;
      }

      p {
        color: #6b7280;
        margin-bottom: 16px;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;

      .empty-icon {
        width: 64px;
        height: 64px;
        color: #d1d5db;
        margin-bottom: 20px;
      }

      h3 {
        font-size: 18px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 8px 0;
      }

      p {
        color: #6b7280;
        margin: 0 0 20px 0;
      }
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .modal {
      background: white;
      border-radius: 16px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;

      h2 {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
      }
    }

    .modal-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: none;
      border: none;
      border-radius: 8px;
      color: #6b7280;
      cursor: pointer;

      &:hover {
        background: #f3f4f6;
      }

      svg {
        width: 20px;
        height: 20px;
      }
    }

    .modal-body {
      padding: 24px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;

      &.required::after {
        content: ' *';
        color: #ef4444;
      }
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      transition: all 0.2s;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }

    .form-hint {
      font-size: 12px;
      color: #6b7280;
      margin: 6px 0 0 0;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-size: 14px;
      color: #374151;
    }

    .checkbox {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      cursor: pointer;
    }

    .error-message {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .modal-actions {
      display: flex;
      gap: 12px;
      padding-top: 8px;

      button {
        flex: 1;
      }
    }

    .spinner-sm {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 640px) {
      .tree-list-page {
        padding: 16px;
      }

      .header-content {
        flex-direction: column;
        gap: 16px;
      }

      .filters {
        flex-direction: column;
      }

      .search-box {
        max-width: none;
      }

      .tree-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TreeListComponent implements OnInit {
  private readonly treeContext = inject(TreeContextService);
  private readonly familyService = inject(FamilyService);

  trees = signal<FamilyTreeListItem[]>([]);
  towns = signal<TownListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // Family groups state
  families = signal<FamilyListItem[]>([]);
  loadingFamilies = signal(false);
  selectedFamilyId = signal<string | null>(null);
  selectedFamilyDetails = signal<FamilyWithMembers | null>(null);
  loadingMembers = signal(false);
  familySearchQuery = '';

  // Town dropdown state
  showTownDropdown = signal(false);
  availableTowns = signal<TownListItem[]>([]);

  searchQuery = '';
  selectedTownId: string | null = null;

  showCreateModal = false;
  showImportModal = false;
  creating = signal(false);
  createError = signal<string | null>(null);

  // HIERARCHY: Every tree MUST belong to a town
  newTree: CreateFamilyTreeRequest = {
    name: '',
    townId: '',  // REQUIRED - user must select a town
    description: '',
    isPublic: false,
    allowCrossTreeLinking: true
  };

  filteredTrees = computed(() => {
    let result = this.trees();

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(tree =>
        tree.name.toLowerCase().includes(query) ||
        (tree.description?.toLowerCase().includes(query))
      );
    }

    // HIERARCHY: Filter by town - trees are always under towns
    if (this.selectedTownId) {
      result = result.filter(tree => tree.townId === this.selectedTownId);
    }

    return result;
  });

  filteredFamilies = computed(() => {
    let result = this.families();

    if (this.familySearchQuery.trim()) {
      const query = this.familySearchQuery.toLowerCase();
      result = result.filter(family =>
        family.name.toLowerCase().includes(query) ||
        (family.nameEn?.toLowerCase().includes(query)) ||
        (family.nameAr?.toLowerCase().includes(query)) ||
        (family.nameLocal?.toLowerCase().includes(query))
      );
    }

    return result;
  });

  constructor(
    private treeService: FamilyTreeService,
    private townService: TownService,
    private authService: AuthService,
    private adminService: AdminService,
    private i18n: I18nService
  ) {}

  ngOnInit() {
    this.loadTrees();
    this.loadTowns();
    this.loadAvailableTowns();
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

  loadAvailableTowns() {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    if (user.systemRole === 'SuperAdmin') {
      // SuperAdmin: load all towns
      this.townService.getTowns({ page: 1, pageSize: 500 }).subscribe({
        next: (result) => {
          this.availableTowns.set(result.items);
        }
      });
    } else if (user.systemRole === 'Admin') {
      // Admin: load only assigned towns
      this.adminService.getUserTownAssignments(user.id).subscribe({
        next: (assignments) => {
          const towns = assignments
            .filter(a => a.isActive)
            .map(a => ({
              id: a.townId,
              name: a.townName || 'Unknown Town',
              nameEn: a.townNameEn || undefined,
              nameAr: a.townNameAr || undefined,
              nameLocal: a.townNameLocal || undefined,
              country: '',
              region: '',
              treeCount: a.treeCount || 0,
              personCount: 0,
              createdAt: new Date().toISOString()
            }));
          this.availableTowns.set(towns);
        },
        error: () => {
          this.availableTowns.set([]);
        }
      });
    } else {
      // Regular users: no town selector
      this.availableTowns.set([]);
    }
  }

  // Greeting based on time of day
  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return this.i18n.t('trees.goodMorning');
    if (hour < 18) return this.i18n.t('trees.goodAfternoon');
    return this.i18n.t('trees.goodEvening');
  }

  getUserFirstName(): string {
    const user = this.authService.getCurrentUser();
    return user?.firstName || user?.email?.split('@')[0] || '';
  }

  // Town dropdown
  toggleTownDropdown() {
    this.showTownDropdown.update(v => !v);
  }

  selectTown(town: TownListItem) {
    this.selectedTownId = town.id;
    this.showTownDropdown.set(false);
    this.selectedFamilyId.set(null);
    this.selectedFamilyDetails.set(null);
    this.loadFamiliesForTown(town.id);
  }

  getSelectedTownDisplayName(): string | null {
    if (!this.selectedTownId) return null;
    const town = this.availableTowns().find(t => t.id === this.selectedTownId);
    if (!town) return null;
    return this.getLocalizedTownName(town);
  }

  // Load families for selected town
  loadFamiliesForTown(townId: string) {
    this.loadingFamilies.set(true);
    this.familyService.getFamiliesByTown(townId).subscribe({
      next: (families) => {
        this.families.set(families);
        this.loadingFamilies.set(false);
      },
      error: () => {
        this.families.set([]);
        this.loadingFamilies.set(false);
      }
    });
  }

  // Family selection
  selectFamily(familyId: string) {
    this.selectedFamilyId.set(familyId);
    this.loadFamilyMembers(familyId);
  }

  clearFamilySelection() {
    this.selectedFamilyId.set(null);
    this.selectedFamilyDetails.set(null);
  }

  getSelectedFamilyDisplayName(): string {
    const familyId = this.selectedFamilyId();
    if (!familyId) return '';
    const family = this.families().find(f => f.id === familyId);
    if (!family) return '';
    return this.getLocalizedFamilyName(family);
  }

  loadFamilyMembers(familyId: string) {
    this.loadingMembers.set(true);
    this.familyService.getFamilyWithMembers(familyId).subscribe({
      next: (family) => {
        this.selectedFamilyDetails.set(family);
        this.loadingMembers.set(false);
      },
      error: () => {
        this.selectedFamilyDetails.set(null);
        this.loadingMembers.set(false);
      }
    });
  }

  getLocalizedFamilyName(family: FamilyListItem): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return family.nameAr || family.name;
      case 'nob':
        return family.nameLocal || family.name;
      case 'en':
      default:
        return family.nameEn || family.name;
    }
  }

  formatYear(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return dateStr.split('-')[0] || '';
    }
  }

  loadTrees() {
    this.loading.set(true);
    this.error.set(null);

    this.treeService.getMyTrees().subscribe({
      next: (trees) => {
        this.trees.set(trees);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('error.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  createTree() {
    // HIERARCHY ENFORCEMENT: Both name and townId are required
    if (!this.newTree.name.trim()) return;
    if (!this.newTree.townId) {
      this.createError.set(this.i18n.t('trees.townRequired'));
      return;
    }

    this.creating.set(true);
    this.createError.set(null);

    this.treeService.createTree(this.newTree).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.newTree = { name: '', townId: '', description: '', isPublic: false, allowCrossTreeLinking: true };

        this.authService.refreshToken().subscribe({
          next: () => {
            this.loadTrees();
            this.creating.set(false);
          },
          error: () => {
            this.loadTrees();
            this.creating.set(false);
          }
        });
      },
      error: (err) => {
        this.createError.set(err.error?.message || this.i18n.t('error.createFailed'));
        this.creating.set(false);
      }
    });
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedTownId = null;
  }

  getRoleLabel(role: OrgRole | null): string {
    if (role === null) return '';
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

  canManage(role: OrgRole | null): boolean {
    if (role === null) return false;
    return role >= OrgRole.Admin;
  }

  onImportComplete(): void {
    this.showImportModal = false;
    this.authService.refreshToken().subscribe({
      next: () => this.loadTrees(),
      error: () => this.loadTrees()
    });
  }
}
