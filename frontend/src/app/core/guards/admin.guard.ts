import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const superAdminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  // Developer and SuperAdmin have full admin panel access
  if (user?.systemRole === 'Developer' || user?.systemRole === 'SuperAdmin') {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  // Developer, SuperAdmin, and Admin have admin-level access
  if (user?.systemRole === 'Developer' ||
      user?.systemRole === 'SuperAdmin' ||
      user?.systemRole === 'Admin') {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
