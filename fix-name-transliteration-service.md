# Fix: NameTransliterationService - Complete Rewrite of Translation Logic

## Overview

The current transliteration service has fundamental logic problems. This prompt provides a complete fix based on the correct understanding of how the system should work.

---

## Data Model Rules

### Person Table Columns

| Column | Must Contain | Script | Example |
|--------|--------------|--------|---------|
| `PrimaryName` | Original entry (depends on user's language) | Any | "محمد" or "Mohamed" or "ⲙⲟϩⲁⲙⲉⲇ" |
| `NameArabic` | Arabic script ONLY | Arabic (U+0600-U+06FF) | "محمد" |
| `NameEnglish` | Latin/English script ONLY | Latin (A-Z, a-z) | "Mohamed" |
| `NameNobiin` | Nobiin/Coptic script ONLY | Coptic (U+2C80-U+2CFF) | "ⲙⲟϩⲁⲙⲉⲇ" |

### Entry Flow Based on User's Language

**User logged in as Arabic:**
```
PrimaryName = "محمد"      ← User entered
NameArabic  = "محمد"      ← Same as PrimaryName
NameEnglish = NULL        ← Needs translation
NameNobiin  = NULL        ← Needs translation
```

**User logged in as English:**
```
PrimaryName = "Mohamed"   ← User entered
NameEnglish = "Mohamed"   ← Same as PrimaryName
NameArabic  = NULL        ← Needs translation
NameNobiin  = NULL        ← Needs translation
```

### Critical Rule
- `NameEnglish` must NEVER contain Arabic text
- `NameArabic` must NEVER contain English text
- Each column is strictly script-specific

---

## Translation Service Logic

### Job: Fill Any NULL Column

The translation service must fill ANY column that is NULL:

```
Before:
├── NameArabic  = "محمد"    ← Has value, SKIP
├── NameEnglish = NULL      ← NULL → FILL IT
└── NameNobiin  = NULL      ← NULL → FILL IT

After:
├── NameArabic  = "محمد"
├── NameEnglish = "Mohamed"
└── NameNobiin  = "ⲙⲟϩⲁⲙⲉⲇ"
```

---

## Cache Lookup Logic

### Step 1: Detect Source Language

Find which column has a value to use as the source:

```csharp
string? sourceValue = null;
string sourceColumn = "";

if (!string.IsNullOrWhiteSpace(person.NameArabic))
{
    sourceValue = person.NameArabic;
    sourceColumn = "Arabic";
}
else if (!string.IsNullOrWhiteSpace(person.NameEnglish))
{
    sourceValue = person.NameEnglish;
    sourceColumn = "English";
}
else if (!string.IsNullOrWhiteSpace(person.NameNobiin))
{
    sourceValue = person.NameNobiin;
    sourceColumn = "Nobiin";
}
else if (!string.IsNullOrWhiteSpace(person.PrimaryName))
{
    // Detect from PrimaryName content
    sourceValue = person.PrimaryName;
    sourceColumn = DetectScriptFromContent(person.PrimaryName);
}
```

### Step 2: Lookup Cache by Source Column

Query `NameMappings` table using the appropriate column:

```csharp
NameMapping? cached = sourceColumn switch
{
    "Arabic" => await _context.NameMappings
        .FirstOrDefaultAsync(m => m.Arabic == sourceValue),
    "English" => await _context.NameMappings
        .FirstOrDefaultAsync(m => m.English == sourceValue),
    "Nobiin" => await _context.NameMappings
        .FirstOrDefaultAsync(m => m.Nobiin == sourceValue),
    _ => null
};
```

### Step 3: Validate Cache is COMPLETE

Only use cache if ALL THREE columns are NOT NULL:

```csharp
bool cacheIsComplete = cached != null &&
    !string.IsNullOrWhiteSpace(cached.Arabic) &&
    !string.IsNullOrWhiteSpace(cached.English) &&
    !string.IsNullOrWhiteSpace(cached.Nobiin);

if (cacheIsComplete)
{
    // USE CACHE - fill missing columns
}
else
{
    // GO TO AI - cache incomplete or not found
}
```

### Step 4: Fill NULL Columns from Cache or AI Result

```csharp
// Fill Arabic if NULL
if (string.IsNullOrWhiteSpace(person.NameArabic))
{
    person.NameArabic = result.Arabic;
}

// Fill English if NULL
if (string.IsNullOrWhiteSpace(person.NameEnglish))
{
    person.NameEnglish = result.English;
}

// Fill Nobiin if NULL
if (string.IsNullOrWhiteSpace(person.NameNobiin))
{
    person.NameNobiin = result.Nobiin;
}
```

---

## File to Modify

`Services/NameTransliterationService.cs`

---

## Fix 1: Rewrite GenerateMissingNamesForPersonAsync

Find the method `GenerateMissingNamesForPersonAsync` (around line 743) and replace it entirely:

```csharp
public async Task<FamilyTreeApi.DTOs.PersonTransliterationResult> GenerateMissingNamesForPersonAsync(
    Guid personId,
    Guid? orgId = null)
{
    var result = new FamilyTreeApi.DTOs.PersonTransliterationResult
    {
        PersonId = personId,
        Success = false
    };

    try
    {
        // Get person
        var person = await _context.People
            .FirstOrDefaultAsync(p => p.Id == personId && (!orgId.HasValue || p.OrgId == orgId));

        if (person == null)
        {
            result.Message = "Person not found";
            return result;
        }

        // Check which columns need filling
        bool needsArabic = string.IsNullOrWhiteSpace(person.NameArabic);
        bool needsEnglish = string.IsNullOrWhiteSpace(person.NameEnglish);
        bool needsNobiin = string.IsNullOrWhiteSpace(person.NameNobiin);

        // If all columns are filled, nothing to do
        if (!needsArabic && !needsEnglish && !needsNobiin)
        {
            result.Success = true;
            result.Message = "Person already has names in all scripts";
            return result;
        }

        // Step 1: Find source value and detect its language/script
        string? sourceValue = null;
        string sourceColumn = "";

        if (!string.IsNullOrWhiteSpace(person.NameArabic))
        {
            sourceValue = person.NameArabic;
            sourceColumn = "Arabic";
        }
        else if (!string.IsNullOrWhiteSpace(person.NameEnglish))
        {
            sourceValue = person.NameEnglish;
            sourceColumn = "English";
        }
        else if (!string.IsNullOrWhiteSpace(person.NameNobiin))
        {
            sourceValue = person.NameNobiin;
            sourceColumn = "Nobiin";
        }
        else if (!string.IsNullOrWhiteSpace(person.PrimaryName))
        {
            sourceValue = person.PrimaryName;
            sourceColumn = DetectScriptFromContent(person.PrimaryName);
        }

        if (string.IsNullOrWhiteSpace(sourceValue))
        {
            result.Message = "Person has no names to transliterate from";
            result.Success = true;
            return result;
        }

        _logger.LogInformation(
            "Translating for person {PersonId}: source='{Source}' from column {Column}, needs: Arabic={NeedsAr}, English={NeedsEn}, Nobiin={NeedsNob}",
            personId, sourceValue, sourceColumn, needsArabic, needsEnglish, needsNobiin);

        // Step 2: Lookup cache by source column
        NameMapping? cached = await LookupCacheBySourceColumn(sourceValue, sourceColumn);

        // Step 3: Check if cache is COMPLETE (all 3 columns have values)
        bool cacheIsComplete = cached != null &&
            !string.IsNullOrWhiteSpace(cached.Arabic) &&
            !string.IsNullOrWhiteSpace(cached.English) &&
            !string.IsNullOrWhiteSpace(cached.Nobiin);

        string? arabic = null;
        string? english = null;
        string? nobiin = null;

        if (cacheIsComplete)
        {
            // Use cache values
            _logger.LogInformation(
                "Found COMPLETE cache for '{Source}' (ID: {Id}): Arabic='{Ar}', English='{En}', Nobiin='{Nob}'",
                sourceValue, cached!.Id, cached.Arabic, cached.English, cached.Nobiin);

            arabic = cached.Arabic;
            english = cached.English;
            nobiin = cached.Nobiin;
        }
        else
        {
            // Cache incomplete or not found - call AI
            if (cached != null)
            {
                _logger.LogInformation(
                    "Found INCOMPLETE cache for '{Source}' (ID: {Id}) - calling AI",
                    sourceValue, cached.Id);
            }
            else
            {
                _logger.LogInformation(
                    "No cache found for '{Source}' - calling AI",
                    sourceValue);
            }

            var translitRequest = new FamilyTreeApi.DTOs.TransliterationRequest
            {
                InputName = sourceValue,
                SourceLanguage = sourceColumn switch
                {
                    "Arabic" => "ar",
                    "English" => "en",
                    "Nobiin" => "nob",
                    _ => DetectSourceLanguageFromContent(sourceValue)
                },
                DisplayLanguage = "en",
                OrgId = person.OrgId,
                PersonId = personId
            };

            var translitResult = await TransliterateNameAsync(translitRequest);

            arabic = translitResult.Arabic;
            english = translitResult.English?.Best;
            nobiin = translitResult.Nobiin?.Value;

            // Add any warnings
            if (translitResult.Metadata?.Warnings?.Any() == true)
            {
                result.Warnings.AddRange(translitResult.Metadata.Warnings);
            }
        }

        // Step 4: Fill NULL columns
        var namesGenerated = 0;

        if (needsArabic && !string.IsNullOrWhiteSpace(arabic))
        {
            person.NameArabic = arabic;
            namesGenerated++;
            result.GeneratedNames.Add(new FamilyTreeApi.DTOs.GeneratedNameInfo
            {
                Script = "Arabic",
                FullName = arabic,
                SourceScript = sourceColumn,
                SourceName = sourceValue,
                Confidence = 1.0
            });
        }

        if (needsEnglish && !string.IsNullOrWhiteSpace(english))
        {
            person.NameEnglish = english;
            namesGenerated++;
            result.GeneratedNames.Add(new FamilyTreeApi.DTOs.GeneratedNameInfo
            {
                Script = "Latin",
                FullName = english,
                SourceScript = sourceColumn,
                SourceName = sourceValue,
                Confidence = 1.0
            });
        }

        if (needsNobiin && !string.IsNullOrWhiteSpace(nobiin))
        {
            person.NameNobiin = nobiin;
            namesGenerated++;
            result.GeneratedNames.Add(new FamilyTreeApi.DTOs.GeneratedNameInfo
            {
                Script = "Coptic/Nobiin",
                FullName = nobiin,
                SourceScript = sourceColumn,
                SourceName = sourceValue,
                Confidence = 1.0
            });
        }

        // Step 5: Save changes
        if (namesGenerated > 0)
        {
            person.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        result.NamesGenerated = namesGenerated;
        result.Success = true;
        result.Message = namesGenerated > 0
            ? $"Generated {namesGenerated} name(s)"
            : "No new names could be generated";

        _logger.LogInformation(
            "Generated {Count} names for person {PersonId}",
            namesGenerated, personId);

        return result;
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error generating names for person {PersonId}", personId);
        result.Message = $"Error: {ex.Message}";
        return result;
    }
}
```

---

## Fix 2: Add LookupCacheBySourceColumn Helper Method

Add this new method to the service (in the Private Helpers region):

```csharp
private async Task<NameMapping?> LookupCacheBySourceColumn(string sourceValue, string sourceColumn)
{
    // Normalize for comparison
    var normalized = NormalizeName(sourceValue);

    return sourceColumn switch
    {
        "Arabic" => await _context.NameMappings
            .Where(m => m.ArabicNormalized == normalized)
            .OrderByDescending(m => m.IsVerified)
            .ThenByDescending(m => m.Confidence ?? 0)
            .FirstOrDefaultAsync(),

        "English" => await _context.NameMappings
            .Where(m => m.EnglishNormalized == normalized)
            .OrderByDescending(m => m.IsVerified)
            .ThenByDescending(m => m.Confidence ?? 0)
            .FirstOrDefaultAsync(),

        "Nobiin" => await _context.NameMappings
            .Where(m => m.NobiinNormalized == normalized)
            .OrderByDescending(m => m.IsVerified)
            .ThenByDescending(m => m.Confidence ?? 0)
            .FirstOrDefaultAsync(),

        _ => null
    };
}
```

---

## Fix 3: Add DetectScriptFromContent Helper Method

Add this method to detect script from content (if not already present):

```csharp
private static string DetectScriptFromContent(string content)
{
    if (string.IsNullOrWhiteSpace(content))
        return "English"; // Default

    foreach (var ch in content)
    {
        // Arabic: U+0600 to U+06FF
        if (ch >= '\u0600' && ch <= '\u06FF')
            return "Arabic";

        // Coptic/Nobiin: U+2C80 to U+2CFF
        if (ch >= '\u2C80' && ch <= '\u2CFF')
            return "Nobiin";
    }

    // Default to English/Latin
    return "English";
}
```

---

## Fix 4: Update TransliterateNameAsync Cache Check

The existing `TransliterateNameAsync` method also needs to enforce the complete cache rule.

Find in `TransliterateNameAsync` (around line 50-77):

```csharp
if (existingMappings.Any())
{
    var cached = existingMappings.First();

    // Only use cache if mapping is COMPLETE (has Arabic, English, AND Nobiin)
    bool isComplete = !string.IsNullOrWhiteSpace(cached.Arabic) &&
                      !string.IsNullOrWhiteSpace(cached.English) &&
                      !string.IsNullOrWhiteSpace(cached.Nobiin);

    if (isComplete)
    {
        _logger.LogInformation(
            "Found complete cached mapping for '{Input}' (ID: {Id})",
            request.InputName, cached.Id);

        return BuildResultFromMapping(cached, request.DisplayLanguage, fromCache: true);
    }
    else
    {
        _logger.LogInformation(
            "Found INCOMPLETE cached mapping for '{Input}' (ID: {Id}) - will call AI to complete",
            request.InputName, cached.Id);
        // Fall through to AI call below
    }
}
```

**This looks correct already.** The issue is that after AI returns, we need to UPDATE the incomplete cache record, not create a new one.

---

## Fix 5: Update SaveMappingAsync to Update Existing Incomplete Mappings

Find `SaveMappingAsync` and ensure it updates incomplete mappings:

```csharp
private async Task<NameMapping> SaveMappingAsync(FamilyTreeApi.DTOs.TransliterationResult result, FamilyTreeApi.DTOs.TransliterationRequest request)
{
    // Check if there's an existing incomplete mapping we should update
    var normalizedArabic = result.Arabic != null ? NormalizeName(result.Arabic) : null;
    var normalizedEnglish = result.English?.Best != null ? NormalizeName(result.English.Best) : null;
    var normalizedNobiin = result.Nobiin?.Value != null ? NormalizeName(result.Nobiin.Value) : null;

    NameMapping? existingMapping = null;

    // Look for existing mapping by any of the values
    if (normalizedArabic != null)
    {
        existingMapping = await _context.NameMappings
            .FirstOrDefaultAsync(m => m.ArabicNormalized == normalizedArabic);
    }

    if (existingMapping == null && normalizedEnglish != null)
    {
        existingMapping = await _context.NameMappings
            .FirstOrDefaultAsync(m => m.EnglishNormalized == normalizedEnglish);
    }

    if (existingMapping != null)
    {
        // Update existing mapping with new/complete translations
        _logger.LogInformation(
            "Updating existing mapping ID {Id} with complete translations",
            existingMapping.Id);

        // Only update if currently empty
        if (string.IsNullOrWhiteSpace(existingMapping.Arabic) && !string.IsNullOrWhiteSpace(result.Arabic))
        {
            existingMapping.Arabic = result.Arabic;
            existingMapping.ArabicNormalized = normalizedArabic;
        }

        if (string.IsNullOrWhiteSpace(existingMapping.English) && !string.IsNullOrWhiteSpace(result.English?.Best))
        {
            existingMapping.English = result.English.Best;
            existingMapping.EnglishNormalized = normalizedEnglish;
        }

        if (string.IsNullOrWhiteSpace(existingMapping.Nobiin) && !string.IsNullOrWhiteSpace(result.Nobiin?.Value))
        {
            existingMapping.Nobiin = result.Nobiin.Value;
            existingMapping.NobiinNormalized = normalizedNobiin;
        }

        if (string.IsNullOrWhiteSpace(existingMapping.Ipa) && !string.IsNullOrWhiteSpace(result.Nobiin?.Ipa))
        {
            existingMapping.Ipa = result.Nobiin.Ipa;
        }

        existingMapping.Source = result.English?.Source ?? existingMapping.Source;
        existingMapping.Confidence = result.English?.Confidence ?? existingMapping.Confidence;
        existingMapping.NeedsReview = result.Metadata?.NeedsReview ?? false;
        existingMapping.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return existingMapping;
    }

    // Create new mapping
    var mapping = new NameMapping
    {
        Arabic = result.Arabic,
        ArabicNormalized = normalizedArabic,
        English = result.English?.Best,
        EnglishNormalized = normalizedEnglish,
        Nobiin = result.Nobiin?.Value,
        NobiinNormalized = normalizedNobiin,
        Ipa = result.Nobiin?.Ipa,
        IsVerified = false,
        Source = result.English?.Source,
        Confidence = result.English?.Confidence,
        NeedsReview = result.Metadata?.NeedsReview ?? false,
        CreatedAt = DateTime.UtcNow,
        OrgId = request.OrgId
    };

    _context.NameMappings.Add(mapping);
    await _context.SaveChangesAsync();

    return mapping;
}
```

---

## Summary of Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CORRECT TRANSLATION FLOW                         │
└─────────────────────────────────────────────────────────────────────┘

Person Record:
├── NameArabic  = "محمد"
├── NameEnglish = NULL    ← Needs filling
└── NameNobiin  = NULL    ← Needs filling

Step 1: Detect Source
        → Source = "محمد" from column "Arabic"

Step 2: Lookup Cache
        → SELECT * FROM NameMappings WHERE ArabicNormalized = 'محمد'

Step 3: Check Cache Completeness
        ┌─ Cache found: { Arabic: "محمد", English: "Mohamed", Nobiin: "ⲙⲟϩⲁⲙⲉⲇ" }
        │  All 3 NOT NULL? → YES → Use cache
        │
        └─ Cache found: { Arabic: "محمد", English: NULL, Nobiin: NULL }
           All 3 NOT NULL? → NO → Call AI

Step 4: Fill NULL Columns
        → person.NameEnglish = "Mohamed"
        → person.NameNobiin = "ⲙⲟϩⲁⲙⲉⲇ"

Step 5: Save
        → await _context.SaveChangesAsync()
```

---

## Testing

### 1. Clear Incomplete Cache Entries (Optional)

```sql
-- View incomplete mappings
SELECT "Id", "Arabic", "English", "Nobiin" 
FROM "NameMappings" 
WHERE "Arabic" IS NULL OR "English" IS NULL OR "Nobiin" IS NULL
LIMIT 20;

-- Delete incomplete mappings to force fresh AI calls
DELETE FROM "NameMappings" 
WHERE "English" IS NULL OR "Nobiin" IS NULL;
```

### 2. Run Bulk Translation

```http
POST /api/transliteration/bulk-generate
Content-Type: application/json

{
  "orgId": "6f7e2152-c6a2-47ca-b96e-9814df717a03",
  "maxPersons": 500,
  "skipComplete": true
}
```

### 3. Check Logs

```
[INFORM] Translating for person xxx: source='محمد' from column Arabic, needs: Arabic=False, English=True, Nobiin=True
[INFORM] Found COMPLETE cache for 'محمد' (ID: 1): Arabic='محمد', English='Mohamed', Nobiin='ⲙⲟϩⲁⲙⲉⲇ'
[INFORM] Generated 2 names for person xxx
```

Or if cache incomplete:

```
[INFORM] Translating for person xxx: source='محمد' from column Arabic, needs: Arabic=False, English=True, Nobiin=True
[INFORM] Found INCOMPLETE cache for 'محمد' (ID: 1) - calling AI
[INFORM] Transliterated 'محمد' -> EN: 'Mohamed' (confidence: 0.95, ID: 1)
[INFORM] Updating existing mapping ID 1 with complete translations
[INFORM] Generated 2 names for person xxx
```

### 4. Verify Database

```sql
SELECT "PrimaryName", "NameArabic", "NameEnglish", "NameNobiin", "UpdatedAt"
FROM "People"
WHERE "OrgId" = '6f7e2152-c6a2-47ca-b96e-9814df717a03'
  AND "NameEnglish" IS NOT NULL
  AND "NameNobiin" IS NOT NULL
LIMIT 20;
```

---

## Key Changes Summary

| Fix | Description |
|-----|-------------|
| Fix 1 | Rewrite `GenerateMissingNamesForPersonAsync` with correct logic |
| Fix 2 | Add `LookupCacheBySourceColumn` helper for column-specific lookup |
| Fix 3 | Add `DetectScriptFromContent` helper |
| Fix 4 | Enforce complete cache rule in `TransliterateNameAsync` |
| Fix 5 | Update `SaveMappingAsync` to update incomplete existing mappings |

**Apply all 5 fixes for complete solution.**
