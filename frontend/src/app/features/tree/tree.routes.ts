import { Routes } from '@angular/router';

export const TREE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./tree-view.component').then(m => m.TreeViewComponent)
  }
];
