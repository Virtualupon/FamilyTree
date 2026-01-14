# Full-Codebase Localization Audit Report
## FamilyTree Application - Angular 20 + .NET Core 8

---

# A) EXECUTIVE SUMMARY

## Current i18n Architecture

### Frontend (Angular 20)
- **Library**: `@ngx-translate/core` v17.0.0 with HTTP loader
- **Translation Files**: JSON files at `src/assets/i18n/{en,ar,nob}.json`
- **Languages**: English (en), Arabic (ar), Nobiin (nob)
- **Storage**: `localStorage['family_tree_language']`
- **RTL Support**: Yes, with signal-based direction switching
- **Coverage**: ~600+ translation keys

### Backend (.NET Core 8)
- **Localization**: No server-side localization implemented
- **User Preference**: Stored in `AspNetUsers.PreferredLanguage`
- **API Responses**: Returns hardcoded English error messages
- **Pattern**: Partially uses i18n keys for relationships (RelationshipNamer)

## Critical Gaps Causing Language Mismatches

1. **Backend returns English error messages** - All controller/service error messages are hardcoded English
2. **Frontend snackBar/confirm dialogs use hardcoded strings** - 30+ instances
3. **Form labels not translated** - Many mat-label elements have hardcoded text
4. **Validation messages hardcoded** - Both client and server-side
5. **No centralized error handling** - Each file handles errors differently

## Top 10 Critical Issues to Fix First

| # | Issue | Files | Severity |
|---|-------|-------|----------|
| 1 | SnackBar messages hardcoded | 11 files, 21 instances | CRITICAL |
| 2 | confirm() dialogs hardcoded | 5 files, 9 instances | CRITICAL |
| 3 | Backend error messages in English | 15 files, 80+ instances | CRITICAL |
| 4 | mat-label hardcoded text | 8 files, 22 instances | HIGH |
| 5 | Register form validation errors | register.component.ts | HIGH |
| 6 | Add relationship dialog labels | add-relationship-dialog.component.ts | HIGH |
| 7 | Admin panel labels | admin-panel.component.ts | HIGH |
| 8 | Person media component | person-media.component.ts | HIGH |
| 9 | Auth service exceptions | AuthService.cs | MEDIUM |
| 10 | Permission error messages | 5 service files | MEDIUM |

---

# B) FULL REPO i18n AUDIT REPORT

## 1) Angular Templates - Hardcoded Strings

### person-media.component.ts
```
[CRITICAL] Line 83 | Hardcoded: "Loading media..." | Where: Loading state | Fix: key=media.loading
[CRITICAL] Line 97 | Hardcoded: "No media files" | Where: Empty state | Fix: key=media.noFiles
[CRITICAL] Line 98 | Hardcoded: "Upload images, audio, or video files for this person." | Where: Empty hint | Fix: key=media.uploadHint
[HIGH] Line 335 | Hardcoded: mat-label "Description (optional)" | Where: Upload dialog | Fix: key=media.description
[HIGH] Line 347 | Hardcoded: "Tag People in This Media" | Where: Upload dialog | Fix: key=media.tagPeople
[HIGH] Line 352 | Hardcoded: mat-label "Search people to tag" | Where: Upload dialog | Fix: key=media.searchPeopleToTag
[HIGH] Line 383 | Hardcoded: "Searching..." | Where: Search spinner | Fix: key=common.searching
[HIGH] Line 411 | Hardcoded: 'No people found matching "{{ personSearchQuery }}"' | Where: Search results | Fix: key=media.noPeopleMatching params={query}
[MEDIUM] Line 338 | Hardcoded: placeholder "Add a description for this media..." | Where: Input | Fix: key=media.descriptionPlaceholder
[MEDIUM] Line 356 | Hardcoded: placeholder "Type a name to search..." | Where: Input | Fix: key=media.searchNamePlaceholder
```

### add-relationship-dialog.component.ts
```
[CRITICAL] Lines 75-79 | Hardcoded: "Add Parent/Child/Spouse/Sibling" | Where: Dialog title | Fix: key=relationships.addParent/Child/Spouse/Sibling
[HIGH] Line 86 | Hardcoded: mat-label "Select Town First" | Where: Town select | Fix: key=relationships.selectTownFirst
[HIGH] Line 94 | Hardcoded: "Loading towns..." | Where: Loading state | Fix: key=relationships.loadingTowns
[HIGH] Line 100 | Hardcoded: "Please select a town to search..." | Where: Hint text | Fix: key=relationships.selectTownHint
[HIGH] Line 107 | Hardcoded: mat-label "Search for a person" | Where: Search field | Fix: key=relationships.searchPerson
[HIGH] Line 135 | Hardcoded: "Searching..." | Where: Search spinner | Fix: key=common.searching
[HIGH] Line 139 | Hardcoded: "No results found" | Where: Empty results | Fix: key=common.noResults
[HIGH] Line 161 | Hardcoded: mat-label "Select Shared Parent" | Where: Sibling dialog | Fix: key=relationships.selectSharedParent
[HIGH] Line 183 | Hardcoded: "This person has no parents recorded..." | Where: Warning | Fix: key=relationships.noParentsWarning
[HIGH] Line 190 | Hardcoded: mat-label "Family Relationship" | Where: Form field | Fix: key=relationships.familyRelationship
[HIGH] Line 241 | Hardcoded: mat-label "Relationship Nature" | Where: Form field | Fix: key=relationships.relationshipNature
[HIGH] Lines 243-248 | Hardcoded: "Biological/Adopted/Foster/Step/Guardian/Unknown" | Where: Options | Fix: key=relationships.biological etc.
[HIGH] Line 258 | Hardcoded: mat-label "Union Type" | Where: Form field | Fix: key=relationships.unionType
[HIGH] Lines 260-265 | Hardcoded: "Marriage/Civil Union/Domestic Partnership..." | Where: Options | Fix: key=unions.marriage etc.
[HIGH] Line 271 | Hardcoded: mat-label "Start Date" | Where: Form field | Fix: key=common.startDate
[HIGH] Line 278 | Hardcoded: mat-label "End Date (if applicable)" | Where: Form field | Fix: key=common.endDate
[HIGH] Line 289 | Hardcoded: mat-label "Notes (optional)" | Where: Form field | Fix: key=common.notes
[MEDIUM] Line 112 | Hardcoded: placeholder "Type name to search..." | Where: Input | Fix: key=relationships.typeNameSearch
[MEDIUM] Line 194 | Hardcoded: placeholder "Type to search in English, Arabic, or Nubian..." | Where: Input | Fix: key=relationships.typeSearchMultiLang
```

### register.component.ts
```
[CRITICAL] Line 41 | Hardcoded: "Create your account" | Where: Page subtitle | Fix: key=auth.createAccount
[HIGH] Line 49 | Hardcoded: mat-label "First Name" | Where: Form | Fix: key=common.firstName
[HIGH] Line 53 | Hardcoded: mat-error "First name is required" | Where: Validation | Fix: key=validation.firstNameRequired
[HIGH] Line 58 | Hardcoded: mat-label "Last Name" | Where: Form | Fix: key=common.lastName
[HIGH] Line 62 | Hardcoded: mat-error "Last name is required" | Where: Validation | Fix: key=validation.lastNameRequired
[HIGH] Line 68 | Hardcoded: mat-label "Email" | Where: Form | Fix: key=common.email
[HIGH] Line 72 | Hardcoded: mat-error "Email is required" | Where: Validation | Fix: key=validation.emailRequired
[HIGH] Line 75 | Hardcoded: mat-error "Invalid email format" | Where: Validation | Fix: key=validation.invalidEmail
[HIGH] Line 80 | Hardcoded: mat-label "Password" | Where: Form | Fix: key=common.password
[HIGH] Line 84 | Hardcoded: mat-error "Password is required" | Where: Validation | Fix: key=validation.passwordRequired
[HIGH] Line 87 | Hardcoded: mat-error "Password must be at least 6 characters" | Where: Validation | Fix: key=validation.passwordMinLength
[HIGH] Line 100 | Hardcoded: button "Create Account" | Where: Submit button | Fix: key=auth.createAccount
[HIGH] Line 106 | Hardcoded: "Already have an account? Login here" | Where: Link text | Fix: key=auth.alreadyHaveAccount params + auth.loginHere
```

### admin-panel.component.ts
```
[HIGH] Line 387 | Hardcoded: mat-label "Max Persons to Process" | Where: Transliteration form | Fix: key=admin.maxPersonsToProcess
[HIGH] Line 504 | Hardcoded: mat-card-title "Create New User" | Where: Modal title | Fix: key=admin.createNewUser
[HIGH] Line 508 | Hardcoded: mat-label "Email" | Where: Form | Fix: key=common.email
[HIGH] Line 514 | Hardcoded: mat-label "Password" | Where: Form | Fix: key=common.password
[HIGH] Line 524 | Hardcoded: mat-label "First Name" | Where: Form | Fix: key=common.firstName
[HIGH] Line 530 | Hardcoded: mat-label "Last Name" | Where: Form | Fix: key=common.lastName
[HIGH] Line 536 | Hardcoded: mat-label "System Role" | Where: Form | Fix: key=admin.systemRole
[HIGH] Lines 538-540 | Hardcoded: "User/Admin/SuperAdmin" | Where: Options | Fix: key=roles.user/admin/superAdmin
[HIGH] Line 553 | Hardcoded: button "Cancel" | Where: Modal | Fix: key=common.cancel
[HIGH] Line 558 | Hardcoded: button "Create User" | Where: Modal | Fix: key=admin.createUser
[MEDIUM] Line 509 | Hardcoded: placeholder "user@example.com" | Where: Input | Fix: key=admin.emailPlaceholder
```

### assign-town-dialog.component.ts
```
[HIGH] Line 38 | Hardcoded: mat-dialog-title "Assign Admin to Town" | Where: Dialog title | Fix: key=admin.assignAdminToTown
[HIGH] Line 42 | Hardcoded: hint text "Assigning an admin..." | Where: Dialog hint | Fix: key=admin.assignAdminHint
[HIGH] Line 51 | Hardcoded: mat-label "Select Admin" | Where: Form | Fix: key=admin.selectAdmin
[HIGH] Line 63 | Hardcoded: mat-label "Select Town" | Where: Form | Fix: key=admin.selectTown
[HIGH] Line 77 | Hardcoded: mat-option "No towns available" | Where: Empty state | Fix: key=admin.noTownsAvailable
[HIGH] Line 80 | Hardcoded: mat-hint "Towns are geographic locations" | Where: Hint | Fix: key=admin.townsHint
[HIGH] Line 85 | Hardcoded: button "Cancel" | Where: Dialog | Fix: key=common.cancel
[HIGH] Line 89 | Hardcoded: button "Assign Town" | Where: Dialog | Fix: key=admin.assignTown
```

### person-form-dialog.component.ts
```
[HIGH] Line 263 | Hardcoded: mat-label "الاسم بالعربية (Arabic Name)" | Where: Form | Fix: key=personForm.nameArabic
[HIGH] Line 271 | Hardcoded: mat-label "Name in English" | Where: Form | Fix: key=personForm.nameEnglish
[HIGH] Line 279 | Hardcoded: mat-label "ⲣⲁⲛ ⲛⲟⲃⲓⲓⲛ (Nobiin Name)" | Where: Form | Fix: key=personForm.nameNobiin
```

### person-links.component.ts
```
[HIGH] Line 91 | Hardcoded: "Search" button text | Where: Search button | Fix: key=common.search
[HIGH] Line 105 | Hardcoded: "Unknown" | Where: Person name fallback | Fix: key=common.unknown
[HIGH] Line 108 | Hardcoded: "Born: " | Where: Birth info | Fix: key=person.born
[MEDIUM] Line 84 | Hardcoded: placeholder "Search by name..." | Where: Input | Fix: key=links.searchByName
[MEDIUM] Line 173 | Hardcoded: placeholder "Optional notes about this link..." | Where: Input | Fix: key=links.notesPlaceholder
```

### pending-links.component.ts
```
[HIGH] Line 118 | Hardcoded: button "Cancel" | Where: Modal | Fix: key=common.cancel
[HIGH] Line 125 | Hardcoded: buttons "Approve" / "Reject" | Where: Action buttons | Fix: key=common.approve / common.reject
[MEDIUM] Line 110 | Hardcoded: placeholder "Add a note about your decision..." | Where: Input | Fix: key=links.decisionNotesPlaceholder
```

---

## 2) Angular TS Strings (SnackBar, confirm, errors)

### SnackBar Messages

| File | Line | Hardcoded String | Fix Key |
|------|------|------------------|---------|
| register.component.ts | 348 | "Registration successful!" | auth.registerSuccess |
| register.component.ts | 355 | "Registration failed" | auth.registerFailed |
| login.component.ts | 367 | "Login failed" | auth.loginFailed |
| person-media.component.ts | 1093 | "Unsupported file type: ${file.type}" | media.unsupportedFileType |
| person-media.component.ts | 1275 | "Upload failed" | media.uploadFailed |
| person-media.component.ts | 1283 | "Failed to process file" | media.failedProcessFile |
| person-media.component.ts | 1328 | "Failed to load media" | media.failedLoadMedia |
| person-media.component.ts | 1360 | "Failed to download media" | media.failedDownloadMedia |
| person-media.component.ts | 1378 | "Media deleted" | media.deleted |
| person-media.component.ts | 1383 | "Failed to delete media" | media.failedDeleteMedia |
| person-detail.component.ts | 723 | "Relationship added successfully" | relationships.addedSuccess |
| person-detail.component.ts | 734 | "Parent removed" | relationships.parentRemoved |
| person-detail.component.ts | 737 | "Failed to remove parent" | relationships.failedRemoveParent |
| person-detail.component.ts | 749 | "Child removed" | relationships.childRemoved |
| person-detail.component.ts | 752 | "Failed to remove child" | relationships.failedRemoveChild |
| person-detail.component.ts | 764 | "Relationship removed" | relationships.removed |
| person-detail.component.ts | 767 | "Failed to remove relationship" | relationships.failedRemove |
| person-detail.component.ts | 787 | "Person updated successfully" | person.updatedSuccess |
| person-detail.component.ts | 800 | "Person deleted" | person.deleted |
| person-detail.component.ts | 804 | "Failed to delete person" | person.failedDelete |

### confirm() Dialogs

| File | Line | Hardcoded String | Fix Key + Params |
|------|------|------------------|------------------|
| admin-panel.component.ts | 1188 | "Remove ${userName} from ${townName}?" | admin.confirmRemoveTownAssignment {user, town} |
| tree-settings.component.ts | 428 | "Remove ${email} from this tree?" | trees.confirmRemoveMember {email} |
| tree-settings.component.ts | 457 | "Revoke invitation for ${email}?" | trees.confirmRevokeInvitation {email} |
| tree-settings.component.ts | 466 | 'Are you sure you want to delete "${name}"?' | trees.confirmDelete {name} |
| person-links.component.ts | 296 | "Delete this link?" | links.confirmDelete |
| person-detail.component.ts | 730 | "Remove ${name} as a parent?" | person.confirmRemoveParent {name} |
| person-detail.component.ts | 745 | "Remove ${name} as a child?" | person.confirmRemoveChild {name} |
| person-detail.component.ts | 760 | "Remove this spouse/partner relationship?" | person.confirmRemoveSpouse |
| person-detail.component.ts | 797 | "Are you sure you want to delete this person?" | person.confirmDelete |

### Error Messages in catch blocks

| File | Line | Hardcoded String | Fix Key |
|------|------|------------------|---------|
| admin-panel.component.ts | 1182 | "Failed to load towns. Please try again." | admin.failedLoadTowns |
| admin-panel.component.ts | 1192 | "Failed to remove town assignment" | admin.failedRemoveTownAssignment |
| admin-panel.component.ts | 1198 | "Email and password are required" | validation.emailPasswordRequired |
| tree-settings.component.ts | 432 | "Failed to remove member" | trees.failedRemoveMember |
| tree-settings.component.ts | 450 | "Failed to send invitation" | trees.failedSendInvitation |
| tree-settings.component.ts | 471 | "Failed to delete tree" | trees.failedDelete |

---

## 3) Angular Material Strings

### MatPaginator Internationalization
- **Status**: NOT CONFIGURED - using default English labels
- **Fix**: Implement custom `MatPaginatorIntl` provider with translations
- **Keys needed**: paginator.itemsPerPage, paginator.nextPage, paginator.previousPage, paginator.firstPage, paginator.lastPage, paginator.of

### MatDatepicker Localization
- **Status**: NOT CONFIGURED - using default locale
- **Fix**: Configure `DateAdapter` with correct locale based on language
- **Add**: MAT_DATE_LOCALE provider with dynamic locale switching

---

## 4) Routing Titles/Breadcrumbs

### Router Config
- **Status**: No hardcoded route titles found (routes use components with translated content)
- **Recommendation**: If page titles are added, use `TranslateService` in route resolvers

---

## 5) Form Validation Messages (Client)

### Currently Hardcoded in Templates

| Component | Validation | Hardcoded Message | Fix Key |
|-----------|------------|-------------------|---------|
| register.component.ts | firstName required | "First name is required" | validation.firstNameRequired |
| register.component.ts | lastName required | "Last name is required" | validation.lastNameRequired |
| register.component.ts | email required | "Email is required" | validation.emailRequired |
| register.component.ts | email format | "Invalid email format" | validation.invalidEmail |
| register.component.ts | password required | "Password is required" | validation.passwordRequired |
| register.component.ts | password minLength | "Password must be at least 6 characters" | validation.passwordMinLength |

### Recommended Pattern
Create validation message service that maps FormControl errors to translation keys.

---

## 6) .NET API Responses with Display Text

### Controllers Returning English Messages

| Controller | Method | Hardcoded Message | Recommendation |
|------------|--------|-------------------|----------------|
| UserController | UpdateLanguage | "Language is required" | Return error code |
| UserController | UpdateLanguage | "Invalid language" | Return error code |
| AuthController | Login | "An error occurred during login" | Return error code |
| AuthController | Register | "An error occurred during registration" | Return error code |
| GedcomController | Preview | "No file provided" | Return error code |
| GedcomController | Preview | "File must be a GEDCOM file" | Return error code |
| PersonSearchController | Search | "Search query 'q' is required" | Return error code |
| PersonSearchController | Calculate | "Same person" | Return i18n key |
| MediaUploadController | Upload | "Failed to upload media" | Return error code |
| TransliterationController | Transliterate | "Input name is required" | Return error code |

**Total Backend Error Messages**: 80+

---

## 7) .NET Validation Messages (DataAnnotations)

### Currently Not Using Localized Messages
- **Status**: No DataAnnotations with error messages found
- **Models use**: Required, MaxLength without custom messages
- **Fix**: Add ErrorMessage resources if needed

---

## 8) Exceptions/ProblemDetails/Middleware

### Service Exceptions (AuthService.cs)
```
[HIGH] Line 41 | "Invalid email or password" | auth.error.invalidCredentials
[HIGH] Line 74 | "Email already registered" | auth.error.emailExists
[HIGH] Line 92 | "Registration failed: {errors}" | auth.error.registrationFailed
[HIGH] Line 122 | "Invalid or expired refresh token" | auth.error.invalidToken
```

### Service Exceptions (AdminService.cs)
```
[HIGH] Line 117 | "Invalid system role" | admin.error.invalidRole
[HIGH] Line 125 | "A user with this email already exists" | admin.error.emailExists
[HIGH] Line 191 | "Cannot change your own system role" | admin.error.cannotChangeOwnRole
[HIGH] Line 340 | "User must have Admin system role" | admin.error.requiresAdminRole
```

### Service Exceptions (FamilyTreeService.cs)
```
[HIGH] Line 644 | "You do not have permission to view invitations" | error.permission.viewInvitations
[HIGH] Line 684 | "You do not have permission to create invitations" | error.permission.createInvitations
```

### Service Exceptions (ParentChildService.cs)
```
[HIGH] Line 169 | "You must be a member of an organization" | error.permission.requiresMembership
[HIGH] Line 190 | "This parent-child relationship already exists" | relationships.error.alreadyExists
```

---

## 9) Export/Report/Email Templates

### Current Status
- No email templates found in codebase
- GEDCOM export uses raw data, no localized labels
- No PDF/CSV generation with hardcoded headers found

---

## 10) Shared Constants/Enums/Status Labels

### Enum Conversions in Backend
```
[MEDIUM] ParentChildService.cs:217 | parent.Sex.ToString() returns "Male"/"Female" | Use localization key
[MEDIUM] MediaUploadController.cs:50 | media.Kind.ToString() returns enum name | Use localization key
```

### RelationshipNamer.cs (GOOD PATTERN)
- Returns i18n keys like "relationship.father", "relationship.mother"
- Frontend translates using these keys
- **This is the correct pattern to follow**

---

# C) PROPOSED TARGET ARCHITECTURE

## Option 1: UI-Only Translations (RECOMMENDED)

**Architecture**: Backend returns error codes/keys, frontend translates everything

### How it works:
```typescript
// Backend returns:
{ "error": { "code": "auth.invalidCredentials" } }

// Frontend handles:
this.snackBar.open(this.i18n.t(error.code), 'Close');
```

### Pros:
- Single source of truth for translations (frontend JSON files)
- Simpler backend - no resource files needed
- Easy to add new languages without backend deployment
- Already partially implemented (RelationshipNamer pattern)

### Cons:
- Requires frontend update for every error message change
- Backend logs show codes not human-readable text

### Implementation for:
- **Enums/Status**: Return string keys, frontend translates
- **Dropdown lists from API**: Return data objects, frontend uses I18nService.getTownName() etc.
- **Server validation errors**: Return field name + error code, frontend maps to localized message
- **Fallback**: If key not found, display key itself (dev mode) or generic message (prod)

---

## Option 2: Dual-Layer Localization

**Architecture**: Backend localizes errors via resx; frontend localizes UI

### How it works:
```csharp
// Backend uses IStringLocalizer:
return BadRequest(_localizer["InvalidCredentials"]);
```

### Pros:
- Backend errors are localized server-side
- Email templates can be localized on backend
- Full .NET localization support

### Cons:
- Duplicate translation maintenance (frontend JSON + backend resx)
- More complex backend setup
- Language sync issues between frontend/backend

---

## RECOMMENDATION: Option 1

The codebase already uses Option 1 pattern partially (RelationshipNamer returns i18n keys). Extend this pattern to all error messages for consistency.

---

# D) FIX PLAN (PR-Sized Steps)

## Phase 1: Frontend Critical Fixes (3 PRs)

### PR 1.1: Add Missing Translation Keys
**Files**: `src/assets/i18n/{en,ar,nob}.json`
**Changes**:
- Add all keys identified in Section B
- Estimated: 100+ new keys per language file

**Verification**:
- [ ] All keys exist in all 3 language files
- [ ] Keys follow naming convention (namespace.feature.item)
- [ ] No duplicate keys

### PR 1.2: Update SnackBar/Confirm Dialogs
**Files**:
- `person-detail.component.ts`
- `person-media.component.ts`
- `register.component.ts`
- `login.component.ts`
- `admin-panel.component.ts`
- `tree-settings.component.ts`
- `person-links.component.ts`

**Changes**:
```typescript
// Before:
this.snackBar.open('Registration successful!', 'Close');

// After:
this.snackBar.open(this.i18n.t('auth.registerSuccess'), this.i18n.t('common.close'));
```

**Verification**:
- [ ] No hardcoded strings in snackBar.open()
- [ ] No hardcoded strings in confirm()
- [ ] Switch language and verify messages change

### PR 1.3: Update Form Labels and Validation
**Files**:
- `register.component.ts`
- `add-relationship-dialog.component.ts`
- `admin-panel.component.ts`
- `assign-town-dialog.component.ts`
- `person-form-dialog.component.ts`
- `person-media.component.ts`

**Changes**:
```html
<!-- Before: -->
<mat-label>Email</mat-label>
<mat-error>Email is required</mat-error>

<!-- After: -->
<mat-label>{{ 'common.email' | translate }}</mat-label>
<mat-error>{{ 'validation.emailRequired' | translate }}</mat-error>
```

**Verification**:
- [ ] No hardcoded mat-label text
- [ ] No hardcoded mat-error text
- [ ] No hardcoded placeholder text
- [ ] Switch language and verify all form elements change

---

## Phase 2: Backend Error Code Pattern (2 PRs)

### PR 2.1: Create Error Response Service
**Files**:
- Create: `Services/ErrorResponseService.cs`
- Create: `DTOs/ErrorResponse.cs`

**Changes**:
```csharp
public class ErrorResponse
{
    public string Code { get; set; }  // e.g., "auth.invalidCredentials"
    public string? Field { get; set; } // For validation errors
    public Dictionary<string, object>? Params { get; set; } // For interpolation
}

public class ErrorResponseService
{
    public BadRequestObjectResult BadRequest(string code, string? field = null)
        => new BadRequestObjectResult(new ErrorResponse { Code = code, Field = field });
}
```

**Verification**:
- [ ] ErrorResponse model created
- [ ] Service injectable in controllers

### PR 2.2: Update Controllers to Use Error Codes
**Files**:
- `Controllers/UserController.cs`
- `Controllers/AuthController.cs`
- `Controllers/GedcomController.cs`
- `Controllers/PersonSearchController.cs`
- `Controllers/MediaUploadController.cs`
- `Controllers/TransliterationController.cs`

**Changes**:
```csharp
// Before:
return BadRequest(new { message = "Language is required" });

// After:
return _errorService.BadRequest("error.language.required");
```

**Verification**:
- [ ] No hardcoded English messages in controller responses
- [ ] All errors return consistent ErrorResponse format
- [ ] Frontend can handle new error format

---

## Phase 3: Service Layer Updates (2 PRs)

### PR 3.1: Create ServiceResult with Error Codes
**Files**:
- Update: `Services/Common/ServiceResult.cs`
- Update all services using ServiceResult

**Changes**:
```csharp
public class ServiceResult<T>
{
    public string? ErrorCode { get; set; }
    public Dictionary<string, object>? ErrorParams { get; set; }

    public static ServiceResult<T> Failure(string errorCode, Dictionary<string, object>? @params = null)
        => new() { ErrorCode = errorCode, ErrorParams = @params };
}
```

### PR 3.2: Update Services to Use Error Codes
**Files**: All service files (15+)

**Changes**:
```csharp
// Before:
return ServiceResult<T>.Failure("Email already registered");

// After:
return ServiceResult<T>.Failure("auth.error.emailExists");
```

---

## Phase 4: Angular Material Localization (1 PR)

### PR 4.1: Configure Material Internationalization
**Files**:
- Create: `src/app/core/i18n/mat-paginator-intl.ts`
- Update: `src/app/app.config.ts`

**Changes**:
```typescript
@Injectable()
export class LocalizedPaginatorIntl extends MatPaginatorIntl {
  constructor(private i18n: I18nService) {
    super();
    this.itemsPerPageLabel = i18n.t('paginator.itemsPerPage');
    // ... other labels
  }
}

// In app.config.ts:
{ provide: MatPaginatorIntl, useClass: LocalizedPaginatorIntl }
```

---

## Phase 5: Validation & Guardrails (1 PR)

### PR 5.1: Add ESLint Rules and CI Checks
**Files**:
- Update: `.eslintrc.json`
- Create: `scripts/check-i18n.js`
- Update: CI pipeline

---

# E) STANDARDS + GUARDRAILS

## 1) Translation Key Naming Standard

### Namespaces by Feature
```
app.*              - Global app strings (title, platform)
common.*           - Shared UI elements (save, cancel, loading)
auth.*             - Authentication
nav.*              - Navigation
validation.*       - Form validation messages
error.*            - Error messages
admin.*            - Admin panel
person.*           - Person management
personForm.*       - Person form fields
personDetail.*     - Person detail page
relationships.*    - Relationship management
unions.*           - Union/marriage types
media.*            - Media management
trees.*            - Family tree management
towns.*            - Town management
families.*         - Family management
links.*            - Cross-tree linking
paginator.*        - Material paginator
roles.*            - User roles
```

### Naming Convention
- Use **camelCase** for keys: `auth.loginFailed`
- Use **dot notation** for hierarchy: `personDetail.tabs.family`
- Keep keys **descriptive but concise**: `validation.emailRequired` not `validation.theEmailFieldIsRequired`

### No Duplicates Rule
- Each unique string should have ONE key
- Use parameters for variable content: `"confirmDelete": "Delete {{name}}?"`

---

## 2) Interpolation/Plurals/Gender Rules

### Interpolation
```json
{
  "greeting": "Hello, {{name}}!",
  "itemCount": "{{count}} items",
  "confirmRemove": "Remove {{name}} from {{location}}?"
}
```

### Plurals (if needed - ngx-translate supports ICU format)
```json
{
  "itemsFound": "{count, plural, =0 {No items} =1 {1 item} other {# items}}"
}
```

### Gender (if needed)
```json
{
  "relationship.parent": "{gender, select, male {Father} female {Mother} other {Parent}}"
}
```

---

## 3) Locale Formatting Rules

### Dates
- Always use `DatePipe` with locale parameter
- Configure `LOCALE_ID` provider dynamically based on language
- Arabic: Use Hijri calendar option if needed

### Numbers
- Use `DecimalPipe` with locale
- Arabic: Use Arabic-Indic numerals option

### Currency
- Use `CurrencyPipe` with locale
- Not applicable to this app currently

---

## 4) Guardrails

### ESLint Rules (Angular)
```json
{
  "rules": {
    "@angular-eslint/template/no-hardcoded-strings": "warn",
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='open'][callee.object.property.name='snackBar'] > Literal",
        "message": "Use i18n.t() for snackBar messages"
      }
    ]
  }
}
```

### CI Script
```bash
#!/bin/bash
# check-i18n.sh

# Find hardcoded strings in templates
grep -rn "\"[A-Z][a-z]" src/app --include="*.ts" | grep -v "translate\|i18n"

# Check all keys exist in all language files
node scripts/validate-i18n-keys.js
```

### Unit Tests
```typescript
describe('i18n', () => {
  it('should have all keys in all language files', () => {
    const en = require('../assets/i18n/en.json');
    const ar = require('../assets/i18n/ar.json');
    const nob = require('../assets/i18n/nob.json');

    const enKeys = getAllKeys(en);
    const arKeys = getAllKeys(ar);
    const nobKeys = getAllKeys(nob);

    expect(arKeys).toEqual(enKeys);
    expect(nobKeys).toEqual(enKeys);
  });
});
```

### E2E Tests
```typescript
describe('Language Switching', () => {
  it('should change UI when language is switched to Arabic', () => {
    cy.visit('/login');
    cy.get('[data-testid="language-select"]').click();
    cy.get('[data-testid="lang-ar"]').click();

    cy.get('h1').should('contain', 'شجرة العائلة');
    cy.get('[data-testid="login-button"]').should('contain', 'تسجيل الدخول');
  });
});
```

### Runtime Dev Warnings
```typescript
// In translate.pipe.ts transform method:
if (!translation || translation === key) {
  if (!environment.production) {
    console.warn(`Missing translation for key: ${key}`);
  }
}
```

---

# APPENDIX: Translation Keys to Add

## Required New Keys (for en.json)

```json
{
  "auth": {
    "createAccount": "Create your account",
    "alreadyHaveAccount": "Already have an account?",
    "loginHere": "Login here",
    "registerSuccess": "Registration successful!",
    "registerFailed": "Registration failed",
    "loginFailed": "Login failed"
  },
  "validation": {
    "firstNameRequired": "First name is required",
    "lastNameRequired": "Last name is required",
    "emailRequired": "Email is required",
    "invalidEmail": "Invalid email format",
    "passwordRequired": "Password is required",
    "passwordMinLength": "Password must be at least 6 characters",
    "emailPasswordRequired": "Email and password are required"
  },
  "admin": {
    "assignAdminToTown": "Assign Admin to Town",
    "assignAdminHint": "Assigning an admin to a town gives them access to all trees within that town.",
    "selectAdmin": "Select Admin",
    "selectTown": "Select Town",
    "noTownsAvailable": "No towns available",
    "townsHint": "Towns are geographic locations (cities/villages)",
    "assignTown": "Assign Town",
    "maxPersonsToProcess": "Max Persons to Process",
    "createNewUser": "Create New User",
    "systemRole": "System Role",
    "createUser": "Create User",
    "emailPlaceholder": "user@example.com",
    "failedLoadTowns": "Failed to load towns. Please try again.",
    "failedRemoveTownAssignment": "Failed to remove town assignment",
    "confirmRemoveTownAssignment": "Remove {{user}} from {{town}}?"
  },
  "relationships": {
    "addParent": "Add Parent",
    "addChild": "Add Child",
    "addSpouse": "Add Spouse/Partner",
    "addSibling": "Add Sibling",
    "selectTownFirst": "Select Town First",
    "loadingTowns": "Loading towns...",
    "selectTownHint": "Please select a town to search for people within that area.",
    "searchPerson": "Search for a person",
    "typeNameSearch": "Type name to search...",
    "typeSearchMultiLang": "Type to search in English, Arabic, or Nubian...",
    "selectSharedParent": "Select Shared Parent",
    "noParentsWarning": "This person has no parents recorded. Please add a parent first before adding siblings.",
    "familyRelationship": "Family Relationship",
    "relationshipNature": "Relationship Nature",
    "biological": "Biological",
    "adopted": "Adopted",
    "foster": "Foster",
    "step": "Step",
    "guardian": "Guardian",
    "unionType": "Union Type",
    "addedSuccess": "Relationship added successfully",
    "parentRemoved": "Parent removed",
    "failedRemoveParent": "Failed to remove parent",
    "childRemoved": "Child removed",
    "failedRemoveChild": "Failed to remove child",
    "removed": "Relationship removed",
    "failedRemove": "Failed to remove relationship"
  },
  "unions": {
    "marriage": "Marriage",
    "civilUnion": "Civil Union",
    "domesticPartnership": "Domestic Partnership",
    "commonLaw": "Common Law",
    "engagement": "Engagement",
    "unknown": "Unknown"
  },
  "media": {
    "loading": "Loading media...",
    "noFiles": "No media files",
    "uploadHint": "Upload images, audio, or video files for this person.",
    "description": "Description (optional)",
    "descriptionPlaceholder": "Add a description for this media...",
    "tagPeople": "Tag People in This Media",
    "searchPeopleToTag": "Search people to tag",
    "searchNamePlaceholder": "Type a name to search...",
    "noPeopleMatching": "No people found matching \"{{query}}\"",
    "unsupportedFileType": "Unsupported file type: {{type}}",
    "uploadFailed": "Upload failed",
    "failedProcessFile": "Failed to process file",
    "failedLoadMedia": "Failed to load media",
    "failedDownloadMedia": "Failed to download media",
    "deleted": "Media deleted",
    "failedDeleteMedia": "Failed to delete media",
    "confirmDelete": "Delete \"{{name}}\"?",
    "linkedMultiplePeople": "This media is linked to {{count}} people and will be removed for all of them."
  },
  "person": {
    "updatedSuccess": "Person updated successfully",
    "deleted": "Person deleted",
    "failedDelete": "Failed to delete person",
    "confirmRemoveParent": "Remove {{name}} as a parent?",
    "confirmRemoveChild": "Remove {{name}} as a child?",
    "confirmRemoveSpouse": "Remove this spouse/partner relationship?",
    "confirmDelete": "Are you sure you want to delete this person? This cannot be undone.",
    "born": "Born: "
  },
  "trees": {
    "confirmRemoveMember": "Remove {{email}} from this tree?",
    "confirmRevokeInvitation": "Revoke invitation for {{email}}?",
    "confirmDelete": "Are you sure you want to delete \"{{name}}\"? This cannot be undone.",
    "failedRemoveMember": "Failed to remove member",
    "failedSendInvitation": "Failed to send invitation",
    "failedDelete": "Failed to delete tree"
  },
  "links": {
    "searchByName": "Search by name...",
    "notesPlaceholder": "Optional notes about this link...",
    "decisionNotesPlaceholder": "Add a note about your decision...",
    "confirmDelete": "Delete this link?"
  },
  "roles": {
    "user": "User",
    "admin": "Admin",
    "superAdmin": "SuperAdmin"
  },
  "paginator": {
    "itemsPerPage": "Items per page",
    "nextPage": "Next page",
    "previousPage": "Previous page",
    "firstPage": "First page",
    "lastPage": "Last page",
    "of": "of"
  }
}
```

---

**Report Generated**: 2026-01-12
**Total Issues Found**: 200+ (Frontend: 120+, Backend: 80+)
**Estimated Fix Effort**: 5 PRs, ~40 files
