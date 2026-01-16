# Fix Relationship Path Display

## ISSUES TO FIX

1. **Names show Arabic instead of English** - PathPersonNode interface was missing `nameEnglish`, `nameArabic`, `nameNobiin` fields ✅ FIXED
2. **Description shows "Brother" instead of "Ahmed is Atef's brother"** - Backend code is correct but needs rebuild
3. **Improve header visibility** - Make the relationship label more prominent

---

## ALREADY FIXED

### Frontend Interface (✅ Done)

**File:** `frontend/src/app/core/models/relationship-path.models.ts`

Added these fields to `PathPersonNode`:
```typescript
nameArabic?: string;
nameEnglish?: string;
nameNobiin?: string;
```

### Backend Method (✅ Done)

**File:** `api/FamilyTreeApi/Helpers/RelationshipNamer.cs`

`GetSiblingRelationship` now returns proper description:
```csharp
private static (string NameKey, string Description) GetSiblingRelationship(PathPersonNode person1, PathPersonNode person2)
{
    var (key, term) = GetGenderedTerm("sibling", person2.Sex);
    var name1 = person1.NameEnglish ?? person1.PrimaryName;
    var name2 = person2.NameEnglish ?? person2.PrimaryName;
    return (key, $"{name2} is {name1}'s {term}");
}
```

---

## ACTION REQUIRED

### 1. Rebuild Backend
```bash
cd api/FamilyTreeApi
dotnet build
# or restart the service
```

### 2. Rebuild Frontend
```bash
cd frontend
ng build
# or ng serve
```

---

## OPTIONAL: Enhanced Header Display

If you want the relationship label to be even more prominent, update the header styles:

**File:** `frontend/src/app/features/tree/relationship-path-view.component.ts`

Find the `&__header` styles and replace with:

```scss
&__header {
  background: var(--ft-primary);
  color: white;
  padding: var(--ft-spacing-lg) var(--ft-spacing-xl);
  text-align: center;
}

&__header-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ft-spacing-md);
  position: relative;
}

&__close {
  color: white;
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
}

&__title-group {
  text-align: center;
}

&__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
}

&__description {
  margin: var(--ft-spacing-sm) 0 0;
  opacity: 0.95;
  font-size: 1rem;
}
```

---

## EXPECTED RESULT

After rebuild:

**Header:**
- **Title:** "Brother" (large, centered)
- **Description:** "Ahmed is Atef's brother"

**Path Cards:**
- **Names:** "Atef", "Mohamed Kabaga", "Ahmed" (English names)

---

## VERIFICATION CHECKLIST

- [ ] Rebuilt backend
- [ ] Rebuilt frontend  
- [ ] Names display in English when language is English
- [ ] Description shows full sentence "Ahmed is Atef's brother"
- [ ] Header is clearly visible with relationship type
