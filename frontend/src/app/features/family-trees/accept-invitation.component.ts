import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { AuthService } from '../../core/services/auth.service';
import { FamilyTree } from '../../core/models/family-tree.models';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        @if (loading()) {
          <div class="py-8">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">Accepting invitation...</p>
          </div>
        }

        @if (error()) {
          <div class="py-8">
            <svg class="mx-auto h-16 w-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Invitation Error</h2>
            <p class="text-gray-600 mb-6">{{ error() }}</p>
            <a routerLink="/trees" class="text-blue-600 hover:underline">Go to My Trees</a>
          </div>
        }

        @if (success() && tree()) {
          <div class="py-8">
            <svg class="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Welcome!</h2>
            <p class="text-gray-600 mb-6">
              You've joined <strong>{{ tree()!.name }}</strong>
            </p>
            <a 
              [routerLink]="['/trees', tree()!.id]"
              class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              Open Tree
            </a>
          </div>
        }

        @if (needsLogin()) {
          <div class="py-8">
            <svg class="mx-auto h-16 w-16 text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Login Required</h2>
            <p class="text-gray-600 mb-6">Please log in to accept this invitation.</p>
            <a 
              routerLink="/login"
              [queryParams]="{ redirect: currentUrl }"
              class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              Log In
            </a>
          </div>
        }
      </div>
    </div>
  `
})
export class AcceptInvitationComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  success = signal(false);
  tree = signal<FamilyTree | null>(null);
  needsLogin = signal(false);
  currentUrl = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private treeService: FamilyTreeService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.currentUrl = this.router.url;
    const token = this.route.snapshot.queryParamMap.get('token');
    
    if (!token) {
      this.error.set('Invalid invitation link');
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
        this.error.set(err.error?.message || 'Failed to accept invitation');
        this.loading.set(false);
      }
    });
  }
}
