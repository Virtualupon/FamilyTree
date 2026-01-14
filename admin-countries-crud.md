# Feature: Super Admin - Countries CRUD Management

## Requirement

Super Admin can Create, Read, Update, Delete countries in the `Countries` table.

## Database Table

```sql
CREATE TABLE public."Countries" (
    "Code" varchar(2) NOT NULL,          -- PK, e.g., "EG"
    "NameEn" varchar(100) NOT NULL,      -- "Egypt"
    "NameAr" varchar(100) NULL,          -- "مصر"
    "NameLocal" varchar(100) NULL,       -- Local name
    "Region" varchar(50) NULL,           -- "Middle East"
    "IsActive" bool DEFAULT true,        -- Show in dropdowns
    "DisplayOrder" int4 DEFAULT 0,       -- Sort order
    CONSTRAINT "PK_Countries" PRIMARY KEY ("Code")
);
```

---

## Backend

### File: `Controllers/Admin/CountriesController.cs`

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace YourApp.Controllers.Admin;

[ApiController]
[Route("api/admin/countries")]
[Authorize(Roles = "SuperAdmin")]
public class CountriesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<CountriesController> _logger;

    public CountriesController(AppDbContext context, ILogger<CountriesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get all countries (with optional filtering)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<CountryDto>>> GetAll(
        [FromQuery] bool? isActive = null,
        [FromQuery] string? region = null,
        [FromQuery] string? search = null)
    {
        var query = _context.Countries.AsQueryable();

        if (isActive.HasValue)
            query = query.Where(c => c.IsActive == isActive.Value);

        if (!string.IsNullOrWhiteSpace(region))
            query = query.Where(c => c.Region == region);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLower();
            query = query.Where(c =>
                c.Code.ToLower().Contains(searchLower) ||
                c.NameEn.ToLower().Contains(searchLower) ||
                (c.NameAr != null && c.NameAr.Contains(search)));
        }

        var countries = await query
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.NameEn)
            .Select(c => new CountryDto
            {
                Code = c.Code,
                NameEn = c.NameEn,
                NameAr = c.NameAr,
                NameLocal = c.NameLocal,
                Region = c.Region,
                IsActive = c.IsActive,
                DisplayOrder = c.DisplayOrder
            })
            .ToListAsync();

        return Ok(countries);
    }

    /// <summary>
    /// Get single country by code
    /// </summary>
    [HttpGet("{code}")]
    public async Task<ActionResult<CountryDto>> GetByCode(string code)
    {
        var country = await _context.Countries
            .Where(c => c.Code == code.ToUpperInvariant())
            .Select(c => new CountryDto
            {
                Code = c.Code,
                NameEn = c.NameEn,
                NameAr = c.NameAr,
                NameLocal = c.NameLocal,
                Region = c.Region,
                IsActive = c.IsActive,
                DisplayOrder = c.DisplayOrder
            })
            .FirstOrDefaultAsync();

        if (country == null)
            return NotFound($"Country '{code}' not found");

        return Ok(country);
    }

    /// <summary>
    /// Create new country
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<CountryDto>> Create([FromBody] CreateCountryDto dto)
    {
        var code = dto.Code.Trim().ToUpperInvariant();

        if (code.Length != 2)
            return BadRequest("Country code must be exactly 2 characters");

        var exists = await _context.Countries.AnyAsync(c => c.Code == code);
        if (exists)
            return Conflict($"Country '{code}' already exists");

        var country = new Country
        {
            Code = code,
            NameEn = dto.NameEn.Trim(),
            NameAr = dto.NameAr?.Trim(),
            NameLocal = dto.NameLocal?.Trim(),
            Region = dto.Region?.Trim(),
            IsActive = dto.IsActive,
            DisplayOrder = dto.DisplayOrder
        };

        _context.Countries.Add(country);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Country created: {Code} - {Name}", code, country.NameEn);

        return CreatedAtAction(nameof(GetByCode), new { code = country.Code }, new CountryDto
        {
            Code = country.Code,
            NameEn = country.NameEn,
            NameAr = country.NameAr,
            NameLocal = country.NameLocal,
            Region = country.Region,
            IsActive = country.IsActive,
            DisplayOrder = country.DisplayOrder
        });
    }

    /// <summary>
    /// Update existing country
    /// </summary>
    [HttpPut("{code}")]
    public async Task<ActionResult<CountryDto>> Update(string code, [FromBody] UpdateCountryDto dto)
    {
        var country = await _context.Countries.FindAsync(code.ToUpperInvariant());

        if (country == null)
            return NotFound($"Country '{code}' not found");

        country.NameEn = dto.NameEn?.Trim() ?? country.NameEn;
        country.NameAr = dto.NameAr?.Trim();
        country.NameLocal = dto.NameLocal?.Trim();
        country.Region = dto.Region?.Trim();
        country.IsActive = dto.IsActive ?? country.IsActive;
        country.DisplayOrder = dto.DisplayOrder ?? country.DisplayOrder;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Country updated: {Code} - {Name}", code, country.NameEn);

        return Ok(new CountryDto
        {
            Code = country.Code,
            NameEn = country.NameEn,
            NameAr = country.NameAr,
            NameLocal = country.NameLocal,
            Region = country.Region,
            IsActive = country.IsActive,
            DisplayOrder = country.DisplayOrder
        });
    }

    /// <summary>
    /// Delete country
    /// </summary>
    [HttpDelete("{code}")]
    public async Task<ActionResult> Delete(string code)
    {
        var country = await _context.Countries.FindAsync(code.ToUpperInvariant());

        if (country == null)
            return NotFound($"Country '{code}' not found");

        // Check if country is used by any person
        var isUsed = await _context.People.AnyAsync(p => p.Nationality == code.ToUpperInvariant());
        if (isUsed)
            return BadRequest($"Cannot delete country '{code}' - it is used by existing people. Deactivate it instead.");

        _context.Countries.Remove(country);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Country deleted: {Code}", code);

        return NoContent();
    }

    /// <summary>
    /// Toggle country active status
    /// </summary>
    [HttpPatch("{code}/toggle-active")]
    public async Task<ActionResult> ToggleActive(string code)
    {
        var country = await _context.Countries.FindAsync(code.ToUpperInvariant());

        if (country == null)
            return NotFound($"Country '{code}' not found");

        country.IsActive = !country.IsActive;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Country {Code} active status: {IsActive}", code, country.IsActive);

        return Ok(new { code = country.Code, isActive = country.IsActive });
    }

    /// <summary>
    /// Get distinct regions for filtering
    /// </summary>
    [HttpGet("regions")]
    public async Task<ActionResult<List<string>>> GetRegions()
    {
        var regions = await _context.Countries
            .Where(c => !string.IsNullOrEmpty(c.Region))
            .Select(c => c.Region!)
            .Distinct()
            .OrderBy(r => r)
            .ToListAsync();

        return Ok(regions);
    }
}
```

### File: `DTOs/CountryDtos.cs`

```csharp
namespace YourApp.DTOs;

public class CountryDto
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public string? NameLocal { get; set; }
    public string? Region { get; set; }
    public bool IsActive { get; set; }
    public int DisplayOrder { get; set; }
}

public class CreateCountryDto
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public string? NameLocal { get; set; }
    public string? Region { get; set; }
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; } = 0;
}

public class UpdateCountryDto
{
    public string? NameEn { get; set; }
    public string? NameAr { get; set; }
    public string? NameLocal { get; set; }
    public string? Region { get; set; }
    public bool? IsActive { get; set; }
    public int? DisplayOrder { get; set; }
}
```

---

## Frontend

### File: `src/app/features/admin/countries/countries.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Country {
  code: string;
  nameEn: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface CreateCountryDto {
  code: string;
  nameEn: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export interface UpdateCountryDto {
  nameEn?: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
  isActive?: boolean;
  displayOrder?: number;
}

@Injectable({ providedIn: 'root' })
export class CountriesService {
  private baseUrl = '/api/admin/countries';

  constructor(private http: HttpClient) {}

  getAll(filters?: { isActive?: boolean; region?: string; search?: string }): Observable<Country[]> {
    let params = new HttpParams();
    if (filters?.isActive !== undefined) params = params.set('isActive', filters.isActive);
    if (filters?.region) params = params.set('region', filters.region);
    if (filters?.search) params = params.set('search', filters.search);
    
    return this.http.get<Country[]>(this.baseUrl, { params });
  }

  getByCode(code: string): Observable<Country> {
    return this.http.get<Country>(`${this.baseUrl}/${code}`);
  }

  create(dto: CreateCountryDto): Observable<Country> {
    return this.http.post<Country>(this.baseUrl, dto);
  }

  update(code: string, dto: UpdateCountryDto): Observable<Country> {
    return this.http.put<Country>(`${this.baseUrl}/${code}`, dto);
  }

  delete(code: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${code}`);
  }

  toggleActive(code: string): Observable<{ code: string; isActive: boolean }> {
    return this.http.patch<{ code: string; isActive: boolean }>(`${this.baseUrl}/${code}/toggle-active`, {});
  }

  getRegions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/regions`);
  }
}
```

### File: `src/app/features/admin/countries/countries-list.component.ts`

```typescript
import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CountriesService, Country } from './countries.service';
import { CountryDialogComponent } from './country-dialog.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-countries-list',
  templateUrl: './countries-list.component.html',
  styleUrls: ['./countries-list.component.scss']
})
export class CountriesListComponent implements OnInit {
  countries: Country[] = [];
  filteredCountries: Country[] = [];
  regions: string[] = [];
  
  // Filters
  searchText = '';
  selectedRegion = '';
  showActiveOnly = false;
  
  loading = false;
  displayedColumns = ['flag', 'code', 'nameEn', 'nameAr', 'region', 'isActive', 'displayOrder', 'actions'];

  constructor(
    private countriesService: CountriesService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadCountries();
    this.loadRegions();
  }

  loadCountries() {
    this.loading = true;
    this.countriesService.getAll().subscribe({
      next: (countries) => {
        this.countries = countries;
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.snackBar.open('Failed to load countries', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadRegions() {
    this.countriesService.getRegions().subscribe({
      next: (regions) => this.regions = regions
    });
  }

  applyFilters() {
    let result = [...this.countries];

    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      result = result.filter(c =>
        c.code.toLowerCase().includes(search) ||
        c.nameEn.toLowerCase().includes(search) ||
        (c.nameAr && c.nameAr.includes(this.searchText))
      );
    }

    if (this.selectedRegion) {
      result = result.filter(c => c.region === this.selectedRegion);
    }

    if (this.showActiveOnly) {
      result = result.filter(c => c.isActive);
    }

    this.filteredCountries = result;
  }

  getFlag(code: string): string {
    if (!code || code.length !== 2) return '';
    const codePoints = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  openAddDialog() {
    const dialogRef = this.dialog.open(CountryDialogComponent, {
      width: '500px',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadCountries();
    });
  }

  openEditDialog(country: Country) {
    const dialogRef = this.dialog.open(CountryDialogComponent, {
      width: '500px',
      data: { mode: 'edit', country }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadCountries();
    });
  }

  toggleActive(country: Country) {
    this.countriesService.toggleActive(country.code).subscribe({
      next: (result) => {
        country.isActive = result.isActive;
        this.snackBar.open(
          `${country.nameEn} ${result.isActive ? 'activated' : 'deactivated'}`,
          'Close',
          { duration: 2000 }
        );
      },
      error: () => {
        this.snackBar.open('Failed to update status', 'Close', { duration: 3000 });
      }
    });
  }

  confirmDelete(country: Country) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Country',
        message: `Are you sure you want to delete "${country.nameEn}" (${country.code})?`,
        confirmText: 'Delete',
        cancelText: 'Cancel'
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteCountry(country);
      }
    });
  }

  deleteCountry(country: Country) {
    this.countriesService.delete(country.code).subscribe({
      next: () => {
        this.snackBar.open(`${country.nameEn} deleted`, 'Close', { duration: 2000 });
        this.loadCountries();
      },
      error: (err) => {
        this.snackBar.open(err.error || 'Failed to delete country', 'Close', { duration: 3000 });
      }
    });
  }
}
```

### File: `src/app/features/admin/countries/countries-list.component.html`

```html
<div class="countries-container">
  <div class="header">
    <h1>{{ 'admin.countries.title' | translate }}</h1>
    <button mat-raised-button color="primary" (click)="openAddDialog()">
      <mat-icon>add</mat-icon>
      {{ 'admin.countries.add' | translate }}
    </button>
  </div>

  <!-- Filters -->
  <div class="filters">
    <mat-form-field appearance="outline">
      <mat-label>{{ 'common.search' | translate }}</mat-label>
      <input matInput [(ngModel)]="searchText" (ngModelChange)="applyFilters()" placeholder="Code or name...">
      <mat-icon matPrefix>search</mat-icon>
    </mat-form-field>

    <mat-form-field appearance="outline">
      <mat-label>{{ 'admin.countries.region' | translate }}</mat-label>
      <mat-select [(ngModel)]="selectedRegion" (selectionChange)="applyFilters()">
        <mat-option value="">{{ 'common.all' | translate }}</mat-option>
        <mat-option *ngFor="let region of regions" [value]="region">{{ region }}</mat-option>
      </mat-select>
    </mat-form-field>

    <mat-checkbox [(ngModel)]="showActiveOnly" (change)="applyFilters()">
      {{ 'admin.countries.activeOnly' | translate }}
    </mat-checkbox>
  </div>

  <!-- Table -->
  <div class="table-container">
    <table mat-table [dataSource]="filteredCountries" class="countries-table">
      
      <!-- Flag -->
      <ng-container matColumnDef="flag">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let country" class="flag-cell">
          {{ getFlag(country.code) }}
        </td>
      </ng-container>

      <!-- Code -->
      <ng-container matColumnDef="code">
        <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.code' | translate }}</th>
        <td mat-cell *matCellDef="let country">
          <strong>{{ country.code }}</strong>
        </td>
      </ng-container>

      <!-- Name English -->
      <ng-container matColumnDef="nameEn">
        <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.nameEn' | translate }}</th>
        <td mat-cell *matCellDef="let country">{{ country.nameEn }}</td>
      </ng-container>

      <!-- Name Arabic -->
      <ng-container matColumnDef="nameAr">
        <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.nameAr' | translate }}</th>
        <td mat-cell *matCellDef="let country" dir="rtl">{{ country.nameAr || '-' }}</td>
      </ng-container>

      <!-- Region -->
      <ng-container matColumnDef="region">
        <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.region' | translate }}</th>
        <td mat-cell *matCellDef="let country">{{ country.region || '-' }}</td>
      </ng-container>

      <!-- Is Active -->
      <ng-container matColumnDef="isActive">
        <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | translate }}</th>
        <td mat-cell *matCellDef="let country">
          <mat-chip [color]="country.isActive ? 'primary' : 'warn'" selected>
            {{ country.isActive ? 'Active' : 'Inactive' }}
          </mat-chip>
        </td>
      </ng-container>

      <!-- Display Order -->
      <ng-container matColumnDef="displayOrder">
        <th mat-header-cell *matHeaderCellDef>{{ 'admin.countries.order' | translate }}</th>
        <td mat-cell *matCellDef="let country">{{ country.displayOrder }}</td>
      </ng-container>

      <!-- Actions -->
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>{{ 'common.actions' | translate }}</th>
        <td mat-cell *matCellDef="let country">
          <button mat-icon-button (click)="openEditDialog(country)" matTooltip="Edit">
            <mat-icon>edit</mat-icon>
          </button>
          <button mat-icon-button (click)="toggleActive(country)" 
                  [matTooltip]="country.isActive ? 'Deactivate' : 'Activate'">
            <mat-icon>{{ country.isActive ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <button mat-icon-button color="warn" (click)="confirmDelete(country)" matTooltip="Delete">
            <mat-icon>delete</mat-icon>
          </button>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
    </table>

    <div *ngIf="filteredCountries.length === 0 && !loading" class="no-data">
      {{ 'common.noData' | translate }}
    </div>

    <mat-spinner *ngIf="loading" diameter="40"></mat-spinner>
  </div>
</div>
```

### File: `src/app/features/admin/countries/country-dialog.component.ts`

```typescript
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CountriesService, Country } from './countries.service';

@Component({
  selector: 'app-country-dialog',
  templateUrl: './country-dialog.component.html',
  styleUrls: ['./country-dialog.component.scss']
})
export class CountryDialogComponent implements OnInit {
  form: FormGroup;
  isEdit: boolean;
  saving = false;

  regions = [
    'Africa',
    'Asia',
    'Europe',
    'Middle East',
    'North America',
    'South America',
    'Oceania'
  ];

  constructor(
    private fb: FormBuilder,
    private countriesService: CountriesService,
    private dialogRef: MatDialogRef<CountryDialogComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: { mode: 'create' | 'edit'; country?: Country }
  ) {
    this.isEdit = data.mode === 'edit';
  }

  ngOnInit() {
    this.form = this.fb.group({
      code: [
        { value: this.data.country?.code || '', disabled: this.isEdit },
        [Validators.required, Validators.minLength(2), Validators.maxLength(2), Validators.pattern(/^[A-Za-z]+$/)]
      ],
      nameEn: [this.data.country?.nameEn || '', [Validators.required, Validators.maxLength(100)]],
      nameAr: [this.data.country?.nameAr || '', [Validators.maxLength(100)]],
      nameLocal: [this.data.country?.nameLocal || '', [Validators.maxLength(100)]],
      region: [this.data.country?.region || ''],
      isActive: [this.data.country?.isActive ?? true],
      displayOrder: [this.data.country?.displayOrder || 0]
    });
  }

  getFlag(): string {
    const code = this.form.get('code')?.value;
    if (!code || code.length !== 2) return '';
    const codePoints = code.toUpperCase().split('').map((c: string) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  save() {
    if (this.form.invalid) return;

    this.saving = true;
    const formValue = this.form.getRawValue();

    const request = this.isEdit
      ? this.countriesService.update(this.data.country!.code, formValue)
      : this.countriesService.create(formValue);

    request.subscribe({
      next: () => {
        this.snackBar.open(
          this.isEdit ? 'Country updated' : 'Country created',
          'Close',
          { duration: 2000 }
        );
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.snackBar.open(err.error || 'Failed to save country', 'Close', { duration: 3000 });
        this.saving = false;
      }
    });
  }
}
```

### File: `src/app/features/admin/countries/country-dialog.component.html`

```html
<h2 mat-dialog-title>
  <span class="flag-preview">{{ getFlag() }}</span>
  {{ isEdit ? ('admin.countries.edit' | translate) : ('admin.countries.add' | translate) }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" class="country-form">
    
    <!-- Code (2 letters) -->
    <mat-form-field appearance="outline" class="code-field">
      <mat-label>{{ 'admin.countries.code' | translate }} *</mat-label>
      <input matInput formControlName="code" maxlength="2" 
             [readonly]="isEdit" style="text-transform: uppercase;">
      <mat-hint>ISO 3166-1 alpha-2 (e.g., EG, US, SA)</mat-hint>
      <mat-error *ngIf="form.get('code')?.hasError('required')">Required</mat-error>
      <mat-error *ngIf="form.get('code')?.hasError('pattern')">Letters only</mat-error>
    </mat-form-field>

    <!-- Name English -->
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>{{ 'admin.countries.nameEn' | translate }} *</mat-label>
      <input matInput formControlName="nameEn" placeholder="Egypt">
      <mat-error *ngIf="form.get('nameEn')?.hasError('required')">Required</mat-error>
    </mat-form-field>

    <!-- Name Arabic -->
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>{{ 'admin.countries.nameAr' | translate }}</mat-label>
      <input matInput formControlName="nameAr" placeholder="مصر" dir="rtl">
    </mat-form-field>

    <!-- Name Local -->
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>{{ 'admin.countries.nameLocal' | translate }}</mat-label>
      <input matInput formControlName="nameLocal" placeholder="Local name">
    </mat-form-field>

    <!-- Region -->
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>{{ 'admin.countries.region' | translate }}</mat-label>
      <mat-select formControlName="region">
        <mat-option value="">None</mat-option>
        <mat-option *ngFor="let region of regions" [value]="region">{{ region }}</mat-option>
      </mat-select>
    </mat-form-field>

    <div class="row">
      <!-- Display Order -->
      <mat-form-field appearance="outline">
        <mat-label>{{ 'admin.countries.order' | translate }}</mat-label>
        <input matInput type="number" formControlName="displayOrder" min="0">
      </mat-form-field>

      <!-- Is Active -->
      <mat-checkbox formControlName="isActive">
        {{ 'admin.countries.isActive' | translate }}
      </mat-checkbox>
    </div>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-button mat-dialog-close [disabled]="saving">
    {{ 'common.cancel' | translate }}
  </button>
  <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving">
    <mat-spinner *ngIf="saving" diameter="20"></mat-spinner>
    {{ isEdit ? ('common.save' | translate) : ('common.create' | translate) }}
  </button>
</mat-dialog-actions>
```

### File: `src/app/features/admin/countries/countries-list.component.scss`

```scss
.countries-container {
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  
  h1 {
    margin: 0;
  }
}

.filters {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  
  mat-form-field {
    width: 200px;
  }
}

.table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.countries-table {
  width: 100%;
  
  .flag-cell {
    font-size: 1.5em;
    width: 50px;
  }
  
  .mat-column-actions {
    width: 150px;
    text-align: center;
  }
}

.no-data {
  padding: 48px;
  text-align: center;
  color: #666;
}
```

### File: `src/app/features/admin/countries/country-dialog.component.scss`

```scss
.country-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 400px;
}

.full-width {
  width: 100%;
}

.code-field {
  width: 150px;
}

.row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.flag-preview {
  font-size: 1.5em;
  margin-right: 8px;
}

mat-dialog-content {
  padding-top: 16px;
}
```

---

## Translations

### en.json

```json
{
  "admin": {
    "countries": {
      "title": "Countries Management",
      "add": "Add Country",
      "edit": "Edit Country",
      "code": "Code",
      "nameEn": "Name (English)",
      "nameAr": "Name (Arabic)",
      "nameLocal": "Local Name",
      "region": "Region",
      "order": "Order",
      "isActive": "Active",
      "activeOnly": "Active only"
    }
  }
}
```

### ar.json

```json
{
  "admin": {
    "countries": {
      "title": "إدارة الدول",
      "add": "إضافة دولة",
      "edit": "تعديل دولة",
      "code": "الرمز",
      "nameEn": "الاسم (إنجليزي)",
      "nameAr": "الاسم (عربي)",
      "nameLocal": "الاسم المحلي",
      "region": "المنطقة",
      "order": "الترتيب",
      "isActive": "نشط",
      "activeOnly": "النشطة فقط"
    }
  }
}
```

---

## Add Route

```typescript
// In admin-routing.module.ts
{
  path: 'countries',
  component: CountriesListComponent,
  canActivate: [SuperAdminGuard]
}
```

---

## Summary

| Feature | Endpoint |
|---------|----------|
| List all | `GET /api/admin/countries` |
| Get one | `GET /api/admin/countries/{code}` |
| Create | `POST /api/admin/countries` |
| Update | `PUT /api/admin/countries/{code}` |
| Delete | `DELETE /api/admin/countries/{code}` |
| Toggle active | `PATCH /api/admin/countries/{code}/toggle-active` |
| Get regions | `GET /api/admin/countries/regions` |
