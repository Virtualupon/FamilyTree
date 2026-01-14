# Fix: Name Translation Issues - Cache Returns Incomplete Data + GEDCOM Import Not Translating

## Problem 1: Cache Returns Incomplete Mappings

The `NameTransliterationService` is returning cached mappings that have **incomplete data** (Arabic only, missing English and Nobiin). This causes the bulk generation to report "Generated 2 names" but actually save nothing because the English/Nobiin fields are empty.

## Problem 2: GEDCOM Import Does Not Trigger Translation

The `GedcomService` does NOT call the transliteration service at all. It only sets:
- `PrimaryName = fullName`
- `NameEnglish = fullName`

But does NOT generate `NameArabic` or `NameNobiin`.

### Evidence from Logs
```
2026-01-12 19:27:06.793 [INFORM] Found cached mapping for 'محمد' (ID: 1)
2026-01-12 19:27:06.793 [INFORM] Generated 2 names for person "..."
```

But the database shows:
- `NameArabic`: "محمد" ✅
- `NameEnglish`: NULL ❌
- `NameNobiin`: NULL ❌

### Root Cause

In `GetExistingMappingsAsync()`, the code finds cached mappings and returns them even if they're incomplete. Then `BuildResultFromMapping()` returns empty English/Nobiin values, which fail the null checks in `GenerateMissingNamesForPersonAsync()`.

## File to Modify

`Services/NameTransliterationService.cs`

## Fix 1: Update GetExistingMappingsAsync to Only Return Complete Mappings

Find the method `GetExistingMappingsAsync` (around line 280-290):

```csharp
private async Task<List<NameMapping>> GetExistingMappingsAsync(string inputName)
{
    var normalizedInput = NormalizeName(inputName);

    return await _context.NameMappings
        .Where(m =>
            m.ArabicNormalized == normalizedInput ||
            m.EnglishNormalized == normalizedInput ||
            m.NobiinNormalized == normalizedInput)
        .OrderByDescending(m => m.IsVerified)
        .ThenByDescending(m => m.Confidence ?? 0)
        .ToListAsync();
}
```

**Replace with:**

```csharp
private async Task<List<NameMapping>> GetExistingMappingsAsync(string inputName)
{
    var normalizedInput = NormalizeName(inputName);

    return await _context.NameMappings
        .Where(m =>
            (m.ArabicNormalized == normalizedInput ||
             m.EnglishNormalized == normalizedInput ||
             m.NobiinNormalized == normalizedInput) &&
            // Only return COMPLETE mappings (has all three scripts)
            !string.IsNullOrEmpty(m.Arabic) &&
            !string.IsNullOrEmpty(m.English) &&
            !string.IsNullOrEmpty(m.Nobiin))
        .OrderByDescending(m => m.IsVerified)
        .ThenByDescending(m => m.Confidence ?? 0)
        .ToListAsync();
}
```

## Fix 2: Alternative - Check Completeness Before Using Cache

If you want to keep incomplete mappings for reference but not use them, modify `TransliterateNameAsync` instead.

Find in `TransliterateNameAsync` (around line 50-60):

```csharp
// 1. Check database for existing verified mappings
var existingMappings = await GetExistingMappingsAsync(request.InputName);

if (existingMappings.Any())
{
    var cached = existingMappings.First();
    _logger.LogInformation(
        "Found cached mapping for '{Input}' (ID: {Id})",
        request.InputName, cached.Id);

    return BuildResultFromMapping(cached, request.DisplayLanguage, fromCache: true);
}
```

**Replace with:**

```csharp
// 1. Check database for existing verified mappings
var existingMappings = await GetExistingMappingsAsync(request.InputName);

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

## Fix 3: Update Incomplete Mappings Instead of Creating New Ones

To avoid duplicate mappings, update `SaveMappingAsync` to update existing incomplete mappings:

Find `SaveMappingAsync` (around line 330-350):

```csharp
private async Task<NameMapping> SaveMappingAsync(FamilyTreeApi.DTOs.TransliterationResult result, FamilyTreeApi.DTOs.TransliterationRequest request)
{
    var mapping = new NameMapping
    {
        Arabic = result.Arabic,
        // ... rest of properties
    };

    _context.NameMappings.Add(mapping);
    await _context.SaveChangesAsync();

    return mapping;
}
```

**Replace with:**

```csharp
private async Task<NameMapping> SaveMappingAsync(FamilyTreeApi.DTOs.TransliterationResult result, FamilyTreeApi.DTOs.TransliterationRequest request)
{
    // Check if there's an existing incomplete mapping we should update
    var normalizedArabic = result.Arabic != null ? NormalizeName(result.Arabic) : null;
    var normalizedEnglish = NormalizeName(result.English.Best);
    
    NameMapping? existingMapping = null;
    
    if (normalizedArabic != null)
    {
        existingMapping = await _context.NameMappings
            .FirstOrDefaultAsync(m => m.ArabicNormalized == normalizedArabic);
    }
    
    if (existingMapping != null)
    {
        // Update existing mapping with new translations
        _logger.LogInformation(
            "Updating existing mapping ID {Id} with new translations",
            existingMapping.Id);
        
        if (string.IsNullOrEmpty(existingMapping.English) && !string.IsNullOrEmpty(result.English.Best))
        {
            existingMapping.English = result.English.Best;
            existingMapping.EnglishNormalized = normalizedEnglish;
        }
        if (string.IsNullOrEmpty(existingMapping.Nobiin) && !string.IsNullOrEmpty(result.Nobiin.Value))
        {
            existingMapping.Nobiin = result.Nobiin.Value;
            existingMapping.NobiinNormalized = NormalizeName(result.Nobiin.Value);
        }
        if (string.IsNullOrEmpty(existingMapping.Ipa) && !string.IsNullOrEmpty(result.Nobiin.Ipa))
        {
            existingMapping.Ipa = result.Nobiin.Ipa;
        }
        
        existingMapping.Source = result.English.Source;
        existingMapping.Confidence = result.English.Confidence;
        existingMapping.NeedsReview = result.Metadata.NeedsReview;
        existingMapping.UpdatedAt = DateTime.UtcNow;
        
        await _context.SaveChangesAsync();
        return existingMapping;
    }
    
    // Create new mapping
    var mapping = new NameMapping
    {
        Arabic = result.Arabic,
        ArabicNormalized = result.Arabic != null ? NormalizeName(result.Arabic) : null,
        English = result.English.Best,
        EnglishNormalized = NormalizeName(result.English.Best),
        Nobiin = result.Nobiin.Value,
        NobiinNormalized = result.Nobiin.Value != null ? NormalizeName(result.Nobiin.Value) : null,
        Ipa = result.Nobiin.Ipa,
        IsVerified = false,
        Source = result.English.Source,
        Confidence = result.English.Confidence,
        NeedsReview = result.Metadata.NeedsReview,
        CreatedAt = DateTime.UtcNow,
        OrgId = request.OrgId
    };

    _context.NameMappings.Add(mapping);
    await _context.SaveChangesAsync();

    return mapping;
}
```

## Fix 4: Add UpdatedAt Column to NameMapping Model (if missing)

Make sure the `NameMapping` model has an `UpdatedAt` property:

```csharp
public class NameMapping
{
    // ... existing properties ...
    
    public DateTime? UpdatedAt { get; set; }
}
```

## Testing

After applying the fix:

1. **Clear incomplete cache entries** (optional, for clean start):
```sql
-- View incomplete mappings
SELECT "Id", "Arabic", "English", "Nobiin" 
FROM "NameMappings" 
WHERE "English" IS NULL OR "English" = '' OR "Nobiin" IS NULL;

-- Or delete them to force re-generation
DELETE FROM "NameMappings" 
WHERE "English" IS NULL OR "English" = '' OR "Nobiin" IS NULL;
```

2. **Run bulk translation again**:
```
POST /api/transliteration/bulk-generate
{
  "orgId": "6f7e2152-c6a2-47ca-b96e-9814df717a03",
  "maxPersons": 500,
  "skipComplete": true
}
```

3. **Verify results**:
```sql
SELECT "PrimaryName", "NameArabic", "NameEnglish", "NameNobiin"
FROM "People"
WHERE "OrgId" = '6f7e2152-c6a2-47ca-b96e-9814df717a03'
LIMIT 20;
```

## Expected Log Output After Fix

```
[INFORM] Found INCOMPLETE cached mapping for 'محمد' (ID: 1) - will call AI to complete
[INFORM] Transliterated 'محمد' -> EN: 'Mohamed' (confidence: 0.95, ID: 1)
[INFORM] Updating existing mapping ID 1 with new translations
[INFORM] Generated 2 names for person "..."
```

## Summary

| Fix | Description |
|-----|-------------|
| Fix 1 | Only return complete mappings from cache query |
| Fix 2 | Check completeness before using cached result |
| Fix 3 | Update existing incomplete mappings instead of creating duplicates |
| Fix 4 | Ensure UpdatedAt column exists |

**Recommended: Apply Fix 2 + Fix 3** for the most robust solution.

---

# GEDCOM Import Fix - Add Name Translation

## Problem

The `GedcomService.cs` creates persons with only `PrimaryName` and `NameEnglish` set. It does NOT:
1. Inject the transliteration service
2. Call transliteration for imported names
3. Generate Arabic or Nobiin names

### Current Code (CreatePersonFromGedcom - line 471-498):
```csharp
private Person CreatePersonFromGedcom(GedcomIndividual indi, Guid orgId, GedcomImportOptions options)
{
    var fullName = indi.FullName ?? $"{indi.GivenName} {indi.Surname}".Trim();
    var person = new Person
    {
        // ...
        PrimaryName = fullName,
        NameEnglish = fullName  // Only sets English!
        // NameArabic = NOT SET
        // NameNobiin = NOT SET
    };
    return person;
}
```

## Fix 5: Update GedcomService to Call Transliteration After Import

### Step 1: Inject INameTransliterationService

In `GedcomService.cs`, update the constructor:

**Find:**
```csharp
public class GedcomService : IGedcomService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<GedcomService> _logger;

    public GedcomService(ApplicationDbContext context, ILogger<GedcomService> logger)
    {
        _context = context;
        _logger = logger;
    }
```

**Replace with:**
```csharp
public class GedcomService : IGedcomService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<GedcomService> _logger;
    private readonly INameTransliterationService _transliterationService;

    public GedcomService(
        ApplicationDbContext context, 
        ILogger<GedcomService> logger,
        INameTransliterationService transliterationService)
    {
        _context = context;
        _logger = logger;
        _transliterationService = transliterationService;
    }
```

### Step 2: Call Bulk Transliteration After Import

In `ImportAsync` method, after saving all persons and relationships, call bulk transliteration.

**Find (around line 207-219):**
```csharp
            await _context.SaveChangesAsync();

            stopwatch.Stop();
            return new GedcomImportResult(
                true,
                $"Successfully imported {individualsImported} individuals and {familiesImported} families",
                individualsImported,
                familiesImported,
                relationshipsCreated,
                warnings,
                errors,
                stopwatch.Elapsed);
```

**Replace with:**
```csharp
            await _context.SaveChangesAsync();

            // Generate translations for all imported persons
            _logger.LogInformation(
                "Starting name transliteration for {Count} imported persons in tree {TreeId}",
                individualsImported, tree.Id);

            try
            {
                var translitRequest = new BulkTransliterationRequest
                {
                    OrgId = tree.Id,
                    MaxPersons = individualsImported + 10, // Ensure we cover all
                    SkipComplete = true
                };
                
                var translitResult = await _transliterationService.BulkGenerateMissingNamesAsync(translitRequest);
                
                _logger.LogInformation(
                    "Transliteration complete: {Generated} names generated for {Processed} persons, {Errors} errors",
                    translitResult.TotalNamesGenerated,
                    translitResult.TotalPersonsProcessed,
                    translitResult.Errors);

                if (translitResult.Errors > 0)
                {
                    warnings.Add($"Some names could not be transliterated: {translitResult.Errors} errors");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to transliterate names after GEDCOM import");
                warnings.Add($"Name transliteration partially failed: {ex.Message}");
                // Don't fail the entire import for transliteration issues
            }

            stopwatch.Stop();
            return new GedcomImportResult(
                true,
                $"Successfully imported {individualsImported} individuals and {familiesImported} families",
                individualsImported,
                familiesImported,
                relationshipsCreated,
                warnings,
                errors,
                stopwatch.Elapsed);
```

### Step 3: Add Required Using Statement

At the top of `GedcomService.cs`, ensure this using is present:
```csharp
using FamilyTreeApi.DTOs;
```

## Alternative: Fix 6 - Transliterate During Person Creation (Slower but More Granular)

If you prefer to transliterate each person as they're created (slower due to API calls):

**Replace CreatePersonFromGedcom method:**
```csharp
private async Task<Person> CreatePersonFromGedcomAsync(
    GedcomIndividual indi, 
    Guid orgId, 
    GedcomImportOptions options)
{
    var fullName = indi.FullName ?? $"{indi.GivenName} {indi.Surname}".Trim();
    
    // Detect if name is Arabic or English
    var isArabic = System.Text.RegularExpressions.Regex.IsMatch(
        fullName, @"[\u0600-\u06FF]");
    
    var person = new Person
    {
        Id = Guid.NewGuid(),
        OrgId = orgId,
        PrimaryName = fullName,
        Sex = indi.Sex?.ToUpperInvariant() switch
        {
            "M" => Sex.Male,
            "F" => Sex.Female,
            _ => Sex.Unknown
        },
        BirthDate = indi.BirthDate?.ParsedDate,
        BirthPrecision = indi.BirthDate?.IsApproximate == true ? DatePrecision.About : DatePrecision.Exact,
        DeathDate = indi.DeathDate?.ParsedDate,
        DeathPrecision = indi.DeathDate?.IsApproximate == true ? DatePrecision.About : DatePrecision.Exact,
        Occupation = options.ImportOccupations ? indi.Occupation : null,
        Notes = options.ImportNotes ? indi.Notes : null,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    // Set initial name based on detected script
    if (isArabic)
    {
        person.NameArabic = fullName;
    }
    else
    {
        person.NameEnglish = fullName;
    }

    // Try to transliterate (don't fail import if this fails)
    try
    {
        var translitRequest = new TransliterationRequest
        {
            InputName = fullName,
            SourceLanguage = isArabic ? "ar" : "en",
            DisplayLanguage = "en",
            OrgId = orgId,
            IsGedImport = true
        };

        var result = await _transliterationService.TransliterateNameAsync(translitRequest);

        if (!string.IsNullOrWhiteSpace(result.Arabic) && string.IsNullOrEmpty(person.NameArabic))
        {
            person.NameArabic = result.Arabic;
        }
        if (!string.IsNullOrWhiteSpace(result.English?.Best) && string.IsNullOrEmpty(person.NameEnglish))
        {
            person.NameEnglish = result.English.Best;
        }
        if (!string.IsNullOrWhiteSpace(result.Nobiin?.Value))
        {
            person.NameNobiin = result.Nobiin.Value;
        }
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "Failed to transliterate name '{Name}' during GEDCOM import", fullName);
        // Continue without translation - can be done later via bulk
    }

    return person;
}
```

**Note:** If using Fix 6, you also need to:
1. Change `CreatePersonFromGedcom` to `CreatePersonFromGedcomAsync`
2. Update the call site in ImportAsync to use `await`
3. Add rate limiting (Task.Delay) between transliteration calls

**Recommended: Use Fix 5** (bulk transliteration after import) as it's faster and doesn't slow down the import process.

---

## Complete Testing Checklist

### Test Cache Fix (Fixes 2 & 3):
```bash
# 1. Check for incomplete mappings
SELECT COUNT(*) FROM "NameMappings" 
WHERE "English" IS NULL OR "English" = '' OR "Nobiin" IS NULL;

# 2. Optionally clear them
DELETE FROM "NameMappings" 
WHERE "English" IS NULL OR "English" = '' OR "Nobiin" IS NULL;

# 3. Run bulk generation
POST /api/transliteration/bulk-generate
{
  "orgId": "6f7e2152-c6a2-47ca-b96e-9814df717a03",
  "maxPersons": 500,
  "skipComplete": true
}

# 4. Verify results
SELECT "PrimaryName", "NameArabic", "NameEnglish", "NameNobiin"
FROM "People"
WHERE "OrgId" = '6f7e2152-c6a2-47ca-b96e-9814df717a03'
AND "NameEnglish" IS NOT NULL
LIMIT 20;
```

### Test GEDCOM Import Fix (Fix 5):
```bash
# 1. Import a new GEDCOM file

# 2. Check logs for transliteration messages:
grep "Starting name transliteration\|Transliteration complete" logs/app.log

# 3. Verify imported persons have all name fields:
SELECT "PrimaryName", "NameArabic", "NameEnglish", "NameNobiin"
FROM "People"
WHERE "OrgId" = '<new-tree-id>'
LIMIT 20;
```

## Summary of All Fixes

| Fix | File | Description |
|-----|------|-------------|
| Fix 2 | NameTransliterationService.cs | Check cache completeness before using |
| Fix 3 | NameTransliterationService.cs | Update incomplete mappings instead of creating duplicates |
| Fix 5 | GedcomService.cs | Call bulk transliteration after GEDCOM import |

**Apply: Fix 2 + Fix 3 + Fix 5** for complete solution.
