import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { AuthService } from '../../core/services/auth.service';
import { FamilyTree } from '../../core/models/family-tree.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        @if (loading()) {
          <div class="py-8">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">{{ 'invitation.accepting' | translate }}</p>
          </div>
        }

        @if (error()) {
          <div class="py-8">
            <svg class="mx-auto h-16 w-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">{{ 'invitation.error' | translate }}</h2>
            <p class="text-gray-600 mb-6">{{ error() }}</p>
            <a routerLink="/trees" class="text-blue-600 hover:underline">{{ 'invitation.goToTrees' | translate }}</a>
          </div>
        }

        @if (success() && tree()) {
          <div class="py-8">
            <svg class="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">{{ 'invitation.welcome' | translate }}</h2>
            <p class="text-gray-600 mb-6">
              {{ 'invitation.joined' | translate: { name: tree()!.name } }}
            </p>
            <a
              [routerLink]="['/trees', tree()!.id]"
              class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              {{ 'invitation.openTree' | translate }}
            </a>
          </div>
        }

        @if (needsLogin()) {
          <div class="py-8">
            <svg class="mx-auto h-16 w-16 text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">{{ 'invitation.loginRequired' | translate }}</h2>
            <p class="text-gray-600 mb-6">{{ 'invitation.pleaseLogin' | translate }}</p>
            <a
              routerLink="/login"
              [queryParams]="{ redirect: currentUrl }"
              class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              {{ 'auth.login' | translate }}
            </a>
          </div>
        }
      </div>
    </div>
  `
})
export class AcceptInvitationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly treeService = inject(FamilyTreeService);
  private readonly authService = inject(AuthService);
  private readonly i18n = inject(I18nService);

  loading = signal(true);
  error = signal<string | null>(null);
  success = signal(false);
  tree = signal<FamilyTree | null>(null);
  needsLogin = signal(false);
  currentUrl = '';

  ngOnInit() {
    this.currentUrl = this.router.url;
    const token = this.route.snapshot.queryParamMap.get('token');
    
    if (!token) {
      this.error.set(this.i18n.t('invitation.invalidLink'));
      this.loading.set(false);
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.needsLogin.set(true);
      this.loading.set(false);
      return;
    }

    this.acceptInvitation(token);
  }

  acceptInvitation(token: string) {
    this.treeService.acceptInvitation({ token }).subscribe({
      next: (tree) => {
        this.tree.set(tree);
        this.success.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('invitation.failedAccept'));
        this.loading.set(false);
      }
    });
  }
}
