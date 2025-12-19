# Tasks 11-13: Angular Setup, Authentication & Infrastructure

## Task 11: Angular 20 Project Setup ✅

### Installed Packages
- Angular 20.3.0
- Angular Material 20.2.x
- TailwindCSS 3.x
- Standalone components architecture

### Configuration Files Created
- `tailwind.config.js` - TailwindCSS configuration
- `postcss.config.js` - PostCSS configuration for TailwindCSS
- `src/styles.scss` - Global styles with Angular Material theme + Tailwind directives
- `src/environments/environment.ts` - Development environment (API: http://localhost:8080/api)
- `src/environments/environment.prod.ts` - Production environment

### Project Structure
```
src/app/
├── core/
│   ├── models/
│   │   ├── auth.models.ts         # Auth interfaces (User, LoginRequest, etc.)
│   │   ├── person.models.ts       # Person, PersonName, enums
│   │   ├── union.models.ts        # Union/Marriage models
│   │   └── tree.models.ts         # Tree visualization models
│   ├── services/
│   │   ├── auth.service.ts        # JWT authentication with refresh tokens
│   │   ├── person.service.ts      # Person CRUD API calls
│   │   ├── union.service.ts       # Union/Marriage API calls
│   │   └── tree.service.ts        # Tree visualization API calls
│   ├── interceptors/
│   │   └── auth.interceptor.ts    # JWT token attachment + auto-refresh
│   └── guards/
│       └── auth.guard.ts          # Route protection + role-based guards
├── features/
│   ├── layout/
│   │   └── layout.component.ts    # Main layout with sidebar navigation
│   ├── auth/
│   │   ├── login.component.ts     # Login form (Task 13)
│   │   └── register.component.ts  # Registration form (Task 13)
│   ├── dashboard/
│   │   └── dashboard.component.ts # Dashboard with quick links
│   ├── people/
│   │   ├── people.routes.ts
│   │   ├── people-list.component.ts (placeholder)
│   │   └── person-detail.component.ts (placeholder)
│   ├── tree/
│   │   ├── tree.routes.ts
│   │   └── tree-view.component.ts (placeholder)
│   └── media/
│       └── media-gallery.component.ts (placeholder)
├── app.config.ts                  # Application providers (routing, HTTP, animations)
└── app.routes.ts                  # Route configuration with lazy loading
```

---

## Task 12: i18n Infrastructure ⏸️

**Status**: Deferred (basic RTL support added in styles.scss)

**Current RTL Support**:
```scss
[dir="rtl"] {
  direction: rtl;
  text-align: right;
}
```

**Next Steps** (when implementing full i18n):
1. Install @angular/localize
2. Configure angular.json with locales (en, ar, nob)
3. Create translation files for English, Arabic, Nobiin
4. Add language switcher component
5. Implement RTL layout switching

---

## Task 13: Authentication Module ✅

### Features Implemented

**AuthService** (`core/services/auth.service.ts`):
- ✅ Login with email/password
- ✅ User registration
- ✅ JWT access token management
- ✅ Refresh token handling
- ✅ Logout with token revocation
- ✅ Auto-refresh on 401 errors
- ✅ Current user observable (reactive)
- ✅ Role-based authorization checks

**AuthInterceptor** (`core/interceptors/auth.interceptor.ts`):
- ✅ Automatic JWT token attachment to requests
- ✅ Auto-refresh on 401 response
- ✅ Token renewal without user interruption
- ✅ Logout on refresh failure

**AuthGuard** (`core/guards/auth.guard.ts`):
- ✅ `authGuard` - Protects routes (redirects to /login)
- ✅ `roleGuard(roles)` - Role-based access control

**Login Component** (`features/auth/login.component.ts`):
- ✅ Reactive form with validation
- ✅ Email + password fields
- ✅ Loading spinner during authentication
- ✅ Error handling with Material snackbar
- ✅ Link to registration page
- ✅ Gradient background design

**Register Component** (`features/auth/register.component.ts`):
- ✅ Reactive form with validation
- ✅ Fields: firstName, lastName, email, password
- ✅ Password minimum length validation
- ✅ Loading spinner during registration
- ✅ Success notification
- ✅ Auto-redirect to dashboard after registration

---

## Routing Structure

**App Routes** (`app.routes.ts`):
```typescript
/                      → Protected with authGuard
├── /dashboard         → Dashboard component
├── /people            → People module (lazy loaded)
│   ├── /people        → People list
│   └── /people/:id    → Person detail
├── /tree              → Tree module (lazy loaded)
│   └── /tree          → Tree visualization
└── /media             → Media gallery

/login                 → Login component (public)
/register              → Register component (public)
```

**Layout Component** (`features/layout/layout.component.ts`):
- Material toolbar with app title
- Sidebar navigation (dashboard, people, tree, media)
- User info display (firstName + lastName)
- Logout button
- Responsive sidenav (collapsible)

---

## API Integration Setup

**Environment Configuration**:
- Development: `http://localhost:8080/api`
- Production: `/api` (relative path)

**HTTP Client**:
- Configured with `provideHttpClient()`
- Auth interceptor registered globally
- Automatic token refresh on 401

**Services Created**:
1. `AuthService` - Authentication & user management
2. `PersonService` - Person CRUD operations
3. `UnionService` - Union/Marriage management
4. `TreeService` - Tree visualization data

---

## Material Design Theme

**Theme Colors** (styles.scss):
- Primary: Indigo
- Accent: Pink
- Warn: Red

**Material Components Used**:
- MatToolbarModule
- MatSidenavModule
- MatListModule
- MatCardModule
- MatButtonModule
- MatIconModule
- MatFormFieldModule
- MatInputModule
- MatSnackBarModule
- MatProgressSpinnerModule

---

## TailwindCSS Integration

**Configuration** (tailwind.config.js):
- Custom primary color palette (blue shades)
- Scans all HTML/TS files in src/
- Works alongside Material styles

**Usage**:
- Utility classes available in all components
- Material components styled with Material theme
- Tailwind for custom layouts and spacing

---

## Security Features

### Token Management
- Access tokens stored in localStorage
- Refresh tokens stored separately
- Automatic token refresh before expiration
- Secure logout with server-side token revocation

### Route Protection
- All main routes protected with authGuard
- Role-based guards available for admin features
- Auto-redirect to /login for unauthorized users

### HTTP Security
- JWT bearer token on all API requests
- CORS handled by backend
- Automatic 401 error handling

---

## Testing in Visual Studio Code

### Run Frontend:
```bash
cd frontend
npm start
```
Frontend runs on: `http://localhost:5000`

### Run Backend:
```bash
cd backend/FamilyTreeApi
dotnet run
```
Backend runs on: `http://localhost:8080`

### Test Authentication Flow:
1. Navigate to http://localhost:5000/register
2. Create an account (firstName, lastName, email, password)
3. Login with credentials
4. Access protected routes (/dashboard, /people, /tree, /media)
5. Logout to test token revocation

---

## Next Tasks

**Task 14**: Person management UI (search, detail, edit)
**Task 15**: Relationship editors (union, parent-child)
**Task 16**: Tree visualization (SVG/Canvas)
**Task 17**: Media upload/gallery
**Task 18**: Advanced search
**Task 19**: Audit log viewer
**Task 20**: GEDCOM import/export
**Task 21**: Org management
**Task 22**: Final deployment config

---

## Notes for Visual Studio Code Testing

1. **Backend must be running** on port 8080 for API calls to work
2. **Frontend dev server** configured for port 5000 with `allowedHosts: ["all"]`
3. **Demo credentials** (from backend seed data):
   - Email: `admin@familytree.demo`
   - Password: `Demo123!`
4. **Storage service** needs implementation before media upload works
5. **Database migration** required for Place.OrgId column (see backend/DATABASE_MIGRATION_NOTES.md)

---

## Architecture Highlights

### Standalone Components
- No NgModules required
- Each component imports only what it needs
- Lazy loading with `loadComponent()`
- Cleaner, more maintainable code

### Reactive Programming
- RxJS observables for async operations
- Signal-based state for isAuthenticated
- BehaviorSubject for current user

### Type Safety
- TypeScript interfaces for all models
- Enums for Sex, NameType, DatePrecision, etc.
- Strong typing across services and components

### Performance
- Lazy loaded routes
- HTTP interceptor caching opportunity
- Tree-shakeable Material components
