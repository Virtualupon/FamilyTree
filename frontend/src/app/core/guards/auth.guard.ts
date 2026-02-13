import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrgRole } from '../models/auth.models';

/**
 * Auth guard — cookie-based.
 * With HttpOnly cookies, we can't inspect the token directly.
 * We check if a user profile exists in memory/localStorage as a session indicator.
 * The backend validates the actual token on each API request.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (!user) {
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

    const user = authService.getCurrentUser();

    if (!user) {
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
