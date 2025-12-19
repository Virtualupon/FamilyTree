# Family Tree Platform - For Integration with Baseline Application

## Overview
Family Tree genealogy features designed to integrate with your existing **Nobiin Dictionary** baseline application. These features add multi-tenant genealogy management, complex relationship modeling (including polygamy), rich media handling, and multi-language support (English, Arabic, Nobiin) to your existing ASP.NET Identity application.

## Project Goals
- Accurate lineage modeling (multiple spouses/parallel unions, divorces, adoptions, step/half relations)
- Beautiful, fast tree browsing (pedigree/descendant views) with rich media
- Multi-tenant, privacy-aware collaboration with audit history and rollbacks
- Multi-language support (English, Arabic, Nobiin) with RTL layouts

## Recent Changes
- **2025-11-15**: Baseline Integration & VirtualUpon.Storage Setup (100% Complete)
  - ✅ Integrated baseline infrastructure: Serilog, Redis, Health Checks
  - ✅ Updated appsettings.json with full baseline configuration structure
  - ✅ Configured VirtualUpon.Storage multi-provider support (Local/AWS/Linode/Nextcloud/Cloudflare)
  - ✅ Added StorageConfiguration models and factory pattern
  - ✅ Implemented storage service registration with validation helpers
  - ✅ Added NuGet packages: HealthChecks (9.0.0), StackExchangeRedis (8.0.11), Serilog.Enrichers
  - ✅ Removed placeholder IStorageService - using VirtualUpon.Storage instead
  - ✅ Created STORAGE_SETUP.md with complete integration instructions
  
- **2025-11-15**: ASP.NET Identity Migration (100% Complete)
  - ✅ Migrated from custom User model to ASP.NET Identity with long (int8) user IDs
  - ✅ Created ApplicationUser : IdentityUser<long> with custom properties
  - ✅ Updated ApplicationDbContext to inherit from IdentityDbContext<ApplicationUser, IdentityRole<long>, long>
  - ✅ Changed OrgUser.UserId and AuditLog.ActorId from Guid → long
  - ✅ Rewrote AuthService to use UserManager<ApplicationUser> and SignInManager<ApplicationUser>
  - ✅ Updated all controllers with GetUserId() helper methods for long user IDs
  - ✅ Added Microsoft.AspNetCore.Identity.EntityFrameworkCore package
  - ✅ Updated CREATE_DATABASE.sql with ASP.NET Identity tables
  - ✅ Configured password policies (8+ chars, uppercase, lowercase, digit required)
  
- **2024-11-14**: Backend implementation
  - ✅ Created .NET 8 Web API backend with Entity Framework Core 8
  - ✅ Implemented 14 entity models with proper relationships (Person, PersonName, Union, etc.)
  - ✅ Configured ApplicationDbContext with JSONB, tsvector, pg_trgm for full-text search
  - ✅ Created database schema using EnsureCreated (migrations pending CLI availability)
  - ✅ Seeded demo data: Smith Family Tree org, admin user, sample person
  - ✅ Implemented JWT authentication with access/refresh tokens
  - ✅ Created authentication API endpoints (/api/auth/login, /register, /refresh, /revoke)
  - Frontend: Angular 20 frontend with standalone components configured

## Tech Stack

### Backend
- .NET 8 Web API
- Entity Framework Core 8 with PostgreSQL
- ASP.NET Identity (long/int8 user IDs)
- UserManager/SignInManager for user operations
- JWT authentication with access/refresh tokens (baseline-style tokenOptions)
- Redis caching with distributed sessions (optional, in-memory fallback)
- Health Checks (PostgreSQL + Redis monitoring)
- Serilog structured logging (file + console with enrichers)
- VirtualUpon.Storage multi-provider support (Local/AWS/Linode/Nextcloud/Cloudflare)
- FluentValidation for validation
- Swagger/OpenAPI documentation

### Frontend
- Angular 20 (standalone components)
- TypeScript
- RxJS for reactive programming
- SCSS for styling
- TailwindCSS (planned)
- Angular Material (planned)

### Database
- PostgreSQL 16+ (Replit built-in / Neon)
- ASP.NET Identity tables (AspNetUsers with BIGINT IDs)
- Full-text search (tsvector, pg_trgm)
- JSONB for extensible metadata
- GIN/GIST indexes for performance

## Project Architecture

### Backend Structure (`/backend/FamilyTreeApi/`)
```
FamilyTreeApi/
├── Program.cs              # Application entry point with JWT config
├── appsettings.json        # Configuration
├── Controllers/
│   └── AuthController.cs   # Authentication endpoints
├── Models/                 # Domain entities
│   ├── ApplicationUser.cs  # IdentityUser<long> with custom properties
│   ├── Person.cs
│   ├── PersonName.cs
│   ├── Union.cs, UnionMember.cs
│   ├── ParentChild.cs
│   ├── OrgUser.cs         # UserId: long (references AspNetUsers)
│   ├── Org.cs
│   ├── Media.cs, Source.cs, Place.cs, Tag.cs
│   ├── AuditLog.cs        # ActorId: long (references AspNetUsers)
│   └── Enums/              # Entity enums
├── Data/
│   └── ApplicationDbContext.cs  # EF Core DbContext
├── Services/
│   ├── IAuthService.cs
│   └── AuthService.cs      # UserManager/SignInManager + JWT
├── DTOs/
│   └── AuthDTOs.cs         # Login/Register/Token DTOs
└── Validators/             # FluentValidation rules (planned)
```

### Frontend Structure (`/frontend/src/`)
```
src/
├── app/
│   ├── core/              # Core services, auth, guards (planned)
│   ├── people/            # Person management components (planned)
│   ├── tree/              # Tree visualization (planned)
│   ├── relations/         # Relationship editors (planned)
│   ├── media/             # Media upload/gallery (planned)
│   ├── shared/            # Shared components (planned)
│   └── app.ts             # Root component
├── assets/                # Static assets
└── styles.scss            # Global styles
```

## Core Features (MVP)

### Person Management
- Multi-script names (Latin/Arabic/Nobiin)
- Multiple name variants (aliases, maiden names)
- Flexible date precision (exact/about/between/unknown)
- Birth/death events with places
- Privacy levels and visibility controls

### Relationship Modeling
- Parent-child relationships (biological, adoptive, step, foster)
- Unions/marriages supporting polygamy
- Relationship certainty and source tracking
- Cycle detection and validation

### Media Management
- Upload images, documents, video
- Thumbnail generation
- Person tagging
- Metadata and copyright tracking

### Tree Visualization
- Pedigree view (ancestors)
- Descendant view
- Pan/zoom navigation
- Lazy loading for large trees

### Search & Discovery
- Name and alias search
- Phonetic matching (Soundex/Double Metaphone)
- Full-text search with PostgreSQL
- Date/place filtering

### Multi-Tenant & Security
- Organization-based tenancy
- Role-based access control (Owner/Admin/Editor/Contributor/Viewer)
- Per-entity privacy rules
- JWT authentication

### Audit & Versioning
- Full event-sourced audit log
- Change tracking with diffs
- Entity-level undo/restore

### Import/Export
- GEDCOM 5.5.1/7.0 import/export
- Duplicate detection
- Conflict resolution

### Internationalization
- English, Arabic, Nobiin support
- RTL layouts
- Multi-script data entry
- WCAG 2.1 AA accessibility

## Development Workflow

### Running the Application
The frontend runs automatically via the configured workflow on port 5000.

To run the backend API manually:
```bash
cd backend/FamilyTreeApi
dotnet run
```

### Database Migrations
```bash
cd backend/FamilyTreeApi
dotnet ef migrations add MigrationName
dotnet ef database update
```

### Frontend Development
```bash
cd frontend
npm start              # Runs on port 5000
npm run build          # Production build
```

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (Replit managed / Neon)
- `SESSION_SECRET`: JWT signing key for JWT tokens
- Identity tables: Managed automatically by EF Core

## User Preferences
- Language support: English, Arabic, Nobiin (all three required)
- RTL layout support for Arabic and Nobiin
- Multi-script person name entry

## Next Steps
1. Set up PostgreSQL database with Replit's built-in tool
2. Create EF Core entity models
3. Generate database migrations
4. Implement authentication
5. Build Person management APIs
6. Create Angular person components
7. Implement tree visualization
8. Add search functionality

## Notes
- Backend API runs on port 8080 (configured in Program.cs)
- Frontend on port 5000 is exposed via Replit proxy
- Database uses Replit's built-in PostgreSQL (Neon-backed)
- All dates support multiple calendar systems (Gregorian, Hijri, Ethiopic)
- User IDs are long (int8) via ASP.NET Identity, not Guid
- Password requirements: 8+ chars, uppercase, lowercase, digit (configurable in Program.cs)

## Important Files for Integration
- **`backend/BASELINE_INTEGRATION_SUMMARY.md`**: Quick summary of integration approach
- **`backend/INTEGRATION_GUIDE.md`**: Complete step-by-step integration guide
- **`backend/STORAGE_SETUP.md`**: VirtualUpon.Storage integration instructions
- **`backend/MEDIA_SERVICE_GUIDE.md`**: Media upload/download with frontend examples (NEW)
- **`backend/CREATE_DATABASE_UINT.sql`**: PostgreSQL schema for uint (INTEGER) IDs
- **`backend/CREATE_DATABASE.sql`**: PostgreSQL schema for long (BIGINT) IDs (reference only)
- **`backend/IDENTITY_MIGRATION.md`**: ASP.NET Identity details (reference)
- **`backend/API_DOCUMENTATION.md`**: Complete API endpoint reference

## Integration Approach
The Family Tree code was built with `long` (BIGINT) user IDs but your baseline uses `uint` (INTEGER) IDs. The integration guide provides:
1. How to update 2 models (OrgUser, AuditLog) to use `uint` instead of `long`
2. How to update 5 controllers to parse `uint` user IDs from JWT claims
3. How to merge Family Tree entities into your existing ApplicationDbContext
4. How to use your existing JWT, Storage, and Redis infrastructure
5. Database schema that matches your INTEGER user IDs
