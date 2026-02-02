import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, tap, of, catchError, map } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
  OrgRole,
  SystemRole,
  SetLanguageRequest,
  SetLanguageResponse,
  SelectTownRequest,
  SelectTownResponse,
  AvailableTownsResponse,
  AdminLoginResponse,
  TownInfo
} from '../models/auth.models';
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
    private router: Router,
    private swUpdate: SwUpdate
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

    // CRITICAL: Clear Service Worker cache on logout to prevent data leakage
    // This ensures the next user on a shared device doesn't see cached family data
    this.clearServiceWorkerCache();

    if (refreshToken) {
      // Call revoke endpoint to invalidate the refresh token on the server
      // Silently ignore errors - logout should always succeed locally
      return this.http.post<void>(`${this.apiUrl}/revoke`, { refreshToken }).pipe(
        catchError(() => of(undefined))
      );
    }

    return of(undefined);
  }

  /**
   * Clear all Service Worker caches on logout.
   * SECURITY: Prevents cached family data from being exposed to subsequent users
   * on shared or public devices.
   */
  private async clearServiceWorkerCache(): Promise<void> {
    if (isDevMode() || !this.swUpdate.isEnabled) {
      return;
    }

    try {
      // Clear all caches managed by the browser
      const cacheNames = await caches.keys();
      const apiCaches = cacheNames.filter(name =>
        name.includes('ngsw') || name.includes('api')
      );

      await Promise.all(
        apiCaches.map(cacheName => caches.delete(cacheName))
      );

      console.log('Service Worker caches cleared on logout');
    } catch (error) {
      // Don't block logout on cache clearing failure
      console.warn('Failed to clear SW caches:', error);
    }
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

  // ============================================================================
  // Governance Model - Language and Town Selection
  // ============================================================================

  /**
   * Set preferred language for the user (first login onboarding)
   */
  setLanguage(language: string): Observable<SetLanguageResponse> {
    return this.http.post<SetLanguageResponse>(`${this.apiUrl}/set-language`, { language })
      .pipe(
        tap(response => {
          // Update stored user with new language
          this.updateStoredUser(response.user);
        })
      );
  }

  /**
   * Complete first login onboarding (marks IsFirstLogin = false)
   */
  completeOnboarding(): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/complete-onboarding`, {})
      .pipe(
        tap(user => {
          this.updateStoredUser(user);
        })
      );
  }

  /**
   * Get available towns for User role to browse
   */
  getAvailableTowns(): Observable<TownInfo[]> {
    return this.http.get<AvailableTownsResponse>(`${this.apiUrl}/available-towns`)
      .pipe(map(response => response.towns));
  }

  /**
   * Get assigned towns for Admin role (for town selection)
   */
  getMyTowns(): Observable<AdminLoginResponse> {
    return this.http.get<AdminLoginResponse>(`${this.apiUrl}/my-towns`);
  }

  /**
   * Select a town for viewing (User role)
   */
  selectTownForUser(townId: string): Observable<SelectTownResponse> {
    return this.http.post<SelectTownResponse>(`${this.apiUrl}/select-town-user`, { townId })
      .pipe(
        tap(response => {
          // Update access token with town claim
          localStorage.setItem(this.accessTokenKey, response.accessToken);

          // Update stored user with selected town
          const user = this.getCurrentUser();
          if (user) {
            user.selectedTownId = response.townId;
            user.selectedTownName = response.townName;
            this.updateStoredUser(user);
          }
        })
      );
  }

  /**
   * Select a town for managing (Admin role)
   */
  selectTownForAdmin(townId: string): Observable<SelectTownResponse> {
    return this.http.post<SelectTownResponse>(`${this.apiUrl}/select-town`, { townId })
      .pipe(
        tap(response => {
          // Update access token with town claim
          localStorage.setItem(this.accessTokenKey, response.accessToken);

          // Update stored user with selected town
          const user = this.getCurrentUser();
          if (user) {
            user.selectedTownId = response.townId;
            user.selectedTownName = response.townName;
            this.updateStoredUser(user);
          }
        })
      );
  }

  /**
   * Get current user profile from server
   */
  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/profile`)
      .pipe(
        tap(user => {
          this.updateStoredUser(user);
        })
      );
  }

  /**
   * Check if user needs language selection (first login)
   */
  needsLanguageSelection(): boolean {
    const user = this.getCurrentUser();
    return user?.isFirstLogin === true;
  }

  /**
   * Check if user needs town selection (regular User role without selected town)
   * Admin and SuperAdmin have assigned towns that auto-select, so they bypass this check.
   */
  needsTownSelection(): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // SuperAdmin doesn't need town selection - has access to all towns
    if (user.systemRole === 'SuperAdmin') return false;

    // Admin doesn't need town selection - has assigned towns that auto-select
    if (user.systemRole === 'Admin') return false;

    // Regular users need town selection if they don't have one
    return !user.selectedTownId;
  }

  /**
   * Get selected town ID from current user
   */
  getSelectedTownId(): string | null {
    const user = this.getCurrentUser();
    return user?.selectedTownId ?? null;
  }

  /**
   * Get selected town name from current user
   */
  getSelectedTownName(): string | null {
    const user = this.getCurrentUser();
    return user?.selectedTownName ?? null;
  }

  /**
   * Check if user is a viewer (User role)
   */
  isViewer(): boolean {
    const user = this.getCurrentUser();
    return user?.systemRole === 'User';
  }

  /**
   * Update stored user and emit change
   */
  private updateStoredUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }
}
