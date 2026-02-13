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
  TownInfo,
  InitiateRegistrationRequest,
  InitiateRegistrationResponse,
  CompleteRegistrationRequest,
  CompleteRegistrationResponse,
  ResendCodeResponse,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse
} from '../models/auth.models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly registrationTokenKey = 'registration_token';
  private readonly verifyEmailKey = 'verify_email';

  private currentUserSubject = new BehaviorSubject<User | null>(this.loadUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();

  public isAuthenticated = signal<boolean>(this.hasValidSession());

  constructor(
    private http: HttpClient,
    private router: Router,
    private swUpdate: SwUpdate
  ) {}

  // ============================================================================
  // AUTHENTICATION — Cookie-based (HttpOnly cookies set by backend)
  // ============================================================================

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request)
      .pipe(
        tap(response => this.handleAuthResponse(response))
      );
  }

  /**
   * Legacy single-phase registration (deprecated).
   * Use initiateRegistration() and completeRegistration() instead.
   */
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request)
      .pipe(
        tap(response => this.handleAuthResponse(response))
      );
  }

  // ============================================================================
  // Two-Phase Registration (Secure)
  // SECURITY: Password is NOT stored in sessionStorage - only the registration token
  // ============================================================================

  /**
   * Phase 1: Initiate registration - sends password once, receives token.
   * Token is stored (NOT the password).
   */
  initiateRegistration(request: InitiateRegistrationRequest): Observable<InitiateRegistrationResponse> {
    return this.http.post<InitiateRegistrationResponse>(
      `${this.apiUrl}/register/initiate`,
      request
    ).pipe(
      tap(response => {
        if (response.success && response.registrationToken) {
          // SECURITY: Store only the token, NOT the password
          sessionStorage.setItem(this.registrationTokenKey, response.registrationToken);
          sessionStorage.setItem(this.verifyEmailKey, response.maskedEmail);
        }
      })
    );
  }

  /**
   * Phase 2: Complete registration using token + verification code.
   * SECURITY: Password is NOT re-transmitted. Tokens set via HttpOnly cookies.
   */
  completeRegistration(code: string): Observable<CompleteRegistrationResponse> {
    const registrationToken = this.getRegistrationToken();
    if (!registrationToken) {
      return new Observable(observer => {
        observer.error(new Error('No registration token found. Please start registration again.'));
      });
    }

    const request: CompleteRegistrationRequest = {
      registrationToken,
      code
    };

    return this.http.post<CompleteRegistrationResponse>(
      `${this.apiUrl}/register/complete`,
      request
    ).pipe(
      tap(response => {
        if (response.success && response.user) {
          // Tokens are in HttpOnly cookies — just store user profile
          this.storeUserProfile(response.user);
          this.currentUserSubject.next(response.user);
          this.isAuthenticated.set(true);
          this.clearRegistrationData();
        }
      })
    );
  }

  /**
   * Get stored registration token (not password!).
   */
  getRegistrationToken(): string | null {
    return sessionStorage.getItem(this.registrationTokenKey);
  }

  /**
   * Get masked email for verification display.
   */
  getVerifyEmail(): string | null {
    return sessionStorage.getItem(this.verifyEmailKey);
  }

  /**
   * Clear registration data after successful registration or on cancel.
   */
  clearRegistrationData(): void {
    sessionStorage.removeItem(this.registrationTokenKey);
    sessionStorage.removeItem(this.verifyEmailKey);
  }

  /**
   * Check if we have a pending registration.
   */
  hasPendingRegistration(): boolean {
    return !!this.getRegistrationToken();
  }

  // ============================================================================
  // Email Verification & Password Reset
  // ============================================================================

  /**
   * Resend verification code with rate limiting support.
   */
  resendCode(email: string, purpose: 'Registration' | 'PasswordReset'): Observable<ResendCodeResponse> {
    return this.http.post<ResendCodeResponse>(`${this.apiUrl}/resend-code`, { email, purpose });
  }

  /**
   * Initiate forgot password flow.
   */
  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(`${this.apiUrl}/forgot-password`, { email });
  }

  /**
   * Reset password using verification code.
   */
  resetPassword(request: ResetPasswordRequest): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.apiUrl}/reset-password`, request);
  }

  /**
   * Get towns for registration dropdown (public endpoint).
   */
  getTownsForRegistration(): Observable<TownInfo[]> {
    return this.http.get<TownInfo[]>(`${this.apiUrl}/towns`);
  }

  // ============================================================================
  // LOGOUT — Clears HttpOnly cookies server-side
  // ============================================================================

  logout(): Observable<void> {
    // Clear local state immediately
    this.clearLocalSession();

    // CRITICAL: Clear Service Worker cache on logout to prevent data leakage
    this.clearServiceWorkerCache();

    // Call revoke endpoint to invalidate refresh token + clear HttpOnly cookies server-side
    // Silently ignore errors - logout should always succeed locally
    return this.http.post<void>(`${this.apiUrl}/revoke`, {}).pipe(
      catchError(() => of(undefined))
    );
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

  // ============================================================================
  // TOKEN REFRESH — Cookie-based (refresh token in HttpOnly cookie)
  // ============================================================================

  refreshToken(): Observable<AuthResponse> {
    // No need to read refresh token from localStorage — it's in the HttpOnly cookie
    // and will be sent automatically with the request via withCredentials
    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh`, {})
      .pipe(
        tap(response => this.handleAuthResponse(response)),
        catchError(error => {
          // If refresh fails, clear local session
          this.clearLocalSession();
          throw error;
        })
      );
  }

  // ============================================================================
  // USER STATE — Profile stored locally for UI, tokens are NOT accessible
  // ============================================================================

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

  // Check if user is Developer
  isDeveloper(): boolean {
    return this.hasSystemRole('Developer');
  }

  // Check if user is SuperAdmin or Developer
  isSuperAdmin(): boolean {
    return this.hasSystemRole(['SuperAdmin', 'Developer']);
  }

  // Check if user is Admin, SuperAdmin, or Developer
  isAdminOrHigher(): boolean {
    return this.hasSystemRole(['Developer', 'SuperAdmin', 'Admin']);
  }

  // Check if user can manage a tree (tree-specific Admin or Owner)
  canManageTree(): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Developer/SuperAdmin/Admin system roles can manage
    if (this.isAdminOrHigher()) return true;

    // Tree-specific Admin or Owner
    return user.role >= OrgRole.Admin;
  }

  // ============================================================================
  // AUTH RESPONSE HANDLING — No tokens in body, only user profile
  // ============================================================================

  /**
   * Handle cookie-based auth response.
   * SECURITY: Tokens are in HttpOnly cookies (set by backend), NOT in the response body.
   * We only store the user profile for UI state.
   */
  private handleAuthResponse(response: AuthResponse): void {
    this.storeUserProfile(response.user);
    this.currentUserSubject.next(response.user);
    this.isAuthenticated.set(true);
  }

  /**
   * Store user profile in localStorage for UI state (NOT a token).
   */
  private storeUserProfile(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  }

  /**
   * Clear local session state (user profile, auth signal).
   * Does NOT clear HttpOnly cookies — that's done server-side via /revoke.
   */
  private clearLocalSession(): void {
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);
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

  /**
   * Check if user has a valid session.
   * With HttpOnly cookies, we can't inspect the token directly.
   * We rely on the user profile existing in localStorage as a signal.
   * The backend validates the actual token on each request.
   */
  private hasValidSession(): boolean {
    return this.loadUserFromStorage() !== null;
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
   * Select a town for viewing (User role).
   * Access token with town claim is set via HttpOnly cookie by the backend.
   */
  selectTownForUser(townId: string): Observable<SelectTownResponse> {
    return this.http.post<SelectTownResponse>(`${this.apiUrl}/select-town-user`, { townId })
      .pipe(
        tap(response => {
          // Token is in HttpOnly cookie — just update user profile with selected town
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
   * Select a town for managing (Admin role).
   * Access token with town claim is set via HttpOnly cookie by the backend.
   */
  selectTownForAdmin(townId: string): Observable<SelectTownResponse> {
    return this.http.post<SelectTownResponse>(`${this.apiUrl}/select-town`, { townId })
      .pipe(
        tap(response => {
          // Token is in HttpOnly cookie — just update user profile with selected town
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
   * Developer, Admin, and SuperAdmin have assigned towns that auto-select,
   * so they bypass this check.
   */
  needsTownSelection(): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Developer doesn't need town selection - has access to all towns
    if (user.systemRole === 'Developer') return false;

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
