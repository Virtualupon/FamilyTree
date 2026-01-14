# Fix: Family Tree View - Display Names in User's Selected Language

## Problem

The Family Tree view is displaying names in Arabic (`NameArabic` or `PrimaryName`) even when the user is logged in with English language. The tree should display `NameEnglish` for English users, `NameArabic` for Arabic users, and `NameNobiin` for Nobiin users.

## Screenshot Evidence

- User logged in as English (GB flag visible)
- Tree shows: "أحمد", "بدر", "خضره", "متولى", "زهره", "عطيه" (all Arabic)
- Should show: "Ahmed", "Badr", "Khadra", "Metwally", "Zahra", "Atiya" (all English)

## Files to Modify

The tree view component(s) - likely one of these:
- `src/app/features/family-tree/family-tree.component.ts`
- `src/app/features/family-tree/tree-view.component.ts`
- `src/app/features/family-tree/components/tree-node.component.ts`
- Or similar tree-related components

## Fix: Add Language-Aware Name Display

### Step 1: Inject I18nService

In the tree component, inject the I18nService:

```typescript
import { I18nService } from '@core/services/i18n.service';

export class FamilyTreeComponent {
  constructor(
    private i18n: I18nService,
    // ... other dependencies
  ) {}
}
```

### Step 2: Create getPersonDisplayName Method

Add this method to get the correct name based on current language:

```typescript
/**
 * Gets the display name for a person based on current language setting.
 * Falls back through: LanguageName → PrimaryName → 'Unknown'
 */
getPersonDisplayName(person: any): string {
  if (!person) return 'Unknown';
  
  const lang = this.i18n.currentLang();
  
  switch (lang) {
    case 'ar':
      return person.nameArabic || person.primaryName || 'غير معروف';
    case 'nob':
      return person.nameNobiin || person.nameEnglish || person.primaryName || 'Unknown';
    default: // 'en' or any other
      return person.nameEnglish || person.primaryName || 'Unknown';
  }
}
```

### Step 3: Update Template to Use New Method

Find where the name is displayed in the template (HTML). It probably looks like:

```html
<!-- CURRENT (wrong) -->
<span>{{ person.primaryName }}</span>
<!-- or -->
<span>{{ person.nameArabic }}</span>
<!-- or -->
<span>{{ node.data.name }}</span>
```

**Replace with:**

```html
<!-- FIXED -->
<span>{{ getPersonDisplayName(person) }}</span>
<!-- or -->
<span>{{ getPersonDisplayName(node.data) }}</span>
```

### Step 4: Check Data Model

Make sure the tree node data includes all name fields. The API response should include:

```typescript
interface TreeNode {
  id: string;
  primaryName: string;
  nameArabic?: string;
  nameEnglish?: string;
  nameNobiin?: string;
  // ... other fields
}
```

If the tree is using a different data structure (like `name` instead of `nameEnglish`), you may need to update the backend API or the data mapping.

## Backend Check

Verify the Family Tree API endpoint returns all name columns. Check:

### File: `Controllers/FamilyTreeController.cs` or similar

The tree endpoint should return:

```csharp
return new {
    id = person.Id,
    primaryName = person.PrimaryName,
    nameArabic = person.NameArabic,
    nameEnglish = person.NameEnglish,
    nameNobiin = person.NameNobiin,
    // ... other fields
};
```

### File: DTO for tree nodes

```csharp
public class TreeNodeDto
{
    public Guid Id { get; set; }
    public string PrimaryName { get; set; }
    public string? NameArabic { get; set; }
    public string? NameEnglish { get; set; }
    public string? NameNobiin { get; set; }
    // ... other fields
}
```

## Alternative: Use a Pipe

If the name display is used in multiple places, create a reusable pipe:

### Create `src/app/shared/pipes/person-name.pipe.ts`:

```typescript
import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '@core/services/i18n.service';

@Pipe({
  name: 'personName',
  pure: false // Important: needs to update when language changes
})
export class PersonNamePipe implements PipeTransform {
  constructor(private i18n: I18nService) {}

  transform(person: any): string {
    if (!person) return 'Unknown';
    
    const lang = this.i18n.currentLang();
    
    switch (lang) {
      case 'ar':
        return person.nameArabic || person.primaryName || 'غير معروف';
      case 'nob':
        return person.nameNobiin || person.nameEnglish || person.primaryName || 'Unknown';
      default:
        return person.nameEnglish || person.primaryName || 'Unknown';
    }
  }
}
```

### Usage in template:

```html
<span>{{ person | personName }}</span>
```

### Register in SharedModule:

```typescript
@NgModule({
  declarations: [PersonNamePipe],
  exports: [PersonNamePipe]
})
export class SharedModule {}
```

## Testing

1. Log in as English user
2. Navigate to Family Tree
3. Verify names show in English: "Ahmed", "Mohamed", "Fatma", etc.
4. Switch language to Arabic
5. Verify names show in Arabic: "أحمد", "محمد", "فاطمة", etc.
6. Switch language to Nobiin
7. Verify names show in Nobiin: "ⲁϩⲙⲉⲇ", "ⲙⲟϩⲁⲙⲉⲇ", etc.

## Summary

| Component | Change |
|-----------|--------|
| Tree Component | Inject `I18nService`, add `getPersonDisplayName()` method |
| Tree Template | Use `getPersonDisplayName(person)` instead of `person.primaryName` |
| Backend API | Ensure all name columns are returned in tree endpoint |
| Optional | Create `PersonNamePipe` for reusable name display |
