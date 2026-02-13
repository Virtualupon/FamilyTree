import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';

/**
 * Cookie-based auth interceptor.
 *
 * SECURITY CHANGES:
 * - No longer injects Authorization header (tokens are in HttpOnly cookies)
 * - Adds withCredentials: true so cookies are sent with cross-origin requests
 * - Reads XSRF-TOKEN cookie (non-HttpOnly) and sends as X-XSRF-TOKEN header for CSRF protection
 * - On 401, attempts cookie-based token refresh, then retries the original request
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Read XSRF token from cookie (set by backend, non-HttpOnly so JS can read it)
  const xsrfToken = getXsrfToken();

  // Clone request with credentials and XSRF header
  const headers: Record<string, string> = {};
  if (xsrfToken) {
    headers['X-XSRF-TOKEN'] = xsrfToken;
  }

  req = req.clone({
    withCredentials: true,
    setHeaders: headers
  });

  return next(req).pipe(
    catchError(error => {
      // On 401, attempt cookie-based refresh (skip if already refreshing or on auth endpoints)
      if (error.status === 401 &&
          !req.url.includes('/auth/refresh') &&
          !req.url.includes('/auth/revoke') &&
          !req.url.includes('/auth/login') &&
          !req.url.includes('/auth/register')) {
        return authService.refreshToken().pipe(
          switchMap(() => {
            // Retry original request — cookies are automatically updated by the browser
            // Re-read XSRF token since it may have been rotated during refresh
            const newXsrfToken = getXsrfToken();
            const retryHeaders: Record<string, string> = {};
            if (newXsrfToken) {
              retryHeaders['X-XSRF-TOKEN'] = newXsrfToken;
            }

            const clonedRequest = req.clone({
              withCredentials: true,
              setHeaders: retryHeaders
            });
            return next(clonedRequest);
          }),
          catchError(refreshError => {
            // Refresh failed — log out and redirect to login
            authService.logout().subscribe(() => {
              router.navigate(['/login']);
            });
            return throwError(() => refreshError);
          })
        );
      }
      return throwError(() => error);
    })
  );
};

/**
 * Read the XSRF-TOKEN cookie value.
 * This cookie is set by the backend as non-HttpOnly so Angular can read it
 * and send it as a header for CSRF protection.
 */
function getXsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
