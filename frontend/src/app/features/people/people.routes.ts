import { Routes } from '@angular/router';

export const PEOPLE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./people-list.component').then(m => m.PeopleListComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./person-detail.component').then(m => m.PersonDetailComponent)
  }
];
