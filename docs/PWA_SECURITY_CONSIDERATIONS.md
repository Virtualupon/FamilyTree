# PWA Security Considerations

## Overview

This document outlines security measures implemented to protect user data in the Family Tree PWA, particularly on shared or public devices.

---

## 1. Service Worker Caching Security

### Sensitive Endpoints - Never Cached

The following endpoints are explicitly excluded from Service Worker caching to prevent data leakage:

```json
{
  "name": "api-never-cache",
  "urls": [
    "/api/auth/**",   // Authentication tokens, user profiles
    "/api/admin/**"   // Administrative operations
  ],
  "cacheConfig": {
    "maxAge": "0u",   // Zero cache duration
    "maxSize": 0      // No entries cached
  }
}
```

**Rationale:** Authentication responses contain tokens and user data that must never be served from cache to a different user.

### Family Data - Short-Lived Cache

Family data uses "freshness" strategy with short expiry:

| Endpoint Pattern | Strategy | Max Age | Reason |
|------------------|----------|---------|--------|
| `/api/person/**` | freshness | 1 hour | Person data may change |
| `/api/tree/**` | freshness | 1 hour | Tree structure may change |
| `/api/family/**` | freshness | 1 hour | Relationships may change |

**Freshness Strategy:** Always attempts network first; falls back to cache only if offline.

### Reference Data - Longer Cache

Static reference data uses "performance" strategy:

| Endpoint Pattern | Strategy | Max Age | Reason |
|------------------|----------|---------|--------|
| `/api/town/**` | performance | 1 day | Town list rarely changes |
| `/api/lookup/**` | performance | 1 day | Lookup values stable |
| `/api/place/**` | performance | 1 day | Place data stable |

---

## 2. Logout Security - Cache Clearing

### Implementation

On user logout, the application clears all Service Worker caches to prevent data leakage:

```typescript
// auth.service.ts
private async clearServiceWorkerCache(): Promise<void> {
  const cacheNames = await caches.keys();
  const apiCaches = cacheNames.filter(name =>
    name.includes('ngsw') || name.includes('api')
  );
  await Promise.all(
    apiCaches.map(cacheName => caches.delete(cacheName))
  );
}
```

### What This Protects Against

| Attack Scenario | Protection |
|-----------------|------------|
| Shared device - next user sees cached data | Cache cleared on logout |
| Public computer - data persists after session | Cache cleared on logout |
| Browser "back" button after logout | Cache cleared, requires fresh auth |

### Limitations

- If user closes browser without logging out, cache persists
- Recommendation: Encourage logout on shared devices via UI

---

## 3. Token Storage Security

### Current Implementation

| Storage | Data | Risk Assessment |
|---------|------|-----------------|
| localStorage | Access token | Medium - persists until cleared |
| localStorage | Refresh token | Medium - persists until cleared |
| localStorage | User profile JSON | Low - non-sensitive metadata |

### Token Expiry Handling

```typescript
// Tokens checked before use
isTokenExpired(token: string): boolean {
  const expiry = this.getTokenExpiry(token);
  return Date.now() >= expiry - TOKEN_EXPIRY_BUFFER_MS;
}
```

### Recommendations for Enhanced Security

1. **Consider sessionStorage** for access tokens (cleared on tab close)
2. **HttpOnly cookies** for refresh tokens (not accessible via JS)
3. **Token rotation** on each refresh request

---

## 4. Viewport and Touch Security

### Configuration

```html
<meta name="viewport" content="width=device-width, initial-scale=1,
  viewport-fit=cover, maximum-scale=5, user-scalable=yes">
```

### D3 Tree Touch Handling

The D3 tree component uses `touch-action: none` to prevent browser gesture conflicts:

```scss
.d3-tree-svg {
  touch-action: none;  // Prevents browser zoom on tree
}
```

**Why This Matters:**
- `user-scalable=yes` required for WCAG 2.1 Level AA accessibility
- D3 tree needs isolated touch handling for zoom/pan
- CSS `touch-action: none` provides isolation without WCAG violation

---

## 5. iOS Safari Specific Considerations

### Known Limitations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| SW reset after 7 days inactivity | Cache cleared | Graceful degradation to network |
| No push notifications | Cannot notify offline | Email notifications as fallback |
| Limited IndexedDB (~50MB) | Large family trees may fail | Pagination, on-demand loading |
| No beforeinstallprompt | Custom install prompt doesn't work | iOS-specific install instructions |

### Recommendations

1. Show iOS-specific PWA install instructions
2. Test offline scenarios specifically on iOS
3. Monitor quota usage for large family trees

---

## 6. Offline Data Integrity

### What Works Offline

| Feature | Offline Support | Notes |
|---------|-----------------|-------|
| View cached family tree | Yes | If previously loaded |
| View cached person details | Yes | If previously loaded |
| Navigate between cached pages | Yes | Using SW cache |
| Login/Authentication | No | Requires network |
| Create/Edit persons | No | Requires network |
| Upload media | No | Requires network |

### Conflict Prevention

- All write operations require network
- No offline queue for edits (prevents conflicts)
- User notified when offline and attempting write

---

## 7. Security Checklist

### Deployment Checklist

- [ ] HTTPS enforced on all environments
- [ ] CSP headers configured
- [ ] Auth endpoints excluded from SW cache
- [ ] Logout clears SW cache
- [ ] Tokens have appropriate expiry
- [ ] Refresh token rotation enabled
- [ ] Rate limiting on auth endpoints

### Testing Checklist

- [ ] Login as User A, view family tree
- [ ] Logout as User A
- [ ] Login as User B (different user)
- [ ] Verify User B cannot see User A's cached data
- [ ] Test on shared/public device scenario
- [ ] Test iOS Safari PWA behavior

---

## 8. Documented Assumptions

| Assumption | Risk if False | Enforcement |
|------------|---------------|-------------|
| HTTPS always enabled | SW won't register, tokens exposed | Redirect HTTP to HTTPS |
| Users logout on shared devices | Data leakage | UI prompts, session timeout |
| Tokens expire within 24 hours | Extended exposure window | Backend token config |
| Browser supports Cache API | SW cache clearing fails | Feature detection |
| Single active session per user | Token conflicts | Consider session management |

---

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Initial security documentation | Claude |
