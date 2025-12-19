# Authentication Implementation Notes

## Current Design

### Auth Guard (Synchronous)
The `authGuard` checks for token/user existence synchronously:
- ✅ Fast navigation (no async delay)
- ✅ Backend validates all requests
- ✅ Interceptor handles expired tokens
- ⚠️ Brief UI exposure if token expired (until first API call)

### Token Refresh Flow
1. User makes API request with expired token
2. Backend returns 401
3. Interceptor catches 401 → calls refresh endpoint
4. If refresh succeeds → retry request with new token
5. If refresh fails → logout + redirect to /login

### Role-Based Access
- `hasRole(role: number | number[])` - Fixed to compare enum numbers
- `roleGuard([0, 1, 2])` - Pass enum values (Owner=0, Admin=1, Editor=2)

## Potential Enhancements (Optional)

### Async Guard with Token Validation
If you need pre-navigation token validation:

```typescript
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.getAccessToken();
  const user = authService.getCurrentUser();

  if (!token || !user) {
    return router.createUrlTree(['/login']);
  }

  // Optional: Validate token with backend before allowing navigation
  return authService.validateToken().pipe(
    map(() => true),
    catchError(() => {
      authService.logout().subscribe();
      return of(router.createUrlTree(['/login']));
    })
  );
};
```

**Trade-off**: Slower navigation vs. guaranteed valid tokens

## Security

✅ **Backend validates all requests** - Primary security layer
✅ **HTTPS required in production** - Token transmission security
✅ **Refresh tokens hashed** - Backend stores BCrypt hash
✅ **Token revocation** - Logout invalidates refresh token
✅ **Auto-refresh** - Seamless UX without re-login

## Testing

### Demo Credentials
- Email: `admin@familytree.demo`
- Password: `Demo123!`

### Test Scenarios
1. **Login** → Access protected routes
2. **Token expiry** → Auto-refresh on API call
3. **Logout** → Redirect to login
4. **Direct URL** → Redirect if not authenticated
5. **Role check** → Owner/Admin/Editor roles

## Production Recommendations

1. **Use HTTPS** - Encrypt token transmission
2. **Short token expiry** - 15 min access, 7 day refresh
3. **HttpOnly cookies** (alternative) - More secure than localStorage
4. **Rate limiting** - Prevent brute force on /login
5. **CORS whitelist** - Lock down API origins
