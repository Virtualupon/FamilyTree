import { Component, computed, signal, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatRippleModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';

import { AuthService } from '../../core/services/auth.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe, Language, LanguageConfig } from '../../core/i18n';

interface NavItem {
  icon: string;
  label: string;  // Direct label instead of translation key
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
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatRippleModule,
    MatSelectModule,
    MatFormFieldModule,
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
            <mat-icon>{{ mobileMenuOpen() ? 'close' : 'menu' }}</mat-icon>
          </button>
          
          <!-- Logo -->
          <a routerLink="/dashboard" class="layout__logo">
            <mat-icon class="layout__logo-icon">family_restroom</mat-icon>
            <span class="layout__logo-text d-mobile-none">Family Tree</span>
          </a>

          <!-- Tree Selector (for Admin/SuperAdmin) -->
          @if (treeContext.showTreeSelector()) {
            <div class="layout__tree-selector d-mobile-none">
              <button
                mat-button
                [matMenuTriggerFor]="treeMenu"
                class="layout__tree-btn">
                <mat-icon>account_tree</mat-icon>
                <span class="layout__tree-name">
                  {{ treeContext.selectedTree()?.name || 'Select Tree' }}
                </span>
                <mat-icon>arrow_drop_down</mat-icon>
              </button>
              <mat-menu #treeMenu="matMenu" class="layout__tree-menu">
                @if (treeContext.loading()) {
                  <div class="layout__tree-loading">
                    <span>Loading trees...</span>
                  </div>
                } @else if (treeContext.availableTrees().length === 0) {
                  <div class="layout__tree-empty">
                    <mat-icon>info</mat-icon>
                    <span>No trees available</span>
                  </div>
                } @else {
                  @for (tree of treeContext.availableTrees(); track tree.id) {
                    <button
                      mat-menu-item
                      (click)="selectTree(tree.id)"
                      [class.layout__tree-item--active]="treeContext.selectedTreeId() === tree.id">
                      <mat-icon>{{ tree.userRole !== null ? 'forest' : 'admin_panel_settings' }}</mat-icon>
                      <div class="layout__tree-item-content">
                        <span class="layout__tree-item-name">{{ tree.name }}</span>
                        <span class="layout__tree-item-meta">
                          {{ tree.personCount }} people
                          @if (tree.userRole === null) {
                            <span class="layout__tree-item-badge">Assigned</span>
                          }
                        </span>
                      </div>
                      @if (treeContext.selectedTreeId() === tree.id) {
                        <mat-icon class="layout__tree-item-check">check</mat-icon>
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
                <mat-icon>{{ item.icon }}</mat-icon>
                <span>{{ item.label }}</span>
              </a>
            }
          </nav>
          
          <div class="layout__spacer"></div>
          
          <!-- Actions -->
          <div class="layout__actions">
            <!-- Language Selector -->
            <button 
              mat-icon-button 
              [matMenuTriggerFor]="langMenu"
              [matTooltip]="'Language'">
              <span class="layout__lang-flag">{{ getCurrentLangFlag() }}</span>
            </button>
            <mat-menu #langMenu="matMenu" class="layout__lang-menu">
              @for (lang of i18n.supportedLanguages; track lang.code) {
                <button 
                  mat-menu-item 
                  (click)="setLanguage(lang.code)"
                  [class.layout__lang-item--active]="i18n.currentLang() === lang.code">
                  <span class="layout__lang-flag">{{ lang.flag }}</span>
                  <span>{{ lang.nativeName }}</span>
                  @if (i18n.currentLang() === lang.code) {
                    <mat-icon>check</mat-icon>
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
                <mat-icon>settings</mat-icon>
                <span>{{ 'nav.settings' | translate }}</span>
              </button>
              <button mat-menu-item (click)="logout()">
                <mat-icon>logout</mat-icon>
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
                    <mat-icon>{{ tree.userRole !== null ? 'forest' : 'admin_panel_settings' }}</mat-icon>
                    <span>{{ tree.name }}</span>
                    @if (treeContext.selectedTreeId() === tree.id) {
                      <mat-icon class="layout__mobile-tree-check">check</mat-icon>
                    }
                  </button>
                }
              </div>
            </div>
            <mat-divider></mat-divider>
          }

          <nav class="layout__mobile-nav">
            @for (item of visibleNavItems(); track item.route) {
              <a
                class="layout__mobile-nav-item"
                [routerLink]="item.route"
                routerLinkActive="layout__mobile-nav-item--active"
                matRipple
                (click)="closeMobileMenu()">
                <mat-icon>{{ item.icon }}</mat-icon>
                <span>{{ item.label }}</span>
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
                    <span>{{ lang.flag }}</span>
                    <span>{{ lang.code.toUpperCase() }}</span>
                  </button>
                }
              </div>
            </div>
            
            <button 
              class="layout__mobile-nav-item layout__mobile-nav-item--logout"
              matRipple
              (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>{{ 'nav.logout' | translate }}</span>
            </button>
          </div>
        </aside>
      }
      
      <!-- Main Content -->
      <main class="layout__main">
        <router-outlet></router-outlet>
      </main>
      
      <!-- Mobile Bottom Navigation -->
      <nav class="layout__bottom-nav d-desktop-none">
        @for (item of bottomNavItems(); track item.route) {
          <a 
            class="layout__bottom-nav-item"
            [routerLink]="item.route"
            routerLinkActive="layout__bottom-nav-item--active"
            matRipple>
            <mat-icon>{{ item.icon }}</mat-icon>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: [`
    .layout {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--ft-background);
      
      &--rtl {
        direction: rtl;
      }
      
      &__header {
        position: sticky;
        top: 0;
        z-index: var(--ft-z-sticky);
        background: var(--ft-surface);
        border-bottom: 1px solid var(--ft-border);
        box-shadow: var(--ft-shadow-sm);
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
        color: var(--ft-primary);
        font-weight: 700;
        font-size: 1.125rem;
      }
      
      &__logo-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }

      // Tree Selector
      &__tree-selector {
        margin-inline-start: var(--ft-spacing-md);
      }

      &__tree-btn {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        padding: var(--ft-spacing-xs) var(--ft-spacing-sm);
        border-radius: var(--ft-radius-md);
        background: var(--ft-surface-variant);
        border: 1px solid var(--ft-border);
        min-width: 160px;
        max-width: 240px;

        mat-icon:first-child {
          color: var(--ft-primary);
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }

      &__tree-name {
        flex: 1;
        text-align: start;
        font-size: 0.875rem;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      &__tree-loading,
      &__tree-empty {
        padding: var(--ft-spacing-md) var(--ft-spacing-lg);
        color: var(--ft-on-surface-variant);
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }

      &__tree-item--active {
        background: rgba(25, 118, 210, 0.1);
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

        mat-icon {
          color: var(--ft-on-surface-variant);
          font-size: 20px;
          width: 20px;
          height: 20px;
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
          border-color: var(--ft-primary);
          background: rgba(25, 118, 210, 0.1);

          mat-icon {
            color: var(--ft-primary);
          }
        }
      }

      &__mobile-tree-check {
        color: var(--ft-primary);
      }

      &__nav {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        margin-inline-start: var(--ft-spacing-lg);
      }
      
      &__nav-item {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
        padding: var(--ft-spacing-sm) var(--ft-spacing-md);
        border-radius: var(--ft-radius-full);
        text-decoration: none;
        color: var(--ft-on-surface-variant);
        font-weight: 500;
        font-size: 0.875rem;
        transition: all var(--ft-transition-fast);
        
        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
        
        &:hover {
          background: var(--ft-surface-variant);
          color: var(--ft-on-surface);
        }
        
        &--active {
          background: rgba(25, 118, 210, 0.1);
          color: var(--ft-primary);
        }
      }
      
      &__spacer {
        flex: 1;
      }
      
      &__actions {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-xs);
      }
      
      &__lang-flag {
        font-size: 1.25rem;
        line-height: 1;
      }
      
      &__lang-item--active {
        background: rgba(25, 118, 210, 0.1);
        
        mat-icon {
          color: var(--ft-primary);
          margin-inline-start: auto;
        }
      }
      
      &__user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--ft-primary);
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
        color: var(--ft-primary);
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
        background: linear-gradient(135deg, var(--ft-primary) 0%, var(--ft-primary-dark) 100%);
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
        
        mat-icon {
          color: var(--ft-on-surface-variant);
        }
        
        &:hover {
          background: var(--ft-surface-variant);
        }
        
        &--active {
          background: rgba(25, 118, 210, 0.1);
          color: var(--ft-primary);
          
          mat-icon {
            color: var(--ft-primary);
          }
        }
        
        &--logout {
          color: var(--ft-error);
          border: none;
          background: none;
          width: 100%;
          cursor: pointer;
          font-size: 1rem;
          
          mat-icon {
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
          border-color: var(--ft-primary);
          background: rgba(25, 118, 210, 0.1);
          color: var(--ft-primary);
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
        
        mat-icon {
          font-size: 24px;
          width: 24px;
          height: 24px;
        }
        
        &--active {
          color: var(--ft-primary);
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

  mobileMenuOpen = signal(false);
  currentUser = computed(() => this.authService.getCurrentUser());
  
  // All navigation items with optional role restrictions
  allNavItems: NavItem[] = [
    { icon: 'dashboard', label: 'Dashboard', route: '/dashboard' },
    { icon: 'location_city', label: 'Towns', route: '/towns' },
    { icon: 'forest', label: 'My Trees', route: '/trees' },
    { icon: 'people', label: 'People', route: '/people' },
    { icon: 'account_tree', label: 'Family Tree', route: '/tree' },
    { icon: 'photo_library', label: 'Media', route: '/media' },
    { icon: 'link', label: 'Pending Links', route: '/pending-links', roles: ['SuperAdmin', 'Admin'] },
    { icon: 'admin_panel_settings', label: 'Admin', route: '/admin', roles: ['SuperAdmin'] }
  ];
  
  // Computed visible nav items based on user role
  visibleNavItems = computed(() => {
    const user = this.currentUser();
    return this.allNavItems.filter(item => {
      if (!item.roles) return true; // No role restriction
      if (!user?.systemRole) return false;
      return item.roles.includes(user.systemRole);
    });
  });
  
  // Bottom nav shows first 4 visible items (for mobile)
  bottomNavItems = computed(() => {
    return this.visibleNavItems().slice(0, 4);
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
    return lang?.flag || '🌐';
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

  selectTree(treeId: string): void {
    this.treeContext.selectTree(treeId);
  }
}