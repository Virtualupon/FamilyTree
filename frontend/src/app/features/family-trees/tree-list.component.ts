import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { TownService } from '../../core/services/town.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyTreeListItem, CreateFamilyTreeRequest } from '../../core/models/family-tree.models';
import { TownListItem } from '../../core/models/town.models';
import { OrgRole, OrgRoleLabels } from '../../core/models/auth.models';
import { GedcomImportDialogComponent } from './gedcom-import-dialog.component';

@Component({
  selector: 'app-tree-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslatePipe, GedcomImportDialogComponent],
  template: `
    <div class="tree-list-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <div class="header-title">
            <h1>{{ 'trees.title' | translate }}</h1>
            <p class="subtitle">{{ 'trees.subtitle' | translate }}</p>
          </div>
          <div class="header-actions">
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
              {{ 'trees.create' | translate }}
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="filters">
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
                <label class="form-label">{{ 'trees.town' | translate }}</label>
                <select [(ngModel)]="newTree.townId" name="townId" class="form-input">
                  <option [ngValue]="undefined">{{ 'trees.noTown' | translate }}</option>
                  @for (town of towns(); track town.id) {
                    <option [ngValue]="town.id">{{ getLocalizedTownName(town) }}{{ town.country ? ' (' + town.country + ')' : '' }}</option>
                  }
                </select>
                <p class="form-hint">{{ 'trees.townHint' | translate }}</p>
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
  trees = signal<FamilyTreeListItem[]>([]);
  towns = signal<TownListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  searchQuery = '';
  selectedTownId: string | null = null;

  showCreateModal = false;
  showImportModal = false;
  creating = signal(false);
  createError = signal<string | null>(null);

  newTree: CreateFamilyTreeRequest = {
    name: '',
    description: '',
    isPublic: false,
    allowCrossTreeLinking: true,
    townId: undefined
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

    // Town filter would go here when FamilyTreeListItem has townId

    return result;
  });

  constructor(
    private treeService: FamilyTreeService,
    private townService: TownService,
    private authService: AuthService,
    private i18n: I18nService
  ) {}

  ngOnInit() {
    this.loadTrees();
    this.loadTowns();
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
    if (!this.newTree.name.trim()) return;

    this.creating.set(true);
    this.createError.set(null);

    this.treeService.createTree(this.newTree).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.newTree = { name: '', description: '', isPublic: false, allowCrossTreeLinking: true, townId: undefined };

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
