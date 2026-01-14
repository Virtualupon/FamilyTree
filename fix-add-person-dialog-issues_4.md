# Fix: Add Person Dialog - Dropdown Styling, Sex Options, and Nationality Country List

## Issues to Fix

1. **Dropdown backgrounds are transparent** - Options hard to read
2. **Sex field has "Unknown" option** - Should only have Male and Female
3. **Nationality should be a country dropdown** - Not a text input

---

## Issue #1: Fix Dropdown Transparent Backgrounds

### Find the Dialog Component

Search for the Add Person dialog:

```bash
grep -r "Add Person\|AddPerson\|add-person" --include="*.html" --include="*.ts" src/app/
grep -r "mat-select\|mat-option" --include="*.html" src/app/features/
```

### Fix: Add Background Color to Dropdowns

**Option A: Global Fix in styles.scss**

Add to `src/styles.scss` or your global styles:

```scss
// Fix dropdown panel background
.mat-mdc-select-panel,
.mat-select-panel,
.cdk-overlay-pane .mat-mdc-select-panel {
  background-color: #ffffff !important;
}

.mat-mdc-option,
.mat-option {
  background-color: #ffffff;
  
  &:hover {
    background-color: #f5f5f5;
  }
  
  &.mat-mdc-option-active,
  &.mat-active {
    background-color: #e8e8e8;
  }
}
```

**Option B: Component-Level Fix**

In the dialog component's SCSS file:

```scss
::ng-deep {
  .mat-mdc-select-panel {
    background-color: white;
  }
  
  .mat-mdc-option {
    background-color: white;
    
    &:hover {
      background-color: #f5f5f5;
    }
  }
}
```

---

## Issue #2: Fix Sex Field - Only Male and Female

### Backend Model

**File: `Models/Enums/Sex.cs`**

```csharp
public enum Sex
{
    Male = 0,
    Female = 1
}
```

### Frontend Fix

**Find the sex dropdown in the template and update:**

```html
<!-- Fixed - Only Male and Female -->
<mat-select formControlName="sex" required>
  <mat-option [value]="0">{{ 'person.sex.male' | translate }}</mat-option>
  <mat-option [value]="1">{{ 'person.sex.female' | translate }}</mat-option>
</mat-select>
```

**Or use a constant array in the component:**

```typescript
// In the component
sexOptions = [
  { value: 0, label: 'Male' },
  { value: 1, label: 'Female' }
];
```

```html
<mat-select formControlName="sex" required>
  <mat-option *ngFor="let option of sexOptions" [value]="option.value">
    {{ option.label }}
  </mat-option>
</mat-select>
```

**Remove "Unknown" from dropdown** - it should NOT be an option for Sex.

---

## Issue #3: Nationality - Country Autocomplete with Type-Ahead

### Step 1: Create Countries Data File

Create `src/assets/data/countries.json`:

```json
[
  { "code": "AF", "name": "Afghanistan", "nameAr": "أفغانستان" },
  { "code": "AL", "name": "Albania", "nameAr": "ألبانيا" },
  { "code": "DZ", "name": "Algeria", "nameAr": "الجزائر" },
  { "code": "AD", "name": "Andorra", "nameAr": "أندورا" },
  { "code": "AO", "name": "Angola", "nameAr": "أنغولا" },
  { "code": "AG", "name": "Antigua and Barbuda", "nameAr": "أنتيغوا وبربودا" },
  { "code": "AR", "name": "Argentina", "nameAr": "الأرجنتين" },
  { "code": "AM", "name": "Armenia", "nameAr": "أرمينيا" },
  { "code": "AU", "name": "Australia", "nameAr": "أستراليا" },
  { "code": "AT", "name": "Austria", "nameAr": "النمسا" },
  { "code": "AZ", "name": "Azerbaijan", "nameAr": "أذربيجان" },
  { "code": "BS", "name": "Bahamas", "nameAr": "الباهاما" },
  { "code": "BH", "name": "Bahrain", "nameAr": "البحرين" },
  { "code": "BD", "name": "Bangladesh", "nameAr": "بنغلاديش" },
  { "code": "BB", "name": "Barbados", "nameAr": "بربادوس" },
  { "code": "BY", "name": "Belarus", "nameAr": "بيلاروسيا" },
  { "code": "BE", "name": "Belgium", "nameAr": "بلجيكا" },
  { "code": "BZ", "name": "Belize", "nameAr": "بليز" },
  { "code": "BJ", "name": "Benin", "nameAr": "بنين" },
  { "code": "BT", "name": "Bhutan", "nameAr": "بوتان" },
  { "code": "BO", "name": "Bolivia", "nameAr": "بوليفيا" },
  { "code": "BA", "name": "Bosnia and Herzegovina", "nameAr": "البوسنة والهرسك" },
  { "code": "BW", "name": "Botswana", "nameAr": "بوتسوانا" },
  { "code": "BR", "name": "Brazil", "nameAr": "البرازيل" },
  { "code": "BN", "name": "Brunei", "nameAr": "بروناي" },
  { "code": "BG", "name": "Bulgaria", "nameAr": "بلغاريا" },
  { "code": "KH", "name": "Cambodia", "nameAr": "كمبوديا" },
  { "code": "CM", "name": "Cameroon", "nameAr": "الكاميرون" },
  { "code": "CA", "name": "Canada", "nameAr": "كندا" },
  { "code": "CL", "name": "Chile", "nameAr": "تشيلي" },
  { "code": "CN", "name": "China", "nameAr": "الصين" },
  { "code": "CO", "name": "Colombia", "nameAr": "كولومبيا" },
  { "code": "KM", "name": "Comoros", "nameAr": "جزر القمر" },
  { "code": "CR", "name": "Costa Rica", "nameAr": "كوستاريكا" },
  { "code": "HR", "name": "Croatia", "nameAr": "كرواتيا" },
  { "code": "CU", "name": "Cuba", "nameAr": "كوبا" },
  { "code": "CY", "name": "Cyprus", "nameAr": "قبرص" },
  { "code": "CZ", "name": "Czech Republic", "nameAr": "التشيك" },
  { "code": "DK", "name": "Denmark", "nameAr": "الدنمارك" },
  { "code": "DJ", "name": "Djibouti", "nameAr": "جيبوتي" },
  { "code": "DO", "name": "Dominican Republic", "nameAr": "جمهورية الدومينيكان" },
  { "code": "EC", "name": "Ecuador", "nameAr": "الإكوادور" },
  { "code": "EG", "name": "Egypt", "nameAr": "مصر" },
  { "code": "SV", "name": "El Salvador", "nameAr": "السلفادور" },
  { "code": "ER", "name": "Eritrea", "nameAr": "إريتريا" },
  { "code": "EE", "name": "Estonia", "nameAr": "إستونيا" },
  { "code": "ET", "name": "Ethiopia", "nameAr": "إثيوبيا" },
  { "code": "FI", "name": "Finland", "nameAr": "فنلندا" },
  { "code": "FR", "name": "France", "nameAr": "فرنسا" },
  { "code": "GA", "name": "Gabon", "nameAr": "الغابون" },
  { "code": "GM", "name": "Gambia", "nameAr": "غامبيا" },
  { "code": "GE", "name": "Georgia", "nameAr": "جورجيا" },
  { "code": "DE", "name": "Germany", "nameAr": "ألمانيا" },
  { "code": "GH", "name": "Ghana", "nameAr": "غانا" },
  { "code": "GR", "name": "Greece", "nameAr": "اليونان" },
  { "code": "GT", "name": "Guatemala", "nameAr": "غواتيمالا" },
  { "code": "GN", "name": "Guinea", "nameAr": "غينيا" },
  { "code": "HT", "name": "Haiti", "nameAr": "هايتي" },
  { "code": "HN", "name": "Honduras", "nameAr": "هندوراس" },
  { "code": "HU", "name": "Hungary", "nameAr": "المجر" },
  { "code": "IS", "name": "Iceland", "nameAr": "آيسلندا" },
  { "code": "IN", "name": "India", "nameAr": "الهند" },
  { "code": "ID", "name": "Indonesia", "nameAr": "إندونيسيا" },
  { "code": "IR", "name": "Iran", "nameAr": "إيران" },
  { "code": "IQ", "name": "Iraq", "nameAr": "العراق" },
  { "code": "IE", "name": "Ireland", "nameAr": "أيرلندا" },
  { "code": "IL", "name": "Israel", "nameAr": "إسرائيل" },
  { "code": "IT", "name": "Italy", "nameAr": "إيطاليا" },
  { "code": "JM", "name": "Jamaica", "nameAr": "جامايكا" },
  { "code": "JP", "name": "Japan", "nameAr": "اليابان" },
  { "code": "JO", "name": "Jordan", "nameAr": "الأردن" },
  { "code": "KZ", "name": "Kazakhstan", "nameAr": "كازاخستان" },
  { "code": "KE", "name": "Kenya", "nameAr": "كينيا" },
  { "code": "KW", "name": "Kuwait", "nameAr": "الكويت" },
  { "code": "KG", "name": "Kyrgyzstan", "nameAr": "قيرغيزستان" },
  { "code": "LA", "name": "Laos", "nameAr": "لاوس" },
  { "code": "LV", "name": "Latvia", "nameAr": "لاتفيا" },
  { "code": "LB", "name": "Lebanon", "nameAr": "لبنان" },
  { "code": "LY", "name": "Libya", "nameAr": "ليبيا" },
  { "code": "LT", "name": "Lithuania", "nameAr": "ليتوانيا" },
  { "code": "LU", "name": "Luxembourg", "nameAr": "لوكسمبورغ" },
  { "code": "MK", "name": "North Macedonia", "nameAr": "مقدونيا الشمالية" },
  { "code": "MG", "name": "Madagascar", "nameAr": "مدغشقر" },
  { "code": "MY", "name": "Malaysia", "nameAr": "ماليزيا" },
  { "code": "MV", "name": "Maldives", "nameAr": "المالديف" },
  { "code": "ML", "name": "Mali", "nameAr": "مالي" },
  { "code": "MT", "name": "Malta", "nameAr": "مالطا" },
  { "code": "MR", "name": "Mauritania", "nameAr": "موريتانيا" },
  { "code": "MU", "name": "Mauritius", "nameAr": "موريشيوس" },
  { "code": "MX", "name": "Mexico", "nameAr": "المكسيك" },
  { "code": "MD", "name": "Moldova", "nameAr": "مولدوفا" },
  { "code": "MN", "name": "Mongolia", "nameAr": "منغوليا" },
  { "code": "ME", "name": "Montenegro", "nameAr": "الجبل الأسود" },
  { "code": "MA", "name": "Morocco", "nameAr": "المغرب" },
  { "code": "MZ", "name": "Mozambique", "nameAr": "موزمبيق" },
  { "code": "MM", "name": "Myanmar", "nameAr": "ميانمار" },
  { "code": "NA", "name": "Namibia", "nameAr": "ناميبيا" },
  { "code": "NP", "name": "Nepal", "nameAr": "نيبال" },
  { "code": "NL", "name": "Netherlands", "nameAr": "هولندا" },
  { "code": "NZ", "name": "New Zealand", "nameAr": "نيوزيلندا" },
  { "code": "NI", "name": "Nicaragua", "nameAr": "نيكاراغوا" },
  { "code": "NE", "name": "Niger", "nameAr": "النيجر" },
  { "code": "NG", "name": "Nigeria", "nameAr": "نيجيريا" },
  { "code": "KP", "name": "North Korea", "nameAr": "كوريا الشمالية" },
  { "code": "NO", "name": "Norway", "nameAr": "النرويج" },
  { "code": "OM", "name": "Oman", "nameAr": "عمان" },
  { "code": "PK", "name": "Pakistan", "nameAr": "باكستان" },
  { "code": "PS", "name": "Palestine", "nameAr": "فلسطين" },
  { "code": "PA", "name": "Panama", "nameAr": "بنما" },
  { "code": "PY", "name": "Paraguay", "nameAr": "باراغواي" },
  { "code": "PE", "name": "Peru", "nameAr": "بيرو" },
  { "code": "PH", "name": "Philippines", "nameAr": "الفلبين" },
  { "code": "PL", "name": "Poland", "nameAr": "بولندا" },
  { "code": "PT", "name": "Portugal", "nameAr": "البرتغال" },
  { "code": "QA", "name": "Qatar", "nameAr": "قطر" },
  { "code": "RO", "name": "Romania", "nameAr": "رومانيا" },
  { "code": "RU", "name": "Russia", "nameAr": "روسيا" },
  { "code": "RW", "name": "Rwanda", "nameAr": "رواندا" },
  { "code": "SA", "name": "Saudi Arabia", "nameAr": "السعودية" },
  { "code": "SN", "name": "Senegal", "nameAr": "السنغال" },
  { "code": "RS", "name": "Serbia", "nameAr": "صربيا" },
  { "code": "SG", "name": "Singapore", "nameAr": "سنغافورة" },
  { "code": "SK", "name": "Slovakia", "nameAr": "سلوفاكيا" },
  { "code": "SI", "name": "Slovenia", "nameAr": "سلوفينيا" },
  { "code": "SO", "name": "Somalia", "nameAr": "الصومال" },
  { "code": "ZA", "name": "South Africa", "nameAr": "جنوب أفريقيا" },
  { "code": "KR", "name": "South Korea", "nameAr": "كوريا الجنوبية" },
  { "code": "SS", "name": "South Sudan", "nameAr": "جنوب السودان" },
  { "code": "ES", "name": "Spain", "nameAr": "إسبانيا" },
  { "code": "LK", "name": "Sri Lanka", "nameAr": "سريلانكا" },
  { "code": "SD", "name": "Sudan", "nameAr": "السودان" },
  { "code": "SE", "name": "Sweden", "nameAr": "السويد" },
  { "code": "CH", "name": "Switzerland", "nameAr": "سويسرا" },
  { "code": "SY", "name": "Syria", "nameAr": "سوريا" },
  { "code": "TW", "name": "Taiwan", "nameAr": "تايوان" },
  { "code": "TJ", "name": "Tajikistan", "nameAr": "طاجيكستان" },
  { "code": "TZ", "name": "Tanzania", "nameAr": "تنزانيا" },
  { "code": "TH", "name": "Thailand", "nameAr": "تايلاند" },
  { "code": "TN", "name": "Tunisia", "nameAr": "تونس" },
  { "code": "TR", "name": "Turkey", "nameAr": "تركيا" },
  { "code": "TM", "name": "Turkmenistan", "nameAr": "تركمانستان" },
  { "code": "UG", "name": "Uganda", "nameAr": "أوغندا" },
  { "code": "UA", "name": "Ukraine", "nameAr": "أوكرانيا" },
  { "code": "AE", "name": "United Arab Emirates", "nameAr": "الإمارات" },
  { "code": "GB", "name": "United Kingdom", "nameAr": "المملكة المتحدة" },
  { "code": "US", "name": "United States", "nameAr": "الولايات المتحدة" },
  { "code": "UY", "name": "Uruguay", "nameAr": "أوروغواي" },
  { "code": "UZ", "name": "Uzbekistan", "nameAr": "أوزبكستان" },
  { "code": "VE", "name": "Venezuela", "nameAr": "فنزويلا" },
  { "code": "VN", "name": "Vietnam", "nameAr": "فيتنام" },
  { "code": "YE", "name": "Yemen", "nameAr": "اليمن" },
  { "code": "ZM", "name": "Zambia", "nameAr": "زامبيا" },
  { "code": "ZW", "name": "Zimbabwe", "nameAr": "زيمبابوي" }
]
```

### Step 2: Create Countries Service

Create `src/app/core/services/countries.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, shareReplay, catchError, tap } from 'rxjs/operators';
import { I18nService } from './i18n.service';

export interface Country {
  code: string;
  name: string;
  nameAr?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CountriesService {
  private countries: Country[] = [];
  private countries$: Observable<Country[]> | null = null;

  constructor(
    private http: HttpClient,
    private i18n: I18nService
  ) {}

  getCountries(): Observable<Country[]> {
    if (!this.countries$) {
      this.countries$ = this.http.get<Country[]>('/assets/data/countries.json').pipe(
        tap(countries => this.countries = countries),
        shareReplay(1),
        catchError(() => of([]))
      );
    }
    return this.countries$;
  }

  getCountryDisplayName(country: Country): string {
    if (!country) return '';
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && country.nameAr) {
      return country.nameAr;
    }
    return country.name;
  }

  getCountryByCode(code: string): Country | undefined {
    return this.countries.find(c => c.code === code);
  }

  filterCountries(searchText: string, countries: Country[]): Country[] {
    if (!searchText) return countries;
    
    const search = searchText.toLowerCase();
    return countries.filter(country => 
      country.name.toLowerCase().includes(search) ||
      (country.nameAr && country.nameAr.includes(searchText)) ||
      country.code.toLowerCase().includes(search)
    );
  }
}
```

### Step 3: Update Dialog Component TypeScript

In your Add Person dialog component (e.g., `add-person-dialog.component.ts`):

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { startWith, map, takeUntil } from 'rxjs/operators';
import { CountriesService, Country } from '@core/services/countries.service';
import { I18nService } from '@core/services/i18n.service';

@Component({
  selector: 'app-add-person-dialog',
  templateUrl: './add-person-dialog.component.html',
  styleUrls: ['./add-person-dialog.component.scss']
})
export class AddPersonDialogComponent implements OnInit, OnDestroy {
  form: FormGroup;
  
  // Countries autocomplete
  countries: Country[] = [];
  filteredCountries$: Observable<Country[]>;
  nationalityControl = new FormControl('');
  
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private countriesService: CountriesService,
    private i18n: I18nService
  ) {}

  ngOnInit() {
    // Load countries
    this.countriesService.getCountries()
      .pipe(takeUntil(this.destroy$))
      .subscribe(countries => {
        this.countries = countries;
      });

    // Setup filtered countries for autocomplete
    this.filteredCountries$ = this.nationalityControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        // If value is a Country object, extract the display name for filtering
        const searchText = typeof value === 'string' ? value : this.getCountryDisplayName(value);
        return this.countriesService.filterCountries(searchText, this.countries);
      })
    );

    // Build form
    this.form = this.fb.group({
      fullName: [''],
      sex: [0],
      nationality: this.nationalityControl,
      // ... other fields
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Display function for autocomplete - shows country name in input
  displayCountry = (country: Country | string): string => {
    if (!country) return '';
    if (typeof country === 'string') {
      // If it's a code, find the country
      const found = this.countries.find(c => c.code === country);
      return found ? this.getCountryDisplayName(found) : country;
    }
    return this.getCountryDisplayName(country);
  }

  // Get display name based on current language
  getCountryDisplayName(country: Country): string {
    return this.countriesService.getCountryDisplayName(country);
  }

  // When saving, extract the country code
  onSave() {
    const formValue = this.form.value;
    
    // Get nationality code
    let nationalityCode = '';
    if (formValue.nationality) {
      if (typeof formValue.nationality === 'object') {
        nationalityCode = formValue.nationality.code;
      } else {
        nationalityCode = formValue.nationality;
      }
    }

    const personData = {
      ...formValue,
      nationality: nationalityCode
    };

    // Save personData...
  }
}
```

### Step 4: Update Dialog Template

```html
<!-- Nationality Autocomplete -->
<mat-form-field appearance="outline" class="full-width">
  <mat-label>{{ 'person.nationality' | translate }}</mat-label>
  <input type="text"
         matInput
         [formControl]="nationalityControl"
         [matAutocomplete]="countryAuto"
         placeholder="{{ 'person.nationalityPlaceholder' | translate }}">
  <mat-icon matSuffix>flag</mat-icon>
  <mat-autocomplete #countryAuto="matAutocomplete" 
                    [displayWith]="displayCountry"
                    autoActiveFirstOption>
    <mat-option *ngFor="let country of filteredCountries$ | async" [value]="country">
      <span class="country-option">
        <span class="country-code">{{ country.code }}</span>
        <span class="country-name">{{ getCountryDisplayName(country) }}</span>
      </span>
    </mat-option>
  </mat-autocomplete>
  <mat-hint>{{ 'person.nationalityHint' | translate }}</mat-hint>
</mat-form-field>
```

### Step 5: Add Country Flag Emojis (Lightweight!)

The most efficient way to show flags - **no images, no external resources** - just convert country code to Unicode flag emoji.

**Add this method to your component or service:**

```typescript
/**
 * Converts country code to flag emoji using Unicode Regional Indicator Symbols
 * Example: "EG" → "🇪🇬", "US" → "🇺🇸", "SA" → "🇸🇦"
 */
getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}
```

**Update the template to show flags:**

```html
<mat-autocomplete #countryAuto="matAutocomplete" 
                  [displayWith]="displayCountry"
                  autoActiveFirstOption>
  <mat-option *ngFor="let country of filteredCountries$ | async" [value]="country">
    <span class="country-option">
      <span class="country-flag">{{ getCountryFlag(country.code) }}</span>
      <span class="country-name">{{ getCountryDisplayName(country) }}</span>
    </span>
  </mat-option>
</mat-autocomplete>
```

**Update the input to show selected flag:**

```html
<mat-form-field appearance="outline" class="full-width">
  <mat-label>{{ 'person.nationality' | translate }}</mat-label>
  <span matPrefix *ngIf="nationalityControl.value" class="selected-flag">
    {{ getCountryFlag(nationalityControl.value?.code || nationalityControl.value) }}
  </span>
  <input type="text"
         matInput
         [formControl]="nationalityControl"
         [matAutocomplete]="countryAuto"
         placeholder="{{ 'person.nationalityPlaceholder' | translate }}">
  <mat-autocomplete #countryAuto="matAutocomplete" 
                    [displayWith]="displayCountry"
                    autoActiveFirstOption>
    <mat-option *ngFor="let country of filteredCountries$ | async" [value]="country">
      <span class="country-option">
        <span class="country-flag">{{ getCountryFlag(country.code) }}</span>
        <span class="country-name">{{ getCountryDisplayName(country) }}</span>
      </span>
    </mat-option>
  </mat-autocomplete>
</mat-form-field>
```

### Step 6: Add Styles

```scss
.country-option {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .country-flag {
    font-size: 1.2em;
    line-height: 1;
  }
  
  .country-name {
    flex: 1;
  }
}

.selected-flag {
  font-size: 1.2em;
  margin-right: 8px;
}

// Ensure dropdown has white background
::ng-deep .mat-mdc-autocomplete-panel {
  background-color: white;
}
```

### Step 7: Add Translations

**en.json:**
```json
{
  "person": {
    "nationality": "Nationality",
    "nationalityPlaceholder": "Start typing to search...",
    "nationalityHint": "Type country name to search"
  }
}
```

**ar.json:**
```json
{
  "person": {
    "nationality": "الجنسية",
    "nationalityPlaceholder": "ابدأ الكتابة للبحث...",
    "nationalityHint": "اكتب اسم الدولة للبحث"
  }
}
```

### Step 8: Required Imports in Module

Make sure your module has these imports:

```typescript
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ReactiveFormsModule } from '@angular/forms';

@NgModule({
  imports: [
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    // ...
  ]
})
export class YourModule {}

---

## Summary of Changes

| Issue | File(s) | Fix |
|-------|---------|-----|
| Dropdown transparency | `styles.scss` or component SCSS | Add `background-color: white` to dropdown panels |
| Sex options | Dialog component HTML | Remove "Unknown" - only Male and Female |
| Nationality dropdown | Create `countries.service.ts`, update dialog | Load countries from JSON, use mat-select |

## Dependencies

If using searchable dropdown, install:
```bash
npm install ngx-mat-select-search
```

Or use Angular Material's built-in autocomplete (no extra dependency needed).
