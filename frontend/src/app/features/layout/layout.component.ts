import { Component, computed, signal, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatRippleModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';

import { AuthService } from '../../core/services/auth.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { NetworkService } from '../../core/services/network.service';
import { UpdateService } from '../../core/services/update.service';
import { I18nService, TranslatePipe, Language, LanguageConfig } from '../../core/i18n';
import { HelpDialogService } from '../../shared/components/help-dialog/help-dialog.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SubmitTicketDialogComponent } from '../support/submit-ticket-dialog.component';

interface NavItem {
  icon: string;
  labelKey: string;  // Translation key for i18n
  route: string;
  roles?: string[]; // If specified, only show for these system roles
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatRippleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatDialogModule,
    TranslatePipe
  ],
  template: `
    <div class="layout" [class.layout--rtl]="i18n.isRtl()">
      <!-- Top App Bar -->
      <header class="layout__header">
        <div class="layout__header-content">
          <!-- Mobile Menu Button -->
          <button
            mat-icon-button
            class="layout__menu-btn d-desktop-none"
            (click)="toggleMobileMenu()">
            <i class="fa-solid" [class.fa-xmark]="mobileMenuOpen()" [class.fa-bars]="!mobileMenuOpen()" aria-hidden="true"></i>
          </button>

          <!-- Logo -->
          <a routerLink="/dashboard" class="layout__logo">
            <i class="fa-solid fa-people-roof layout__logo-icon" aria-hidden="true"></i>
            <span class="layout__logo-text d-mobile-none">{{ 'app.title' | translate }}</span>
          </a>

          <!-- Offline Indicator -->
          @if (networkService.isOffline()) {
            <div class="layout__offline-indicator" [matTooltip]="'You are offline'">
              <i class="fa-solid fa-wifi" aria-hidden="true"></i>
              <span class="d-mobile-none">Offline</span>
            </div>
          }

          <!-- Town Selector (for Admin/SuperAdmin with assigned towns) -->
          @if (treeContext.showTownSelector()) {
            <div class="layout__tree-selector d-mobile-none">
              <button
                mat-button
                [matMenuTriggerFor]="townMenu"
                class="layout__tree-btn">
                <i class="fa-solid fa-city" aria-hidden="true"></i>
                <span class="layout__tree-name">
                  {{ getSelectedTownName() || ('nav.selectTown' | translate) }}
                </span>
                <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
              </button>
              <mat-menu #townMenu="matMenu" class="layout__tree-menu">
                @if (treeContext.loadingTowns()) {
                  <div class="layout__tree-loading">
                    <span>{{ 'common.loading' | translate }}</span>
                  </div>
                } @else if (treeContext.assignedTowns().length === 0) {
                  <div class="layout__tree-empty">
                    <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                    <span>{{ 'nav.noTownsAssigned' | translate }}</span>
                  </div>
                } @else {
                  @for (town of treeContext.assignedTowns(); track town.id) {
                    <button
                      mat-menu-item
                      (click)="selectTown(town.id)"
                      [class.layout__tree-item--active]="treeContext.selectedTownId() === town.id">
                      <i class="fa-solid fa-city" aria-hidden="true"></i>
                      <div class="layout__tree-item-content">
                        <span class="layout__tree-item-name">{{ getLocalizedTownName(town) }}</span>
                        <span class="layout__tree-item-meta">
                          {{ town.treeCount }} {{ 'nav.trees' | translate }}
                        </span>
                      </div>
                      @if (treeContext.selectedTownId() === town.id) {
                        <i class="fa-solid fa-check layout__tree-item-check" aria-hidden="true"></i>
                      }
                    </button>
                  }
                }
              </mat-menu>
            </div>
          }

          <!-- Tree Selector (shown after town is selected) -->
          @if (treeContext.showTreeSelector() && treeContext.selectedTownId()) {
            <div class="layout__tree-selector d-mobile-none">
              <button
                mat-button
                [matMenuTriggerFor]="treeMenu"
                class="layout__tree-btn">
                <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                <span class="layout__tree-name">
                  {{ treeContext.selectedTree()?.name || ('nav.selectTree' | translate) }}
                </span>
                <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
              </button>
              <mat-menu #treeMenu="matMenu" class="layout__tree-menu">
                @if (treeContext.loading()) {
                  <div class="layout__tree-loading">
                    <span>{{ 'common.loading' | translate }}</span>
                  </div>
                } @else if (treeContext.availableTrees().length === 0) {
                  <div class="layout__tree-empty">
                    <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                    <span>{{ 'nav.noTrees' | translate }}</span>
                  </div>
                } @else {
                  @for (tree of treeContext.availableTrees(); track tree.id) {
                    <button
                      mat-menu-item
                      (click)="selectTree(tree.id)"
                      [class.layout__tree-item--active]="treeContext.selectedTreeId() === tree.id">
                      <i class="fa-solid" [class.fa-tree]="tree.userRole !== null" [class.fa-user-shield]="tree.userRole === null" aria-hidden="true"></i>
                      <div class="layout__tree-item-content">
                        <span class="layout__tree-item-name">{{ tree.name }}</span>
                        <span class="layout__tree-item-meta">
                          {{ tree.personCount }} {{ 'nav.people' | translate }}
                          @if (tree.userRole === null) {
                            <span class="layout__tree-item-badge">{{ 'nav.assigned' | translate }}</span>
                          }
                        </span>
                      </div>
                      @if (treeContext.selectedTreeId() === tree.id) {
                        <i class="fa-solid fa-check layout__tree-item-check" aria-hidden="true"></i>
                      }
                    </button>
                  }
                }
              </mat-menu>
            </div>
          }

          <!-- Desktop Navigation -->
          <nav class="layout__nav d-mobile-none">
            @for (item of visibleNavItems(); track item.route) {
              <a
                class="layout__nav-item"
                [routerLink]="item.route"
                routerLinkActive="layout__nav-item--active">
                <i class="fa-solid" [ngClass]="getFaIconClass(item.icon)" aria-hidden="true"></i>
                <span>{{ item.labelKey | translate }}</span>
              </a>
            }

            <!-- More Menu (overflow items) -->
            @if (visibleOverflowItems().length > 0) {
              <button
                class="layout__nav-item layout__nav-more"
                [matMenuTriggerFor]="moreNavMenu">
                <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
                <span>{{ 'nav.more' | translate }}</span>
              </button>
              <mat-menu #moreNavMenu="matMenu" class="layout__more-menu">
                @for (item of visibleOverflowItems(); track item.route) {
                  <a mat-menu-item [routerLink]="item.route"
                     routerLinkActive="layout__more-item--active">
                    <i class="fa-solid" [ngClass]="getFaIconClass(item.icon)" aria-hidden="true"></i>
                    <span>{{ item.labelKey | translate }}</span>
                  </a>
                }
              </mat-menu>
            }
          </nav>

          <!-- Actions -->
          <div class="layout__actions">
            <!-- Report Issue Button -->
            <button
              mat-icon-button
              (click)="openReportIssue()"
              [matTooltip]="'support.reportIssue' | translate"
              class="layout__report-btn">
              <i class="fa-solid fa-bug" aria-hidden="true"></i>
            </button>

            <!-- Help Button -->
            <button
              mat-icon-button
              (click)="openHelp()"
              [matTooltip]="'HELP.BUTTON_TOOLTIP' | translate"
              class="layout__help-btn">
              <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
            </button>

            <!-- Language Selector -->
            <button
              mat-icon-button
              [matMenuTriggerFor]="langMenu"
              [matTooltip]="'Language'">
              <img class="layout__lang-flag" [src]="'assets/flags/' + getCurrentLangFlag() + '.svg'" alt="Language">
            </button>
            <mat-menu #langMenu="matMenu" class="layout__lang-menu">
              @for (lang of i18n.supportedLanguages; track lang.code) {
                <button
                  mat-menu-item
                  (click)="setLanguage(lang.code)"
                  [class.layout__lang-item--active]="i18n.currentLang() === lang.code">
                  <img class="layout__lang-flag" [src]="'assets/flags/' + lang.flag + '.svg'" [alt]="lang.name">
                  <span>{{ lang.nativeName }}</span>
                  @if (i18n.currentLang() === lang.code) {
                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                  }
                </button>
              }
            </mat-menu>
            
            <!-- User Menu -->
            <button mat-icon-button [matMenuTriggerFor]="userMenu">
              <div class="layout__user-avatar">
                {{ getUserInitials() }}
              </div>
            </button>
            <mat-menu #userMenu="matMenu">
              <div class="layout__user-info">
                <div class="layout__user-avatar layout__user-avatar--large">
                  {{ getUserInitials() }}
                </div>
                <div class="layout__user-details">
                  <span class="layout__user-name">
                    {{ currentUser()?.firstName }} {{ currentUser()?.lastName }}
                  </span>
                  <span class="layout__user-email">{{ currentUser()?.email }}</span>
                  @if (currentUser()?.systemRole) {
                    <span class="layout__user-role">{{ currentUser()?.systemRole }}</span>
                  }
                </div>
              </div>
              <mat-divider></mat-divider>
              <button mat-menu-item routerLink="/settings">
                <i class="fa-solid fa-gear" aria-hidden="true"></i>
                <span>{{ 'nav.settings' | translate }}</span>
              </button>
              <button mat-menu-item (click)="logout()">
                <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
                <span>{{ 'nav.logout' | translate }}</span>
              </button>
            </mat-menu>
          </div>
        </div>
      </header>
      
      <!-- Mobile Slide Menu -->
      @if (mobileMenuOpen()) {
        <div class="layout__mobile-backdrop" (click)="closeMobileMenu()"></div>
        <aside class="layout__mobile-menu">
          <div class="layout__mobile-menu-header">
            <div class="layout__user-avatar layout__user-avatar--large">
              {{ getUserInitials() }}
            </div>
            <div class="layout__user-details">
              <span class="layout__user-name">
                {{ currentUser()?.firstName }} {{ currentUser()?.lastName }}
              </span>
              <span class="layout__user-email">{{ currentUser()?.email }}</span>
              @if (currentUser()?.systemRole) {
                <span class="layout__user-role">{{ currentUser()?.systemRole }}</span>
              }
            </div>
          </div>
          
          <!-- Mobile Tree Selector -->
          @if (treeContext.showTreeSelector()) {
            <div class="layout__mobile-tree-selector">
              <span class="layout__mobile-tree-label">Working on Tree</span>
              <div class="layout__mobile-tree-list">
                @for (tree of treeContext.availableTrees(); track tree.id) {
                  <button
                    class="layout__mobile-tree-item"
                    [class.layout__mobile-tree-item--active]="treeContext.selectedTreeId() === tree.id"
                    (click)="selectTree(tree.id)">
                    <i class="fa-solid" [class.fa-tree]="tree.userRole !== null" [class.fa-user-shield]="tree.userRole === null" aria-hidden="true"></i>
                    <span>{{ tree.name }}</span>
                    @if (treeContext.selectedTreeId() === tree.id) {
                      <i class="fa-solid fa-check layout__mobile-tree-check" aria-hidden="true"></i>
                    }
                  </button>
                }
              </div>
            </div>
            <mat-divider></mat-divider>
          }

          <nav class="layout__mobile-nav">
            @for (item of allVisibleNavItems(); track item.route) {
              <a
                class="layout__mobile-nav-item"
                [routerLink]="item.route"
                routerLinkActive="layout__mobile-nav-item--active"
                matRipple
                (click)="closeMobileMenu()">
                <i class="fa-solid" [ngClass]="getFaIconClass(item.icon)" aria-hidden="true"></i>
                <span>{{ item.labelKey | translate }}</span>
              </a>
            }
          </nav>
          
          <div class="layout__mobile-menu-footer">
            <mat-divider></mat-divider>
            
            <!-- Language Selection in Mobile -->
            <div class="layout__mobile-lang">
              <span class="layout__mobile-lang-label">Language</span>
              <div class="layout__mobile-lang-options">
                @for (lang of i18n.supportedLanguages; track lang.code) {
                  <button 
                    class="layout__mobile-lang-btn"
                    [class.layout__mobile-lang-btn--active]="i18n.currentLang() === lang.code"
                    (click)="setLanguage(lang.code)">
                    <img class="layout__lang-flag" [src]="'assets/flags/' + lang.flag + '.svg'" [alt]="lang.name">
                    <span>{{ lang.code.toUpperCase() }}</span>
                  </button>
                }
              </div>
            </div>
            
            <button
              class="layout__mobile-nav-item layout__mobile-nav-item--logout"
              matRipple
              (click)="logout()">
              <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
              <span>{{ 'nav.logout' | translate }}</span>
            </button>
          </div>
        </aside>
      }
      
      <!-- Main Content -->
      <main class="layout__main">
        <router-outlet></router-outlet>
      </main>
      
      <!-- Floating Help Button (Mobile) -->
      <button
        class="layout__help-fab d-desktop-none"
        (click)="openHelp()"
        [attr.aria-label]="'HELP.BUTTON_TOOLTIP' | translate"
        matRipple>
        <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
      </button>

      <!-- Mobile Bottom Navigation -->
      <nav class="layout__bottom-nav d-desktop-none">
        @for (item of bottomNavItems(); track item.route) {
          <a
            class="layout__bottom-nav-item"
            [routerLink]="item.route"
            routerLinkActive="layout__bottom-nav-item--active"
            matRipple>
            <i class="fa-solid" [ngClass]="getFaIconClass(item.icon)" aria-hidden="true"></i>
            <span>{{ item.labelKey | translate }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: [`
    // Nubian Theme Colors (from _nubian-variables.scss)
    // $nubian-teal: #187573, $nubian-gold: #C17E3E, $nubian-beige: #F4E4D7
    // $warm-white: #FAF7F1, $nubian-cream: #FFF9F5, $nubian-charcoal: #2D2D2D

    .layout {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;
      background: #FAF7F1; // $warm-white

      &--rtl {
        direction: rtl;
      }

      &__header {
        position: sticky;
        top: 0;
        z-index: var(--ft-z-sticky);
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 249, 245, 0.95) 100%);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid #F4E4D7; // $nubian-beige
        box-shadow: 0 2px 8px rgba(45, 45, 45, 0.06);
      }
      
      &__header-content {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-sm) var(--ft-spacing-md);
        max-width: 1400px;
        margin: 0 auto;
        height: 56px;
        
        @media (min-width: 768px) {
          padding: var(--ft-spacing-sm) var(--ft-spacing-lg);
          height: 64px;
        }
      }
      
      &__logo {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        text-decoration: none;
        color: #187573; // $nubian-teal
        font-weight: 700;
        font-size: 1.125rem;
        font-family: 'Cinzel', serif;
      }

      &__logo-icon {
        font-size: 1.75rem;
        color: #C17E3E; // $nubian-gold
      }

      // Offline Indicator
      &__offline-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%);
        border: 1px solid #E85D35; // Nubian orange
        border-radius: 20px;
        color: #E85D35;
        font-size: 0.75rem;
        font-weight: 600;
        margin-inline-start: var(--ft-spacing-sm);
        animation: pulse 2s ease-in-out infinite;

        i.fa-solid {
          font-size: 0.875rem;
        }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      // Tree Selector
      &__tree-selector {
        margin-inline-start: var(--ft-spacing-xs);
        flex-shrink: 0;

        @media (min-width: 1200px) {
          margin-inline-start: var(--ft-spacing-md);
        }
      }

      &__tree-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: var(--ft-radius-md);
        background: var(--ft-surface-variant);
        border: 1px solid var(--ft-border);
        min-width: 100px;
        max-width: 140px;

        @media (min-width: 1200px) {
          gap: var(--ft-spacing-xs);
          padding: var(--ft-spacing-xs) var(--ft-spacing-sm);
          min-width: 160px;
          max-width: 240px;
        }

        i.fa-solid:first-child {
          color: var(--ft-primary);
          font-size: 1rem;

          @media (min-width: 1200px) {
            font-size: 1.125rem;
          }
        }

        i.fa-caret-down {
          font-size: 0.75rem;
        }
      }

      &__tree-name {
        flex: 1;
        text-align: start;
        font-size: 0.75rem;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        @media (min-width: 1200px) {
          font-size: 0.875rem;
        }
      }

      &__tree-loading,
      &__tree-empty {
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
        color: var(--ft-on-surface-variant);
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);

        i.fa-solid {
          font-size: 1.125rem;
        }
      }

      &__tree-item--active {
        background: rgba(24, 117, 115, 0.1); // $nubian-teal
      }

      &__tree-item-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        flex: 1;
        min-width: 0;
      }

      &__tree-item-name {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 200px;
      }

      &__tree-item-meta {
        font-size: 0.75rem;
        color: var(--ft-on-surface-variant);
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
      }

      &__tree-item-badge {
        background: var(--ft-primary);
        color: white;
        padding: 1px 6px;
        border-radius: var(--ft-radius-sm);
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
      }

      &__tree-item-check {
        color: var(--ft-primary);
        margin-inline-start: auto;
      }

      // Mobile tree selector
      &__mobile-tree-selector {
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
      }

      &__mobile-tree-label {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--ft-on-surface-variant);
        margin-bottom: var(--ft-spacing-sm);
        font-weight: 500;
      }

      &__mobile-tree-list {
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-xs);
      }

      &__mobile-tree-item {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-sm) var(--ft-spacing-md);
        background: var(--ft-surface-variant);
        border: 2px solid transparent;
        border-radius: var(--ft-radius-md);
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all var(--ft-transition-fast);
        text-align: start;
        width: 100%;

        i.fa-solid {
          color: var(--ft-on-surface-variant);
          font-size: 1.125rem;
          width: 20px;
          text-align: center;
        }

        span {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        &:hover {
          background: var(--ft-border);
        }

        &--active {
          border-color: #187573; // $nubian-teal
          background: rgba(24, 117, 115, 0.1); // $nubian-teal

          i.fa-solid {
            color: #187573; // $nubian-teal
          }
        }
      }

      &__mobile-tree-check {
        color: #187573; // $nubian-teal
      }

      &__nav {
        display: flex;
        align-items: center;
        gap: 1px;
        margin-inline-start: var(--ft-spacing-xs);
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none; // Firefox
        -ms-overflow-style: none; // IE/Edge

        &::-webkit-scrollbar {
          display: none; // Chrome/Safari
        }

        @media (min-width: 1400px) {
          gap: var(--ft-spacing-xs);
          margin-inline-start: var(--ft-spacing-lg);
        }
      }

      &__nav-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        border-radius: var(--ft-radius-full);
        text-decoration: none;
        color: var(--ft-on-surface-variant);
        font-weight: 500;
        font-size: 0.75rem;
        transition: all var(--ft-transition-fast);
        white-space: nowrap;
        flex-shrink: 0;

        i.fa-solid {
          font-size: 0.875rem;
          width: 16px;
          text-align: center;
        }

        @media (min-width: 1400px) {
          padding: var(--ft-spacing-sm) var(--ft-spacing-md);
          font-size: 0.875rem;
          gap: var(--ft-spacing-xs);

          i.fa-solid {
            font-size: 1.125rem;
            width: 20px;
          }
        }

        &:hover {
          background: var(--ft-surface-variant);
          color: var(--ft-on-surface);
        }

        &--active {
          background: rgba(24, 117, 115, 0.1); // $nubian-teal
          color: #187573; // $nubian-teal
        }
      }

      // "More" overflow button
      &__nav-more {
        cursor: pointer;
        border: none;
        background: none;
        font-family: inherit;
      }

      &__actions {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        flex-shrink: 0;
        margin-inline-start: var(--ft-spacing-sm);
      }

      &__help-btn {
        color: #187573; // $nubian-teal

        &:hover {
          background: rgba(24, 117, 115, 0.1);
        }

        i.fa-solid {
          font-size: 1.25rem;
        }
      }

      &__lang-flag {
        width: 24px;
        height: 16px;
        object-fit: cover;
        border-radius: 2px;
        vertical-align: middle;
      }
      
      &__lang-item--active {
        background: rgba(24, 117, 115, 0.1); // $nubian-teal

        i.fa-solid {
          color: #187573; // $nubian-teal
          margin-inline-start: auto;
        }
      }

      &__user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: linear-gradient(135deg, #187573 0%, #2B9A97 100%); // $nubian-teal gradient
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 600;
        
        &--large {
          width: 48px;
          height: 48px;
          font-size: 1rem;
        }
      }
      
      &__user-info {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-md);
        padding: var(--ft-spacing-md);
      }
      
      &__user-details {
        display: flex;
        flex-direction: column;
      }
      
      &__user-name {
        font-weight: 600;
        color: var(--ft-on-surface);
      }
      
      &__user-email {
        font-size: 0.813rem;
        color: var(--ft-on-surface-variant);
      }
      
      &__user-role {
        font-size: 0.688rem;
        color: #C17E3E; // $nubian-gold
        font-weight: 500;
        text-transform: uppercase;
        margin-top: 2px;
      }
      
      &__main {
        flex: 1;
        padding: var(--ft-spacing-md);
        padding-bottom: calc(var(--ft-spacing-md) + 64px); // Space for bottom nav
        
        @media (min-width: 768px) {
          padding: var(--ft-spacing-lg);
          padding-bottom: var(--ft-spacing-lg);
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }
      }
      
      // Mobile Menu
      &__mobile-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: var(--ft-z-modal-backdrop);
        animation: fadeIn 0.2s ease-out;
      }
      
      &__mobile-menu {
        position: fixed;
        top: 0;
        bottom: 0;
        inset-inline-start: 0;
        width: 280px;
        max-width: 85vw;
        background: var(--ft-surface);
        z-index: var(--ft-z-modal);
        display: flex;
        flex-direction: column;
        animation: slideInStart 0.25s ease-out;
        box-shadow: var(--ft-shadow-xl);
      }
      
      &__mobile-menu-header {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-md);
        padding: var(--ft-spacing-lg);
        background: linear-gradient(135deg, #187573 0%, #0D5654 100%); // $nubian-teal gradient
        color: white;
        
        .layout__user-avatar--large {
          background: rgba(255, 255, 255, 0.2);
        }
        
        .layout__user-name,
        .layout__user-email,
        .layout__user-role {
          color: white;
        }
        
        .layout__user-email {
          opacity: 0.8;
        }
        
        .layout__user-role {
          opacity: 0.9;
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 8px;
          border-radius: 4px;
          margin-top: 4px;
          display: inline-block;
        }
      }
      
      &__mobile-nav {
        flex: 1;
        overflow-y: auto;
        padding: var(--ft-spacing-sm) 0;
      }
      
      &__mobile-nav-item {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-md);
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
        text-decoration: none;
        color: var(--ft-on-surface);
        font-weight: 500;
        transition: background var(--ft-transition-fast);

        i.fa-solid {
          color: var(--ft-on-surface-variant);
          font-size: 1.25rem;
          width: 24px;
          text-align: center;
        }

        &:hover {
          background: var(--ft-surface-variant);
        }

        &--active {
          background: rgba(24, 117, 115, 0.1); // $nubian-teal
          color: #187573; // $nubian-teal

          i.fa-solid {
            color: #187573; // $nubian-teal
          }
        }

        &--logout {
          color: var(--ft-error);
          border: none;
          background: none;
          width: 100%;
          cursor: pointer;
          font-size: 1rem;

          i.fa-solid {
            color: var(--ft-error);
          }
        }
      }
      
      &__mobile-menu-footer {
        padding: var(--ft-spacing-md) 0;
      }
      
      &__mobile-lang {
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
      }
      
      &__mobile-lang-label {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--ft-on-surface-variant);
        margin-bottom: var(--ft-spacing-sm);
        font-weight: 500;
      }
      
      &__mobile-lang-options {
        display: flex;
        gap: var(--ft-spacing-sm);
      }
      
      &__mobile-lang-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: var(--ft-spacing-sm) var(--ft-spacing-md);
        background: var(--ft-surface-variant);
        border: 2px solid transparent;
        border-radius: var(--ft-radius-md);
        cursor: pointer;
        transition: all var(--ft-transition-fast);
        font-size: 0.75rem;
        font-weight: 500;
        
        &:hover {
          background: var(--ft-border);
        }
        
        &--active {
          border-color: #187573; // $nubian-teal
          background: rgba(24, 117, 115, 0.1); // $nubian-teal
          color: #187573; // $nubian-teal
        }
      }

      // Floating Help Button (Mobile FAB)
      &__help-fab {
        position: fixed;
        bottom: calc(64px + env(safe-area-inset-bottom, 0) + 16px); // Above bottom nav
        inset-inline-end: 16px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(135deg, #187573 0%, #0D5654 100%); // $nubian-teal gradient
        color: white;
        box-shadow: 0 4px 12px rgba(24, 117, 115, 0.4),
                    0 2px 4px rgba(0, 0, 0, 0.1);
        cursor: pointer;
        z-index: var(--ft-z-fixed);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;

        i.fa-solid {
          font-size: 1.5rem;
        }

        &:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(24, 117, 115, 0.5),
                      0 3px 6px rgba(0, 0, 0, 0.15);
        }

        &:active {
          transform: scale(0.95);
        }

        // Pulse animation on initial load
        animation: helpFabPulse 2s ease-in-out 1;
      }

      @keyframes helpFabPulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
      }

      // Bottom Navigation
      &__bottom-nav {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        background: var(--ft-surface);
        border-top: 1px solid var(--ft-border);
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
        z-index: var(--ft-z-fixed);
        padding-bottom: env(safe-area-inset-bottom, 0);
      }
      
      &__bottom-nav-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: var(--ft-spacing-sm) var(--ft-spacing-xs);
        min-height: 56px;
        text-decoration: none;
        color: var(--ft-on-surface-variant);
        font-size: 0.625rem;
        font-weight: 500;
        transition: color var(--ft-transition-fast);

        i.fa-solid {
          font-size: 1.375rem;
        }

        &--active {
          color: #187573; // $nubian-teal
        }
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideInStart {
      from { transform: translateX(-100%); }
      to { transform: translateX(0); }
    }
    
    @keyframes slideInEnd {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    
    // RTL slide animation - applied via class
    :host-context([dir="rtl"]) .layout__mobile-menu {
      animation-name: slideInEnd;
    }
  `]
})
export class LayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);
  readonly treeContext = inject(TreeContextService);
  readonly networkService = inject(NetworkService);
  private readonly updateService = inject(UpdateService); // Initialized to check for updates
  private readonly helpDialogService = inject(HelpDialogService);
  private readonly dialog = inject(MatDialog);

  mobileMenuOpen = signal(false);
  currentUser = computed(() => this.authService.getCurrentUser());
  
  // Primary nav items — always shown in the top bar
  private primaryNavItems: NavItem[] = [
    { icon: 'dashboard', labelKey: 'nav.dashboard', route: '/dashboard' },
    { icon: 'forest', labelKey: 'nav.myTrees', route: '/trees' },
    { icon: 'people', labelKey: 'nav.people', route: '/people' },
    { icon: 'admin_panel_settings', labelKey: 'nav.admin', route: '/admin', roles: ['Developer', 'SuperAdmin'] }
  ];

  // Overflow nav items — shown inside the "More" dropdown menu
  private overflowNavItems: NavItem[] = [
    { icon: 'location_city', labelKey: 'nav.towns', route: '/towns', roles: ['Developer', 'SuperAdmin', 'Admin'] },
    { icon: 'account_tree', labelKey: 'nav.familyTree', route: '/tree' },
    { icon: 'photo_library', labelKey: 'nav.media', route: '/media' },
    { icon: 'support_agent', labelKey: 'nav.support', route: '/support' }
  ];

  // All nav items combined (for mobile side menu)
  private get allNavItems(): NavItem[] {
    return [...this.primaryNavItems, ...this.overflowNavItems];
  }

  // Filter by role
  private filterByRole(items: NavItem[]): NavItem[] {
    const user = this.currentUser();
    return items.filter(item => {
      if (!item.roles) return true;
      if (!user?.systemRole) return false;
      return item.roles.includes(user.systemRole);
    });
  }

  // Primary items visible in top bar
  visibleNavItems = computed(() => this.filterByRole(this.primaryNavItems));

  // Overflow items visible in "More" menu
  visibleOverflowItems = computed(() => this.filterByRole(this.overflowNavItems));

  // All visible items (for mobile side menu)
  allVisibleNavItems = computed(() => this.filterByRole(this.allNavItems));

  // Bottom nav shows first 4 visible items (for mobile)
  bottomNavItems = computed(() => {
    return this.allVisibleNavItems().slice(0, 4);
  });
  
  ngOnInit(): void {
    // Close mobile menu on navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.closeMobileMenu();
    });
  }
  
  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 768) {
      this.closeMobileMenu();
    }
  }
  
  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
    // Prevent body scroll when menu is open
    document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
  }
  
  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
    document.body.style.overflow = '';
  }
  
  getCurrentLangFlag(): string {
    const lang = this.i18n.supportedLanguages.find(l => l.code === this.i18n.currentLang());
    return lang?.flag || 'gb';
  }
  
  setLanguage(lang: Language): void {
    this.i18n.setLanguage(lang);
  }
  
  getUserInitials(): string {
    const user = this.currentUser();
    if (!user) return '?';
    if (user.firstName && user.lastName) {
      return (user.firstName.charAt(0) + user.lastName.charAt(0)).toUpperCase();
    }
    if (user.firstName) {
      return user.firstName.charAt(0).toUpperCase();
    }
    return user.email?.charAt(0).toUpperCase() || '?';
  }
  
  logout(): void {
    this.closeMobileMenu();
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }

  openHelp(): void {
    this.helpDialogService.openHelp();
  }

  openReportIssue(): void {
    this.dialog.open(SubmitTicketDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  selectTree(treeId: string): void {
    this.treeContext.selectTree(treeId);

    // If on a person detail page, navigate back to people list
    // (the person may not exist in the new tree)
    const currentUrl = this.router.url.split('?')[0];
    if (/^\/people\/[^/]+$/.test(currentUrl)) {
      this.router.navigate(['/people']);
    }
  }

  selectTown(townId: string): void {
    const user = this.authService.getCurrentUser();
    const isAdmin = user?.systemRole === 'Developer' || user?.systemRole === 'Admin' || user?.systemRole === 'SuperAdmin';

    // Call API to get new token with selectedTownId claim
    const selectObs = isAdmin
      ? this.authService.selectTownForAdmin(townId)
      : this.authService.selectTownForUser(townId);

    selectObs.subscribe({
      next: () => {
        // Update tree context after token is updated
        this.treeContext.selectTown(townId);
        // Load trees for the selected town
        this.treeContext.loadTreesForTown(townId);
      },
      error: (err) => {
        console.error('Failed to select town:', err);
        // Fallback to just updating context without token
        this.treeContext.selectTown(townId);
        this.treeContext.loadTreesForTown(townId);
      }
    });
  }

  getSelectedTownName(): string | null {
    const town = this.treeContext.assignedTowns().find(
      t => t.id === this.treeContext.selectedTownId()
    );
    if (!town) return null;
    return this.getLocalizedTownName(town);
  }

  getLocalizedTownName(town: { name: string; nameEn?: string | null; nameAr?: string | null; nameLocal?: string | null }): string {
    return this.i18n.getTownName(town);
  }

  /**
   * Maps Material icon names to Font Awesome CSS classes
   */
  getFaIconClass(materialIcon: string): string {
    const iconMap: Record<string, string> = {
      'dashboard': 'fa-gauge-high',
      'location_city': 'fa-city',
      'forest': 'fa-tree',
      'people': 'fa-users',
      'account_tree': 'fa-sitemap',
      'photo_library': 'fa-images',
      'link': 'fa-link',
      'admin_panel_settings': 'fa-user-shield',
      'people_alt': 'fa-people-arrows',
      'settings': 'fa-gear',
      'logout': 'fa-right-from-bracket',
      'menu': 'fa-bars',
      'close': 'fa-xmark',
      'family_restroom': 'fa-people-roof',
      'check': 'fa-check',
      'info': 'fa-circle-info',
      'arrow_drop_down': 'fa-caret-down',
      'person': 'fa-user',
      'person_add': 'fa-user-plus',
      'edit': 'fa-pen-to-square',
      'delete': 'fa-trash',
      'add': 'fa-plus',
      'remove': 'fa-minus',
      'search': 'fa-magnifying-glass',
      'person_search': 'fa-magnifying-glass',
      'visibility': 'fa-eye',
      'visibility_off': 'fa-eye-slash',
      'male': 'fa-mars',
      'female': 'fa-venus',
      'help_outline': 'fa-circle-question',
      'warning': 'fa-triangle-exclamation',
      'error': 'fa-circle-exclamation',
      'cake': 'fa-cake-candles',
      'schedule': 'fa-clock',
      'place': 'fa-location-dot',
      'language': 'fa-globe',
      'translate': 'fa-language',
      'download': 'fa-download',
      'upload': 'fa-upload',
      'cloud_upload': 'fa-cloud-arrow-up',
      'image': 'fa-image',
      'add_photo_alternate': 'fa-image',
      'audiotrack': 'fa-music',
      'videocam': 'fa-video',
      'play_arrow': 'fa-play',
      'more_vert': 'fa-ellipsis-vertical',
      'arrow_upward': 'fa-arrow-up',
      'arrow_downward': 'fa-arrow-down',
      'arrow_forward': 'fa-arrow-right',
      'chevron_right': 'fa-chevron-right',
      'swap_vert': 'fa-arrows-up-down',
      'tune': 'fa-sliders',
      'center_focus_strong': 'fa-crosshairs',
      'fit_screen': 'fa-expand',
      'public': 'fa-globe',
      'lock': 'fa-lock',
      'save': 'fa-floppy-disk',
      'cancel': 'fa-ban',
      'clear': 'fa-xmark',
      'sync_alt': 'fa-rotate',
      'auto_fix_high': 'fa-wand-magic-sparkles',
      'rate_review': 'fa-star-half-stroke',
      'tips_and_updates': 'fa-lightbulb',
      'history': 'fa-clock-rotate-left',
      'link_off': 'fa-link-slash',
      'support_agent': 'fa-headset',
      'confirmation_number': 'fa-ticket',
      'bug_report': 'fa-bug'
    };
    return iconMap[materialIcon] || 'fa-circle';
  }
}