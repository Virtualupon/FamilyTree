import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FamilyService } from '../../core/services/family.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyListItem, Family, CreateFamilyRequest, UpdateFamilyRequest } from '../../core/models/family.models';

@Component({
  selector: 'app-families-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslatePipe
  ],
  template: `
    <div class="families-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <div class="header-title">
            <h1>{{ 'familyGroups.title' | translate }}</h1>
            <p class="subtitle">{{ 'familyGroups.subtitle' | translate }}</p>
          </div>
          <div class="header-actions">
            <button class="btn-primary" (click)="openCreateModal()">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ 'familyGroups.create' | translate }}
            </button>
          </div>
        </div>

        <!-- Search -->
        <div class="filters">
          <div class="search-box">
            <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              [placeholder]="'familyGroups.searchPlaceholder' | translate"
              class="search-input">
          </div>
        </div>
      </div>

      <!-- No Tree Selected -->
      @if (!treeContext.selectedTree()) {
        <div class="empty-state">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <h3>{{ 'familyGroups.selectTreeFirst' | translate }}</h3>
          <p>{{ 'familyGroups.selectTreeHint' | translate }}</p>
        </div>
      }

      <!-- Loading -->
      @if (treeContext.selectedTree() && loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>{{ 'common.loading' | translate }}</p>
        </div>
      }

      <!-- Families Grid -->
      @if (treeContext.selectedTree() && !loading() && filteredFamilies().length > 0) {
        <div class="stats-bar">
          <span>{{ filteredFamilies().length }} {{ 'familyGroups.found' | translate }}</span>
        </div>
        <div class="families-grid">
          @for (family of filteredFamilies(); track family.id) {
            <div class="family-card" (click)="openEditModal(family)">
              <!-- Color Badge -->
              <div class="card-color" [style.background-color]="family.color || '#667eea'"></div>

              <!-- Content -->
              <div class="card-content">
                <div class="card-header">
                  <h3 class="family-name">{{ getLocalizedName(family) }}</h3>
                  <div class="member-count">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <span>{{ family.memberCount }}</span>
                  </div>
                </div>

                <!-- Trilingual Names -->
                @if (hasMultipleNames(family)) {
                  <div class="name-variants">
                    @if (family.nameAr && family.nameAr !== family.name) {
                      <span class="name-variant">
                        <span class="lang-tag">AR</span>
                        {{ family.nameAr }}
                      </span>
                    }
                    @if (family.nameLocal && family.nameLocal !== family.name) {
                      <span class="name-variant">
                        <span class="lang-tag">NOB</span>
                        {{ family.nameLocal }}
                      </span>
                    }
                  </div>
                }

                <div class="card-actions">
                  <button class="btn-icon" (click)="openEditModal(family); $event.stopPropagation()" [matTooltip]="'common.edit' | translate">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button class="btn-icon btn-danger" (click)="confirmDelete(family); $event.stopPropagation()" [matTooltip]="'common.delete' | translate">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @if (treeContext.selectedTree() && !loading() && filteredFamilies().length === 0) {
        <div class="empty-state">
          @if (searchQuery) {
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <h3>{{ 'familyGroups.noResults' | translate }}</h3>
            <p>{{ 'familyGroups.tryDifferentSearch' | translate }}</p>
            <button class="btn-secondary" (click)="searchQuery = ''">{{ 'common.clear' | translate }}</button>
          } @else {
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <h3>{{ 'familyGroups.noFamilies' | translate }}</h3>
            <p>{{ 'familyGroups.createFirst' | translate }}</p>
            <button class="btn-primary" (click)="openCreateModal()">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ 'familyGroups.createFirstButton' | translate }}
            </button>
          }
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showModal) {
        <div class="modal-backdrop" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>{{ editingFamily ? ('familyGroups.editTitle' | translate) : ('familyGroups.createTitle' | translate) }}</h2>
              <button class="modal-close" (click)="closeModal()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form (ngSubmit)="saveFamily()" class="modal-body">
              <!-- Name (Primary) -->
              <div class="form-group">
                <label class="form-label required">{{ 'familyGroups.name' | translate }}</label>
                <input
                  type="text"
                  [(ngModel)]="formData.name"
                  name="name"
                  required
                  class="form-input"
                  [placeholder]="'familyGroups.namePlaceholder' | translate">
              </div>

              <!-- Trilingual Names -->
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">
                    <span class="lang-flag">🇬🇧</span>
                    {{ 'familyGroups.nameEn' | translate }}
                  </label>
                  <input
                    type="text"
                    [(ngModel)]="formData.nameEn"
                    name="nameEn"
                    class="form-input">
                </div>
                <div class="form-group">
                  <label class="form-label">
                    <span class="lang-flag">🇸🇦</span>
                    {{ 'familyGroups.nameAr' | translate }}
                  </label>
                  <input
                    type="text"
                    [(ngModel)]="formData.nameAr"
                    name="nameAr"
                    class="form-input"
                    dir="rtl">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">
                  <span class="lang-flag">🇸🇩</span>
                  {{ 'familyGroups.nameLocal' | translate }}
                </label>
                <input
                  type="text"
                  [(ngModel)]="formData.nameLocal"
                  name="nameLocal"
                  class="form-input">
              </div>

              <!-- Description -->
              <div class="form-group">
                <label class="form-label">{{ 'familyGroups.description' | translate }}</label>
                <textarea
                  [(ngModel)]="formData.description"
                  name="description"
                  rows="3"
                  class="form-input"
                  [placeholder]="'familyGroups.descriptionPlaceholder' | translate"></textarea>
              </div>

              <!-- Color Picker -->
              <div class="form-group">
                <label class="form-label">{{ 'familyGroups.color' | translate }}</label>
                <div class="color-picker">
                  @for (color of colorOptions; track color) {
                    <button
                      type="button"
                      class="color-option"
                      [style.background-color]="color"
                      [class.selected]="formData.color === color"
                      (click)="formData.color = color">
                      @if (formData.color === color) {
                        <svg fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                      }
                    </button>
                  }
                </div>
              </div>

              @if (saveError()) {
                <div class="error-message">{{ saveError() }}</div>
              }

              <div class="modal-actions">
                <button type="button" class="btn-secondary" (click)="closeModal()">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="submit" class="btn-primary" [disabled]="saving()">
                  @if (saving()) {
                    <span class="spinner-sm"></span>
                  }
                  {{ 'common.save' | translate }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (showDeleteModal) {
        <div class="modal-backdrop" (click)="showDeleteModal = false">
          <div class="modal modal-sm" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>{{ 'familyGroups.deleteTitle' | translate }}</h2>
              <button class="modal-close" (click)="showDeleteModal = false">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <p class="delete-warning">
                {{ 'familyGroups.deleteWarning' | translate }} <strong>{{ familyToDelete?.name }}</strong>?
              </p>
              <p class="delete-hint">{{ 'familyGroups.deleteHint' | translate }}</p>

              <div class="modal-actions">
                <button type="button" class="btn-secondary" (click)="showDeleteModal = false">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="button" class="btn-danger" (click)="deleteFamily()" [disabled]="deleting()">
                  @if (deleting()) {
                    <span class="spinner-sm"></span>
                  }
                  {{ 'common.delete' | translate }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .families-page {
      padding: 24px;
      max-width: 1200px;
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

    .stats-bar {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .families-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }

    .family-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: all 0.3s ease;
      cursor: pointer;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
      }
    }

    .card-color {
      height: 8px;
    }

    .card-content {
      padding: 16px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .family-name {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0;
    }

    .member-count {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: #f3f4f6;
      border-radius: 20px;
      font-size: 13px;
      color: #6b7280;

      svg {
        width: 16px;
        height: 16px;
      }
    }

    .name-variants {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .name-variant {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: #6b7280;
    }

    .lang-tag {
      padding: 2px 6px;
      background: #e5e7eb;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      color: #4b5563;
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid #f3f4f6;
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

    .btn-danger {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      border: none;

      &:hover {
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      }
    }

    .btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: #f3f4f6;
      border: none;
      border-radius: 8px;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s;

      svg {
        width: 16px;
        height: 16px;
      }

      &:hover {
        background: #e5e7eb;
        color: #374151;
      }

      &.btn-danger:hover {
        background: #fef2f2;
        color: #dc2626;
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
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);

      &.modal-sm {
        max-width: 400px;
      }
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

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;

      @media (max-width: 480px) {
        grid-template-columns: 1fr;
      }
    }

    .form-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;

      &.required::after {
        content: ' *';
        color: #ef4444;
      }

      .lang-flag {
        font-size: 16px;
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

    .color-picker {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .color-option {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover {
        transform: scale(1.1);
      }

      &.selected {
        border-color: #1a1a2e;
        box-shadow: 0 0 0 2px white, 0 0 0 4px #1a1a2e;
      }

      svg {
        width: 18px;
        height: 18px;
        color: white;
      }
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

    .delete-warning {
      color: #374151;
      margin: 0 0 8px 0;
    }

    .delete-hint {
      color: #6b7280;
      font-size: 13px;
      margin: 0 0 20px 0;
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
      .families-page {
        padding: 16px;
      }

      .header-content {
        flex-direction: column;
        gap: 16px;
      }

      .families-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class FamiliesListComponent implements OnInit {
  private familyService = inject(FamilyService);
  treeContext = inject(TreeContextService);
  private i18n = inject(I18nService);
  private snackBar = inject(MatSnackBar);

  // State
  families = signal<FamilyListItem[]>([]);
  loading = signal(false);
  searchQuery = '';

  // Modal state
  showModal = false;
  showDeleteModal = false;
  editingFamily: FamilyListItem | null = null;
  familyToDelete: FamilyListItem | null = null;
  saving = signal(false);
  deleting = signal(false);
  saveError = signal<string | null>(null);

  // Form data
  formData: CreateFamilyRequest = {
    name: '',
    orgId: '',
    nameEn: '',
    nameAr: '',
    nameLocal: '',
    description: '',
    color: '#667eea'
  };

  // Color options
  colorOptions = [
    '#667eea', '#764ba2', '#3b82f6', '#10b981', '#f59e0b',
    '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
  ];

  // Computed: filtered families
  filteredFamilies = computed(() => {
    let result = this.families();
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.nameEn?.toLowerCase().includes(query) ||
        f.nameAr?.toLowerCase().includes(query) ||
        f.nameLocal?.toLowerCase().includes(query)
      );
    }
    return result;
  });

  ngOnInit(): void {
    // Load families when tree changes
    if (this.treeContext.selectedTree()) {
      this.loadFamilies();
    }

    // Watch for tree selection changes
    this.treeContext.selectedTreeId;
  }

  loadFamilies(): void {
    const tree = this.treeContext.selectedTree();
    if (!tree) return;

    this.loading.set(true);
    this.familyService.getFamiliesByTree(tree.id).subscribe({
      next: (families) => {
        this.families.set(families);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load families:', err);
        this.loading.set(false);
        this.snackBar.open(
          this.i18n.t('messages.loadError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  openCreateModal(): void {
    this.editingFamily = null;
    this.formData = {
      name: '',
      orgId: this.treeContext.selectedTree()?.id || '',
      nameEn: '',
      nameAr: '',
      nameLocal: '',
      description: '',
      color: '#667eea'
    };
    this.saveError.set(null);
    this.showModal = true;
  }

  openEditModal(family: FamilyListItem): void {
    this.editingFamily = family;
    this.formData = {
      name: family.name,
      orgId: this.treeContext.selectedTree()?.id || '',
      nameEn: family.nameEn || '',
      nameAr: family.nameAr || '',
      nameLocal: family.nameLocal || '',
      description: '',
      color: family.color || '#667eea'
    };
    this.saveError.set(null);
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingFamily = null;
  }

  saveFamily(): void {
    if (!this.formData.name.trim()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const request = {
      ...this.formData,
      orgId: this.treeContext.selectedTree()?.id || ''
    };

    const operation = this.editingFamily
      ? this.familyService.updateFamily(this.editingFamily.id, request as UpdateFamilyRequest)
      : this.familyService.createFamily(request);

    operation.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadFamilies();
        this.snackBar.open(
          this.editingFamily
            ? this.i18n.t('messages.updateSuccess')
            : this.i18n.t('messages.createSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err.error?.message || this.i18n.t('messages.saveError'));
      }
    });
  }

  confirmDelete(family: FamilyListItem): void {
    this.familyToDelete = family;
    this.showDeleteModal = true;
  }

  deleteFamily(): void {
    if (!this.familyToDelete) return;

    this.deleting.set(true);
    this.familyService.deleteFamily(this.familyToDelete.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteModal = false;
        this.familyToDelete = null;
        this.loadFamilies();
        this.snackBar.open(
          this.i18n.t('messages.deleteSuccess'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
      },
      error: (err) => {
        this.deleting.set(false);
        this.snackBar.open(
          err.error?.message || this.i18n.t('messages.deleteError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }

  getLocalizedName(family: FamilyListItem): string {
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

  hasMultipleNames(family: FamilyListItem): boolean {
    return !!(family.nameAr || family.nameLocal);
  }
}
