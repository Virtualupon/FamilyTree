import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
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
        path: 'families',
        loadComponent: () => import('./features/families/families-list.component').then(m => m.FamiliesListComponent)
      }
    ]
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