import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard that checks if user has completed language selection (first login).
 * If not, redirects to /onboarding/language.
 */
export const languageSelectedGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.needsLanguageSelection()) {
    router.navigate(['/onboarding/language']);
    return false;
  }

  return true;
};

/**
 * Guard that checks if user has selected a town.
 * If not, redirects to /onboarding/town.
 * SuperAdmin and Admin bypass this check (they have assigned towns that auto-select).
 */
export const townSelectedGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  // Developer/SuperAdmin doesn't need town selection - has access to all towns
  if (user.systemRole === 'Developer' || user.systemRole === 'SuperAdmin') {
    return true;
  }

  // Admin doesn't need town selection - has assigned towns that auto-select
  if (user.systemRole === 'Admin') {
    return true;
  }

  if (authService.needsTownSelection()) {
    router.navigate(['/onboarding/town']);
    return false;
  }

  return true;
};

/**
 * Combined guard for full onboarding check.
 * First checks language, then town selection.
 */
export const onboardingCompleteGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  // Check language selection first
  if (authService.needsLanguageSelection()) {
    router.navigate(['/onboarding/language']);
    return false;
  }

  // Then check town selection (Developer, SuperAdmin and Admin bypass - they have assigned towns)
  if (user.systemRole !== 'Developer' && user.systemRole !== 'SuperAdmin' && user.systemRole !== 'Admin' && authService.needsTownSelection()) {
    router.navigate(['/onboarding/town']);
    return false;
  }

  return true;
};

/**
 * Guard that allows access only during onboarding.
 * If onboarding is complete, redirects to dashboard.
 */
export const onboardingInProgressGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  // If onboarding is complete, redirect to dashboard
  const needsLanguage = authService.needsLanguageSelection();
  // Developer, SuperAdmin and Admin don't need town selection - they have assigned towns
  const needsTown = user.systemRole !== 'Developer' && user.systemRole !== 'SuperAdmin' && user.systemRole !== 'Admin' && authService.needsTownSelection();

  if (!needsLanguage && !needsTown) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};
