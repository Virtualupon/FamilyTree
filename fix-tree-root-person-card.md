# Fix: Family Tree Root Person Card - Display Name in User's Language

## Problem

In the Family Tree view, there are two display areas:
1. **Top root person card** - Shows "أحمد المصرى" (Arabic) ❌ WRONG
2. **Tree nodes below** - Shows "Ahmed El-Masry", "Samiha" ✓ CORRECT

The tree nodes are correctly displaying English names, but the **top selected person card** is still showing Arabic/PrimaryName instead of the language-appropriate name.

## Task

1. Find the file containing the top root person card template
2. Update it to use language-aware name display

## Step 1: Find the File

Search for the template that displays the selected/root person. Run these searches:

```bash
# Search for selectedPerson or rootPerson in templates
grep -r "selectedPerson\|rootPerson\|currentPerson" --include="*.html" src/app/

# Search for the dropdown arrow (▼) which appears in the screenshot
grep -r "▼\|dropdown\|selected.*person" --include="*.html" src/app/features/family-tree/

# Search for primaryName usage in family-tree related files
grep -r "primaryName\|\.name" --include="*.html" src/app/features/family-tree/

# Search for the component that might contain this
grep -r "class.*root\|class.*selected\|class.*current" --include="*.html" src/app/features/family-tree/
```

The file is likely one of:
- `src/app/features/family-tree/family-tree.component.html`
- `src/app/features/family-tree/components/person-selector.component.html`
- `src/app/features/family-tree/components/root-person.component.html`
- `src/app/features/family-tree/components/selected-person.component.html`

## Step 2: Identify the Problematic Code

Look for code like:

```html
<!-- The top card likely has something like this -->
<div class="selected-person">
  {{ selectedPerson?.primaryName }}
  <!-- or -->
  {{ selectedPerson?.name }}
  <!-- or -->
  {{ rootPerson.primaryName }}
</div>
```

Or it might be in a component that receives the person as input:

```html
<app-person-card [person]="selectedPerson"></app-person-card>
```

## Step 3: Fix the Component

### Option A: If using inline display

**Find in the template:**
```html
{{ selectedPerson?.primaryName }}
<!-- or -->
{{ person.name }}
```

**Replace with:**
```html
{{ getPersonDisplayName(selectedPerson) }}
<!-- or -->
{{ getPersonDisplayName(person) }}
```

**Add to the component TypeScript file:**

```typescript
import { I18nService } from '@core/services/i18n.service';

// In constructor
constructor(
  private i18n: I18nService,
  // ... other dependencies
) {}

// Add this method
getPersonDisplayName(person: any): string {
  if (!person) return '';
  
  const lang = this.i18n.currentLang();
  
  switch (lang) {
    case 'ar':
      return person.nameArabic || person.primaryName || '';
    case 'nob':
      return person.nameNobiin || person.nameEnglish || person.primaryName || '';
    default: // 'en'
      return person.nameEnglish || person.primaryName || '';
  }
}
```

### Option B: If using a shared component

If the display is in a shared component like `PersonCardComponent`, find that component and apply the same fix there.

### Option C: If using a pipe

Check if there's already a pipe being used. If so, ensure it's the language-aware version:

```html
{{ person | personName }}
```

## Step 4: Check Data Binding

Make sure the person object has all name fields. Check the component's data:

```typescript
// The selectedPerson should have these fields
interface Person {
  id: string;
  primaryName: string;
  nameArabic?: string;
  nameEnglish?: string;
  nameNobiin?: string;
}
```

If the data is coming from an API, verify the API returns all name columns.

## Step 5: Verify the Fix

After making changes:
1. Refresh the Family Tree page
2. The top card should now show "Ahmed El-Masry" (English) instead of "أحمد المصرى"
3. Switch language to Arabic - should show "أحمد المصرى"
4. Switch language to Nobiin - should show the Nobiin version

## Example Complete Fix

If the file is `family-tree.component.ts` and `family-tree.component.html`:

**family-tree.component.ts:**
```typescript
import { Component } from '@angular/core';
import { I18nService } from '@core/services/i18n.service';

@Component({
  selector: 'app-family-tree',
  templateUrl: './family-tree.component.html'
})
export class FamilyTreeComponent {
  selectedPerson: any;
  
  constructor(private i18n: I18nService) {}
  
  getPersonDisplayName(person: any): string {
    if (!person) return '';
    
    const lang = this.i18n.currentLang();
    
    switch (lang) {
      case 'ar':
        return person.nameArabic || person.primaryName || '';
      case 'nob':
        return person.nameNobiin || person.nameEnglish || person.primaryName || '';
      default:
        return person.nameEnglish || person.primaryName || '';
    }
  }
}
```

**family-tree.component.html:**
```html
<!-- Before -->
<div class="root-person-card">
  <span class="avatar">{{ getInitials(selectedPerson?.primaryName) }}</span>
  <span class="name">{{ selectedPerson?.primaryName }}</span>
  <span class="dropdown-arrow">▼</span>
</div>

<!-- After -->
<div class="root-person-card">
  <span class="avatar">{{ getInitials(getPersonDisplayName(selectedPerson)) }}</span>
  <span class="name">{{ getPersonDisplayName(selectedPerson) }}</span>
  <span class="dropdown-arrow">▼</span>
</div>
```

## Summary

1. **Find** the template file with the top person card
2. **Replace** `primaryName` or `name` with `getPersonDisplayName(person)`
3. **Add** the `getPersonDisplayName` method to the component
4. **Inject** `I18nService` in the constructor
5. **Test** by switching languages
