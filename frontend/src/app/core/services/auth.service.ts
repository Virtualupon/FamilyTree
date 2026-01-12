import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, tap, of, catchError } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest, User, OrgRole, SystemRole } from '../models/auth.models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly accessTokenKey = 'access_token';
  private readonly refreshTokenKey = 'refresh_token';

  // Buffer time before expiry to trigger refresh (5 minutes)
  private readonly TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

  private currentUserSubject = new BehaviorSubject<User | null>(this.loadUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();

  public isAuthenticated = signal<boolean>(this.hasValidToken());

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request)
      .pipe(
        tap(response => this.handleAuthResponse(response))
      );
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request)
      .pipe(
        tap(response => this.handleAuthResponse(response))
      );
  }

  logout(): Observable<void> {
    const refreshToken = this.getRefreshToken();

    this.clearTokens();
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);

    if (refreshToken) {
      // Call revoke endpoint to invalidate the refresh token on the server
      // Silently ignore errors - logout should always succeed locally
      return this.http.post<void>(`${this.apiUrl}/revoke`, { refreshToken }).pipe(
        catchError(() => of(undefined))
      );
    }

    return of(undefined);
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      // Return an Observable error instead of throwing synchronously
      return new Observable(observer => {
        observer.error(new Error('No refresh token available'));
      });
    }

    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh`, { refreshToken })
      .pipe(
        tap(response => this.handleAuthResponse(response))
      );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Check tree-specific role
  hasTreeRole(role: OrgRole | OrgRole[]): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  }

  // Check system role
  hasSystemRole(role: SystemRole | SystemRole[]): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.systemRole);
  }

  // Check if user is SuperAdmin
  isSuperAdmin(): boolean {
    return this.hasSystemRole('SuperAdmin');
  }

  // Check if user is Admin or SuperAdmin
  isAdminOrHigher(): boolean {
    return this.hasSystemRole(['SuperAdmin', 'Admin']);
  }

  // Check if user can manage a tree (tree-specific Admin or Owner)
  canManageTree(): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    
    // SuperAdmin/Admin system roles can manage
    if (this.isAdminOrHigher()) return true;
    
    // Tree-specific Admin or Owner
    return user.role >= OrgRole.Admin;
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.setItem(this.accessTokenKey, response.accessToken);
    localStorage.setItem(this.refreshTokenKey, response.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.user));
    
    this.currentUserSubject.next(response.user);
    this.isAuthenticated.set(true);
  }

  private clearTokens(): void {
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem('user');
  }

  private loadUserFromStorage(): User | null {
    const userJson = localStorage.getItem('user');
    if (!userJson || userJson === 'undefined' || userJson === 'null') {
      return null;
    }
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }

  private hasValidToken(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    return !this.isTokenExpired(token);
  }

  /**
   * Check if a JWT token is expired (with buffer time)
   */
  isTokenExpired(token: string): boolean {
    const expiry = this.getTokenExpiry(token);
    if (!expiry) return true;

    // Check if token expires within buffer time
    return Date.now() >= expiry - this.TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Get token expiration time in milliseconds
   */
  getTokenExpiry(token: string): number | null {
    try {
      const payload = this.decodeToken(token);
      if (!payload || !payload['exp']) return null;
      // JWT exp is in seconds, convert to milliseconds
      return (payload['exp'] as number) * 1000;
    } catch {
      return null;
    }
  }

  /**
   * Decode JWT payload (without verification - just for reading claims)
   */
  private decodeToken(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = parts[1];
      // Handle URL-safe base64
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  /**
   * Check if current access token needs refresh
   */
  needsTokenRefresh(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    return this.isTokenExpired(token);
  }
}
