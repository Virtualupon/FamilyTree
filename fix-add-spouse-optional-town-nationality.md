# Fix: All Relationship Dialogs - Make Town Optional, Add Nationality Filter

## Affected Dialogs
- Add Spouse/Partner
- Add Parent (Father/Mother)
- Add Child
- Add Sibling
- Add Relationship (generic)
- Any other dialog that searches for a person

## Current Behavior
- Town is **required** before searching for a person
- Cannot find people from other countries or without a town assigned

## New Behavior
- Town is **optional**
- Add **Nationality** filter as alternative way to narrow search
- User can filter by: Town only, Nationality only, Both, or Neither (search all)

## UI Layout (Same for ALL relationship dialogs)

```
┌─────────────────────────────────────────────────────────┐
│  Add [Parent/Child/Spouse/Sibling]                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │ 🏘️ Town (optional)   ▼│  │ 🇪🇬 Nationality     ▼│      │
│  └─────────────────────┘  └─────────────────────┘      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔍 Search for a person                          │   │
│  └─────────────────────────────────────────────────┘   │
│  Tip: Select Town or Nationality to narrow results     │
│                                                         │
│  ... rest of form ...                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Strategy: Create Shared Person Search Component

Instead of duplicating code in each dialog, create a **reusable component** for person search with filters.

### Option A: Shared Component (Recommended)

Create one `PersonSearchComponent` that can be used in all relationship dialogs.

### Option B: Update Each Dialog Individually

Apply the same changes to each dialog separately.

---

## Shared Person Search Component (Recommended Approach)

### Step 1: Create Countries Reference Table (One-time setup)

**Migration:**

```csharp
public partial class AddCountriesTable : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Countries",
            columns: table => new
            {
                Code = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                NameEn = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                NameAr = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Countries", x => x.Code);
            });

        // Seed common countries
        migrationBuilder.InsertData(
            table: "Countries",
            columns: new[] { "Code", "NameEn", "NameAr" },
            values: new object[,]
            {
                { "EG", "Egypt", "مصر" },
                { "SA", "Saudi Arabia", "السعودية" },
                { "AE", "United Arab Emirates", "الإمارات" },
                { "US", "United States", "الولايات المتحدة" },
                { "GB", "United Kingdom", "المملكة المتحدة" },
                { "JO", "Jordan", "الأردن" },
                { "LB", "Lebanon", "لبنان" },
                { "SY", "Syria", "سوريا" },
                { "IQ", "Iraq", "العراق" },
                { "SD", "Sudan", "السودان" },
                { "KW", "Kuwait", "الكويت" },
                { "QA", "Qatar", "قطر" },
                { "BH", "Bahrain", "البحرين" },
                { "OM", "Oman", "عمان" },
                { "YE", "Yemen", "اليمن" },
                { "LY", "Libya", "ليبيا" },
                { "TN", "Tunisia", "تونس" },
                { "DZ", "Algeria", "الجزائر" },
                { "MA", "Morocco", "المغرب" },
                { "PS", "Palestine", "فلسطين" },
                { "TR", "Turkey", "تركيا" },
                { "DE", "Germany", "ألمانيا" },
                { "FR", "France", "فرنسا" },
                { "CA", "Canada", "كندا" },
                { "AU", "Australia", "أستراليا" }
                // Add more as needed
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "Countries");
    }
}
```

**Model:**

```csharp
// Models/Country.cs
public class Country
{
    [Key]
    [MaxLength(2)]
    public string Code { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string NameEn { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? NameAr { get; set; }
}
```

**DbContext:**

```csharp
public DbSet<Country> Countries { get; set; }
```

---

### Step 2: Update Nationalities API to Return Names

**Controller:**

```csharp
/// <summary>
/// Get nationalities that exist in People table, with country names
/// </summary>
[HttpGet("nationalities")]
public async Task<ActionResult<List<NationalityDto>>> GetNationalities([FromQuery] Guid orgId)
{
    // Get distinct nationality codes from People
    var nationalityCodes = await _context.People
        .Where(p => p.OrgId == orgId && !string.IsNullOrEmpty(p.Nationality))
        .Select(p => p.Nationality)
        .Distinct()
        .ToListAsync();

    // Join with Countries table to get names
    var nationalities = await _context.Countries
        .Where(c => nationalityCodes.Contains(c.Code))
        .Select(c => new NationalityDto
        {
            Code = c.Code,
            NameEn = c.NameEn,
            NameAr = c.NameAr
        })
        .OrderBy(c => c.NameEn)
        .ToListAsync();

    return Ok(nationalities);
}
```

**DTO:**

```csharp
// DTOs/NationalityDto.cs
public class NationalityDto
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
}
```

---

### Step 3: Shared Person Search Component

### File: `src/app/shared/components/person-search/person-search.component.ts`

```typescript
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Observable, Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { PeopleService, NationalityDto } from '@core/services/people.service';
import { TownService } from '@core/services/town.service';
import { I18nService } from '@core/services/i18n.service';

@Component({
  selector: 'app-person-search',
  templateUrl: './person-search.component.html',
  styleUrls: ['./person-search.component.scss']
})
export class PersonSearchComponent implements OnInit, OnDestroy {
  @Input() orgId!: string;
  @Input() excludePersonId?: string;
  @Input() placeholder = 'Search for a person...';
  
  @Output() personSelected = new EventEmitter<any>();
  
  // Filters
  towns$!: Observable<any[]>;
  selectedTownId: string | null = null;
  
  // Nationality filter - loaded from database with names!
  nationalities: NationalityDto[] = [];
  selectedNationality: string | null = null;
  
  // Search
  searchControl = new FormControl('');
  searchResults$!: Observable<any[]>;
  selectedPerson: any = null;
  
  private destroy$ = new Subject<void>();

  constructor(
    private peopleService: PeopleService,
    private townService: TownService,
    private i18n: I18nService
  ) {}

  ngOnInit() {
    // Load towns
    this.towns$ = this.townService.getTowns(this.orgId);
    
    // Load nationalities from database (with names!)
    this.peopleService.getNationalities(this.orgId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(nationalities => {
        this.nationalities = nationalities;
      });
    
    // Setup search
    this.searchResults$ = this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query || query.length < 2) {
          return of([]);
        }
        
        return this.peopleService.searchPeople({
          query: query,
          orgId: this.orgId,
          townId: this.selectedTownId,
          nationality: this.selectedNationality,
          excludePersonId: this.excludePersonId,
          limit: 20
        });
      })
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onTownChange(townId: string | null) {
    this.selectedTownId = townId;
    this.triggerSearch();
  }

  onNationalityChange(code: string | null) {
    this.selectedNationality = code;
    this.triggerSearch();
  }

  private triggerSearch() {
    const currentSearch = this.searchControl.value;
    if (currentSearch && currentSearch.length >= 2) {
      this.searchControl.setValue(currentSearch);
    }
  }

  selectPerson(person: any) {
    this.selectedPerson = person;
    this.searchControl.setValue(this.getPersonDisplayName(person));
    this.personSelected.emit(person);
  }

  clearSelection() {
    this.selectedPerson = null;
    this.searchControl.setValue('');
    this.personSelected.emit(null);
  }

  // Get flag emoji from country code
  getCountryFlag(code: string): string {
    if (!code || code.length !== 2) return '';
    const codePoints = code.toUpperCase().split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  // Get country name from nationality object based on current language
  getCountryName(nationality: NationalityDto): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && nationality.nameAr) {
      return nationality.nameAr;
    }
    return nationality.nameEn;
  }

  // Display: "🇪🇬 Egypt" or "🇪🇬 مصر"
  getCountryDisplay(nationality: NationalityDto): string {
    return `${this.getCountryFlag(nationality.code)} ${this.getCountryName(nationality)}`;
  }

  // Get country display from code (for search results)
  getCountryDisplayByCode(code: string): string {
    const nationality = this.nationalities.find(n => n.code === code);
    if (nationality) {
      return this.getCountryDisplay(nationality);
    }
    return `${this.getCountryFlag(code)} ${code}`;
  }

  // Person display name based on language
  getPersonDisplayName(person: any): string {
    if (!person) return '';
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar': return person.nameArabic || person.primaryName || '';
      case 'nob': return person.nameNobiin || person.nameEnglish || person.primaryName || '';
      default: return person.nameEnglish || person.primaryName || '';
    }
  }
}
```

### File: `src/app/shared/components/person-search/person-search.component.html`

```html
<div class="person-search-container">
  <!-- Filter Row -->
  <div class="filter-row">
    <!-- Town Filter -->
    <mat-form-field appearance="outline" class="filter-field">
      <mat-label>{{ 'common.town' | translate }}</mat-label>
      <mat-select [value]="selectedTownId" (selectionChange)="onTownChange($event.value)">
        <mat-option [value]="null">{{ 'common.allTowns' | translate }}</mat-option>
        <mat-option *ngFor="let town of towns$ | async" [value]="town.id">
          {{ town.name }}
        </mat-option>
      </mat-select>
      <mat-hint>{{ 'common.optional' | translate }}</mat-hint>
    </mat-form-field>

    <!-- Nationality Filter (dynamic from database!) -->
    <mat-form-field appearance="outline" class="filter-field">
      <mat-label>{{ 'person.nationality' | translate }}</mat-label>
      <mat-select [value]="selectedNationality" (selectionChange)="onNationalityChange($event.value)">
        <mat-option [value]="null">{{ 'common.allNationalities' | translate }}</mat-option>
        <mat-option *ngFor="let nat of nationalities" [value]="nat.code">
          {{ getCountryDisplay(nat) }}
        </mat-option>
      </mat-select>
      <mat-hint>{{ 'common.optional' | translate }}</mat-hint>
    </mat-form-field>
  </div>

  <!-- Search Hint -->
  <div class="search-hint" *ngIf="!selectedTownId && !selectedNationality">
    <mat-icon>info</mat-icon>
    <span>{{ 'relationship.filterHint' | translate }}</span>
  </div>

  <!-- Person Search -->
  <mat-form-field appearance="outline" class="full-width">
    <mat-label>{{ 'relationship.searchPerson' | translate }}</mat-label>
    <mat-icon matPrefix>search</mat-icon>
    <input type="text"
           matInput
           [formControl]="searchControl"
           [matAutocomplete]="personAuto"
           [placeholder]="placeholder">
    <button mat-icon-button matSuffix *ngIf="selectedPerson" (click)="clearSelection()" type="button">
      <mat-icon>close</mat-icon>
    </button>
    <mat-autocomplete #personAuto="matAutocomplete" (optionSelected)="selectPerson($event.option.value)">
      <mat-option *ngFor="let person of searchResults$ | async" [value]="person">
        <div class="person-option">
          <span class="person-name">{{ getPersonDisplayName(person) }}</span>
          <span class="person-details">
            <span *ngIf="person.nationality" class="person-flag">{{ getCountryFlag(person.nationality) }}</span>
            <span *ngIf="person.townName" class="person-town">{{ person.townName }}</span>
          </span>
        </div>
      </mat-option>
      <mat-option *ngIf="(searchResults$ | async)?.length === 0 && searchControl.value?.length >= 2" disabled>
        {{ 'common.noResults' | translate }}
      </mat-option>
    </mat-autocomplete>
  </mat-form-field>

  <!-- Selected Person Display -->
  <div class="selected-person" *ngIf="selectedPerson">
    <mat-icon>person</mat-icon>
    <span>{{ getPersonDisplayName(selectedPerson) }}</span>
    <span *ngIf="selectedPerson.nationality" class="person-flag">{{ getCountryFlag(selectedPerson.nationality) }}</span>
    <button mat-icon-button (click)="clearSelection()" type="button">
      <mat-icon>close</mat-icon>
    </button>
  </div>
</div>
```

### File: `src/app/shared/components/person-search/person-search.component.scss`

```scss
.person-search-container {
  width: 100%;
}

.filter-row {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  
  .filter-field {
    flex: 1;
  }
}

.search-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 16px;
  background-color: #fff8e1;
  border-radius: 4px;
  color: #f57c00;
  font-size: 0.85em;
  
  mat-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
}

.full-width {
  width: 100%;
}

.person-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  
  .person-name {
    flex: 1;
  }
  
  .person-details {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85em;
    color: #666;
  }
  
  .person-flag {
    font-size: 1.1em;
  }
  
  .person-town {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.selected-person {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background-color: #e8f5e9;
  border-radius: 4px;
  
  mat-icon {
    color: #4caf50;
  }
  
  .person-flag {
    font-size: 1.1em;
  }
  
  button {
    margin-left: auto;
  }
}

@media (max-width: 600px) {
  .filter-row {
    flex-direction: column;
    gap: 8px;
  }
}
```

### Register in SharedModule

```typescript
// src/app/shared/shared.module.ts
import { PersonSearchComponent } from './components/person-search/person-search.component';

@NgModule({
  declarations: [
    PersonSearchComponent,
    // ... other components
  ],
  exports: [
    PersonSearchComponent,
    // ... other exports
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
    TranslateModule,
  ]
})
export class SharedModule {}
```

---

## Usage in Any Relationship Dialog

Now any dialog can use the shared component:

### Example: Add Spouse Dialog

```html
<h2 mat-dialog-title>{{ 'relationship.addSpouse' | translate }}</h2>

<mat-dialog-content>
  <!-- Reusable Person Search Component -->
  <app-person-search
    [orgId]="data.orgId"
    [excludePersonId]="data.currentPersonId"
    (personSelected)="onPersonSelected($event)">
  </app-person-search>

  <!-- Rest of spouse-specific form fields -->
  <mat-form-field appearance="outline" class="full-width">
    <mat-label>{{ 'relationship.unionType' | translate }}</mat-label>
    <mat-select formControlName="unionType">
      <mat-option value="Marriage">{{ 'relationship.marriage' | translate }}</mat-option>
      <mat-option value="Other">{{ 'relationship.other' | translate }}</mat-option>
    </mat-select>
  </mat-form-field>
  
  <!-- Dates, notes, etc. -->
</mat-dialog-content>
```

### Example: Add Parent Dialog

```html
<h2 mat-dialog-title>{{ 'relationship.addParent' | translate }}</h2>

<mat-dialog-content>
  <!-- Same reusable component! -->
  <app-person-search
    [orgId]="data.orgId"
    [excludePersonId]="data.currentPersonId"
    placeholder="{{ 'relationship.searchParent' | translate }}"
    (personSelected)="onPersonSelected($event)">
  </app-person-search>

  <!-- Parent-specific fields -->
  <mat-form-field appearance="outline" class="full-width">
    <mat-label>{{ 'relationship.parentType' | translate }}</mat-label>
    <mat-select formControlName="parentType">
      <mat-option value="Biological">{{ 'relationship.biological' | translate }}</mat-option>
      <mat-option value="Adoptive">{{ 'relationship.adoptive' | translate }}</mat-option>
      <mat-option value="Step">{{ 'relationship.step' | translate }}</mat-option>
    </mat-select>
  </mat-form-field>
</mat-dialog-content>
```

### Example: Add Child Dialog

```html
<h2 mat-dialog-title>{{ 'relationship.addChild' | translate }}</h2>

<mat-dialog-content>
  <app-person-search
    [orgId]="data.orgId"
    [excludePersonId]="data.currentPersonId"
    placeholder="{{ 'relationship.searchChild' | translate }}"
    (personSelected)="onPersonSelected($event)">
  </app-person-search>

  <!-- Child-specific fields if any -->
</mat-dialog-content>
```

## Backend Changes

### File: `Controllers/PeopleController.cs`

```csharp
/// <summary>
/// Get nationalities that exist in People table, with country names from Countries table
/// </summary>
[HttpGet("nationalities")]
public async Task<ActionResult<List<NationalityDto>>> GetNationalities([FromQuery] Guid orgId)
{
    // Get distinct nationality codes from People
    var nationalityCodes = await _context.People
        .Where(p => p.OrgId == orgId && !string.IsNullOrEmpty(p.Nationality))
        .Select(p => p.Nationality)
        .Distinct()
        .ToListAsync();

    // Join with Countries table to get names
    var nationalities = await _context.Countries
        .Where(c => nationalityCodes.Contains(c.Code))
        .Select(c => new NationalityDto
        {
            Code = c.Code,
            NameEn = c.NameEn,
            NameAr = c.NameAr
        })
        .OrderBy(c => c.NameEn)
        .ToListAsync();

    return Ok(nationalities);
}

[HttpGet("search")]
public async Task<ActionResult<List<PersonSearchDto>>> SearchPeople(
    [FromQuery] Guid orgId,
    [FromQuery] string? query,
    [FromQuery] Guid? townId,
    [FromQuery] string? nationality,
    [FromQuery] Guid? excludePersonId,
    [FromQuery] int limit = 20)
{
    var request = new PersonSearchRequest
    {
        OrgId = orgId,
        Query = query,
        TownId = townId,
        Nationality = nationality,
        ExcludePersonId = excludePersonId,
        Limit = limit
    };

    var results = await _peopleService.SearchPeopleAsync(request);
    return Ok(results);
}
```

### File: `DTOs/NationalityDto.cs`

```csharp
public class NationalityDto
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
}
```

### File: `Services/PeopleService.cs`

```csharp
public async Task<List<PersonSearchDto>> SearchPeopleAsync(PersonSearchRequest request)
{
    var query = _context.People
        .Where(p => p.OrgId == request.OrgId);

    // Apply search text filter
    if (!string.IsNullOrWhiteSpace(request.Query))
    {
        var searchTerm = request.Query.ToLower();
        query = query.Where(p =>
            (p.PrimaryName != null && p.PrimaryName.ToLower().Contains(searchTerm)) ||
            (p.NameArabic != null && p.NameArabic.ToLower().Contains(searchTerm)) ||
            (p.NameEnglish != null && p.NameEnglish.ToLower().Contains(searchTerm)) ||
            (p.NameNobiin != null && p.NameNobiin.Contains(searchTerm)));
    }

    // Apply Town filter (OPTIONAL)
    if (request.TownId.HasValue)
    {
        query = query.Where(p => p.TownId == request.TownId.Value);
    }

    // Apply Nationality filter (OPTIONAL)
    if (!string.IsNullOrWhiteSpace(request.Nationality))
    {
        query = query.Where(p => p.Nationality == request.Nationality);
    }

    // Exclude current person if specified
    if (request.ExcludePersonId.HasValue)
    {
        query = query.Where(p => p.Id != request.ExcludePersonId.Value);
    }

    var results = await query
        .OrderBy(p => p.PrimaryName)
        .Take(request.Limit ?? 20)
        .Select(p => new PersonSearchDto
        {
            Id = p.Id,
            PrimaryName = p.PrimaryName,
            NameArabic = p.NameArabic,
            NameEnglish = p.NameEnglish,
            NameNobiin = p.NameNobiin,
            Nationality = p.Nationality,
            TownId = p.TownId,
            TownName = p.Town != null ? p.Town.Name : null
        })
        .ToListAsync();

    return results;
}
```

---

## Frontend Service Update

### File: `services/people.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NationalityDto {
  code: string;
  nameEn: string;
  nameAr?: string;
}

export interface PersonSearchParams {
  query: string;
  orgId: string;
  townId?: string | null;
  nationality?: string | null;
  excludePersonId?: string;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class PeopleService {
  constructor(private http: HttpClient) {}

  /**
   * Get nationalities from People table with country names
   * Returns: [{ code: "EG", nameEn: "Egypt", nameAr: "مصر" }, ...]
   */
  getNationalities(orgId: string): Observable<NationalityDto[]> {
    return this.http.get<NationalityDto[]>(`/api/people/nationalities`, {
      params: { orgId }
    });
  }

  searchPeople(params: PersonSearchParams): Observable<any[]> {
    let httpParams = new HttpParams()
      .set('orgId', params.orgId)
      .set('query', params.query)
      .set('limit', (params.limit || 20).toString());

    if (params.townId) {
      httpParams = httpParams.set('townId', params.townId);
    }
    if (params.nationality) {
      httpParams = httpParams.set('nationality', params.nationality);
    }
    if (params.excludePersonId) {
      httpParams = httpParams.set('excludePersonId', params.excludePersonId);
    }

    return this.http.get<any[]>('/api/people/search', { params: httpParams });
  }
}
```

---

## Translations

### en.json
```json
{
  "common": {
    "allTowns": "All Towns",
    "allNationalities": "All Nationalities",
    "optional": "Optional",
    "noResults": "No results found"
  },
  "relationship": {
    "addSpouse": "Add Spouse/Partner",
    "searchPerson": "Search for a person",
    "searchPlaceholder": "Type name to search...",
    "filterHint": "Tip: Select a town or nationality to narrow search results",
    "familyRelationship": "Family Relationship (e.g., Husband, Wife)",
    "relationshipPlaceholder": "e.g., Husband, Wife",
    "unionType": "Union Type",
    "marriage": "Marriage",
    "civilUnion": "Civil Union",
    "other": "Other",
    "startDate": "Start Date",
    "endDate": "End Date (if applicable)",
    "notes": "Notes (optional)"
  }
}
```

### ar.json
```json
{
  "common": {
    "allTowns": "كل المدن",
    "allNationalities": "كل الجنسيات",
    "optional": "اختياري",
    "noResults": "لا توجد نتائج"
  },
  "relationship": {
    "addSpouse": "إضافة زوج/شريك",
    "searchPerson": "البحث عن شخص",
    "searchPlaceholder": "اكتب الاسم للبحث...",
    "filterHint": "نصيحة: اختر مدينة أو جنسية لتضييق نتائج البحث",
    "familyRelationship": "صلة القرابة (مثل: زوج، زوجة)",
    "relationshipPlaceholder": "مثل: زوج، زوجة",
    "unionType": "نوع العلاقة",
    "marriage": "زواج",
    "civilUnion": "اتحاد مدني",
    "other": "أخرى",
    "startDate": "تاريخ البداية",
    "endDate": "تاريخ النهاية (إن وجد)",
    "notes": "ملاحظات (اختياري)"
  }
}
```

---

## Summary

| Change | Description |
|--------|-------------|
| **Countries Table** | New reference table with Code, NameEn, NameAr |
| **Nationalities API** | Returns `NationalityDto[]` with code + names |
| **Shared Component** | `PersonSearchComponent` - reusable in ALL dialogs |
| **Town filter** | Made optional with "All Towns" default |
| **No hardcoded map** | Country names come from database |

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  People Table   │     │ Countries Table │     │   Frontend      │
│  (Nationality)  │────▶│ (Code, Names)   │────▶│   Dropdown      │
│  "EG", "SA"     │     │ EG=Egypt/مصر    │     │ 🇪🇬 Egypt       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## API Response

```json
GET /api/people/nationalities?orgId=xxx

[
  { "code": "EG", "nameEn": "Egypt", "nameAr": "مصر" },
  { "code": "SA", "nameEn": "Saudi Arabia", "nameAr": "السعودية" }
]
```

## Dialogs That Will Use This

| Dialog | Usage |
|--------|-------|
| Add Spouse/Partner | `<app-person-search (personSelected)="...">` |
| Add Parent | `<app-person-search (personSelected)="...">` |
| Add Child | `<app-person-search (personSelected)="...">` |
| Add Sibling | `<app-person-search (personSelected)="...">` |
| Add Relationship | `<app-person-search (personSelected)="...">` |

## Benefits of Shared Component

1. **One place to fix bugs** - Fix once, works everywhere
2. **Consistent UX** - Same search experience in all dialogs
3. **Less code duplication** - DRY principle
4. **Easy to enhance** - Add features once, all dialogs benefit
