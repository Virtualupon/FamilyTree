import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard, adminGuard } from './core/guards/admin.guard';
import { onboardingCompleteGuard, onboardingInProgressGuard } from './core/guards/onboarding.guard';

export const routes: Routes = [
  // Onboarding routes (language and town selection)
  {
    path: 'onboarding',
    canActivate: [authGuard, onboardingInProgressGuard],
    children: [
      {
        path: '',
        redirectTo: 'language',
        pathMatch: 'full'
      },
      {
        path: 'language',
        loadComponent: () => import('./features/onboarding/language-selection.component').then(m => m.LanguageSelectionComponent)
      },
      {
        path: 'town',
        loadComponent: () => import('./features/onboarding/town-selection.component').then(m => m.TownSelectionComponent)
      }
    ]
  },
  // Main application routes (requires onboarding complete)
  {
    path: '',
    canActivate: [authGuard, onboardingCompleteGuard],
    loadComponent: () => import('./features/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'trees',
        loadComponent: () => import('./features/family-trees/tree-list.component').then(m => m.TreeListComponent)
      },
      {
        path: 'trees/:id',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'trees/:id/settings',
        loadComponent: () => import('./features/family-trees/tree-settings.component').then(m => m.TreeSettingsComponent)
      },
      {
        path: 'pending-links',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/family-trees/manage-relationships.component').then(m => m.ManageRelationshipsComponent)
      },
      {
        path: 'cross-tree-links',
        loadComponent: () => import('./features/family-trees/pending-links.component').then(m => m.PendingLinksComponent)
      },
      {
        path: 'admin',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/admin-panel.component').then(m => m.AdminPanelComponent)
      },
      {
        path: 'admin/countries',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/countries/countries-list.component').then(m => m.CountriesListComponent)
      },
      {
        path: 'admin/carousel-images',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/carousel-images/carousel-images.component').then(m => m.CarouselImagesComponent)
      },
      {
        path: 'admin/town-images',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/town-images/town-images.component').then(m => m.TownImagesComponent)
      },
      {
        path: 'admin/suggestions',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/suggestion-queue.component').then(m => m.SuggestionQueueComponent)
      },
      {
        path: 'admin/suggestions/:id',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/suggestion-review.component').then(m => m.SuggestionReviewComponent)
      },
      {
        path: 'admin/storage-migration',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/storage-migration/storage-migration.component').then(m => m.StorageMigrationComponent)
      },
      {
        path: 'admin/duplicates',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/duplicate-detection/duplicate-detection.component').then(m => m.DuplicateDetectionComponent)
      },
      {
        path: 'admin/predictions',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/predictions/predictions.component').then(m => m.PredictionsComponent)
      },
      {
        path: 'admin/media-approval',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/media-approval-queue.component').then(m => m.MediaApprovalQueueComponent)
      },
      {
        path: 'admin/activity-logs',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/activity-logs/activity-logs.component').then(m => m.ActivityLogsComponent)
      },
      {
        path: 'support',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/support/my-tickets.component').then(m => m.MyTicketsComponent)
          },
          {
            path: ':id',
            loadComponent: () => import('./features/support/ticket-detail.component').then(m => m.TicketDetailComponent)
          }
        ]
      },
      {
        path: 'admin/support-tickets',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./features/admin/support-tickets/support-tickets-admin.component').then(m => m.SupportTicketsAdminComponent)
      },
      {
        path: 'suggestions',
        children: [
          {
            path: 'my',
            loadComponent: () => import('./features/suggestions/my-suggestions.component').then(m => m.MySuggestionsComponent)
          },
          {
            path: 'new',
            loadComponent: () => import('./features/suggestions/my-suggestions.component').then(m => m.MySuggestionsComponent)
          },
          {
            path: ':id',
            loadComponent: () => import('./features/admin/suggestion-review.component').then(m => m.SuggestionReviewComponent)
          }
        ]
      },
      {
        path: 'people',
        loadChildren: () => import('./features/people/people.routes').then(m => m.PEOPLE_ROUTES)
      },
      {
        path: 'tree',
        loadChildren: () => import('./features/tree/tree.routes').then(m => m.TREE_ROUTES)
      },
      {
        path: 'media',
        loadComponent: () => import('./features/media/media-gallery.component').then(m => m.MediaGalleryComponent)
      },
      {
        path: 'towns',
        loadComponent: () => import('./features/towns/town-list.component').then(m => m.TownListComponent)
      },
      {
        path: 'towns/:id',
        loadComponent: () => import('./features/towns/town-detail.component').then(m => m.TownDetailComponent)
      },
      {
        path: 'towns/:townId/overview',
        loadComponent: () => import('./features/towns/town-overview.component').then(m => m.TownOverviewComponent)
      },
      {
        path: 'towns/:townId/trees/:treeId',
        loadComponent: () => import('./features/towns/tree-detail.component').then(m => m.TreeDetailComponent)
      },
      {
        path: 'towns/:townId/trees/:treeId/people',
        loadComponent: () => import('./features/towns/tree-people-list.component').then(m => m.TreePeopleListComponent)
      },
      {
        path: 'families',
        loadComponent: () => import('./features/families/families-list.component').then(m => m.FamiliesListComponent)
      }
    ]
  },
  {
    path: 'help',
    loadComponent: () => import('./features/auth/help.component').then(m => m.HelpComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/auth/verify-email.component').then(m => m.VerifyEmailComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: 'invite',
    loadComponent: () => import('./features/family-trees/accept-invitation.component').then(m => m.AcceptInvitationComponent)
  },
  {
    path: 'offline',
    loadComponent: () => import('./features/offline/offline.component').then(m => m.OfflineComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];