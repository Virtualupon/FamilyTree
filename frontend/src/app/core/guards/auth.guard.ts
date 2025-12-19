import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrgRole } from '../models/auth.models';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();
  const token = authService.getAccessToken();

  if (!token || !user) {
    router.navigate(['/login']);
    return false;
  }

  authService.isAuthenticated.set(true);
  return true;
};

export const roleGuard = (allowedRoles: OrgRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const token = authService.getAccessToken();
    const user = authService.getCurrentUser();

    if (!token || !user) {
      router.navigate(['/login']);
      return false;
    }

    if (authService.hasTreeRole(allowedRoles)) {
      return true;
    }

    router.navigate(['/']);
    return false;
  };
};