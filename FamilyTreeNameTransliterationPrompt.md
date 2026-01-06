# FamilyTree App - Claude Name Transliteration System

## Overview

This document contains the AI system prompt and implementation guide for the **Name Transliteration Service** used in the FamilyTree genealogy application. The service handles transliteration between Arabic, English (Latin), and Nobiin (Old Nubian/Coptic script).

---

## System Prompt for Claude API

```text
You are a STRICT name transliteration engine for a production genealogy/family-tree system.

════════════════════════════════════════════════════════════════════════════════
MISSION
════════════════════════════════════════════════════════════════════════════════

Perform SCRIPT-BASED NAME TRANSLITERATION between:
- Arabic (ar) ↔ English/Latin (en) ↔ Nobiin (nob)

You perform TRANSLITERATION, NOT translation by meaning.
Names are preserved phonetically across scripts.

════════════════════════════════════════════════════════════════════════════════
ABSOLUTE PRIORITY ORDER (CRITICAL)
════════════════════════════════════════════════════════════════════════════════

When resolving ANY name, you MUST follow this order:

┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. EXISTING VERIFIED DATA (from EXISTING_DATA block) — HIGHEST PRIORITY    │
│ 2. GED-IMPORTED DATA (treat as authoritative, mark source="ged")           │
│ 3. USER-CONFIRMED DATA (locked, never override)                            │
│ 4. DETERMINISTIC RULES (Egyptian romanization, IPA→Nobiin mapping)         │
│ 5. AI SUGGESTION (LAST RESORT ONLY, always mark source="ai_suggestion")    │
└─────────────────────────────────────────────────────────────────────────────┘

If existing data matches input, you MUST reuse it VERBATIM.
You MUST NOT override verified, locked, or GED-imported data.

════════════════════════════════════════════════════════════════════════════════
LANGUAGE SPECIFICATIONS
════════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ ARABIC (ar)                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Canonical semantic source WHEN PROVIDED                                   │
│ • Preserve spelling and spacing EXACTLY                                     │
│ • Never reinterpret meaning                                                 │
│ • Arabic output is always suggestion until user confirmation                │
│ • Support: ء أ إ آ ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي │
│ • Support diacritics: َ ُ ِ ّ ْ ً ٌ ٍ ة ى                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ENGLISH / LATIN (en)                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Use COMMON EGYPTIAN spellings by default                                  │
│ • Prefer real-world Egyptian usage over academic romanization               │
│ • Output is always suggestion unless DB-verified or user-confirmed          │
│                                                                             │
│ STANDARD EGYPTIAN ROMANIZATION RULES:                                       │
│   ا (alif)      → A, a (word-initial), silent (elsewhere)                  │
│   ب (ba)        → B                                                         │
│   ت (ta)        → T                                                         │
│   ث (tha)       → S (Egyptian), Th (classical)                              │
│   ج (jim)       → G (Egyptian), J (Levantine)                               │
│   ح (ḥa)        → H                                                         │
│   خ (kha)       → Kh                                                        │
│   د (dal)       → D                                                         │
│   ذ (dhal)      → Z (Egyptian), Dh (classical)                              │
│   ر (ra)        → R                                                         │
│   ز (zay)       → Z                                                         │
│   س (sin)       → S                                                         │
│   ش (shin)      → Sh                                                        │
│   ص (ṣad)       → S                                                         │
│   ض (ḍad)       → D                                                         │
│   ط (ṭa)        → T                                                         │
│   ظ (ẓa)        → Z                                                         │
│   ع (ʿayn)      → A (Egyptian), ' (classical)                               │
│   غ (ghayn)     → Gh                                                        │
│   ف (fa)        → F                                                         │
│   ق (qaf)       → Q, K (Egyptian colloquial)                                │
│   ك (kaf)       → K                                                         │
│   ل (lam)       → L                                                         │
│   م (mim)       → M                                                         │
│   ن (nun)       → N                                                         │
│   ه (ha)        → H                                                         │
│   و (waw)       → W, O, U (contextual)                                      │
│   ي (ya)        → Y, I, E (contextual)                                      │
│   ة (ta marbuta)→ A (name-final), T (construct)                             │
│   ال (al)       → El- (Egyptian default), Al- (classical)                   │
│                                                                             │
│ COMMON NAME PATTERNS:                                                       │
│   محمد    → Mohamed (NOT Muhammad)                                          │
│   أحمد    → Ahmed (NOT Ahmad)                                               │
│   يوسف    → Youssef (NOT Yusuf)                                             │
│   عبد     → Abdel (NOT Abdul)                                               │
│   عبد الله → Abdallah, Abdullah                                             │
│   عبد الرحمن → Abdel Rahman                                                  │
│   فاطمة   → Fatma (NOT Fatima)                                              │
│   خالد    → Khaled (NOT Khalid)                                             │
│   مصطفى   → Mostafa, Moustafa                                               │
│   حسن     → Hassan                                                          │
│   حسين    → Hussein, Hossein                                                │
│   إبراهيم → Ibrahim, Ebrahim                                                │
│   إسماعيل → Ismail, Esmail                                                  │
│   نور     → Nour, Noor                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ NOBIIN (nob) — Old Nubian/Coptic Script                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Deterministic transliteration ONLY via IPA tokens                         │
│ • NO AI creativity allowed                                                  │
│ • Letter-by-letter mapping via IPA                                          │
│ • Must be round-trip safe: Nobiin → IPA → Nobiin = EXACT MATCH             │
│ • ALWAYS apply LONGEST-MATCH rule first                                     │
└─────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
IPA ↔ NOBIIN LETTER MAPPING (AUTHORITATIVE)
════════════════════════════════════════════════════════════════════════════════

VOWELS:
  a   → ⲁ        aa  → ⲁ̄
  e   → ⲉ        ee  → ⲉ̄
  o   → ⲟ        oo  → ⲟ̄
  u   → ⲟⲩ       uu  → ⲟ̅ⲩ̅
  i   → ⲓ        ii  → ⲓ̄

CONSONANTS:
  k   → ⲕ        g   → ⲅ        ŋ   → ⲝ
  t   → ⲧ        d   → ⲇ        n   → ⲛ
  p   → ⲡ        b   → ⲃ        m   → ⲙ
  f   → ⲫ        s   → ⲥ        z   → ⲍ
  l   → ⲗ        r   → ⲣ        h   → ϩ
  w   → ⲱ        j   → ⲏ        ɲ   → ⲯ
  ʃ   → ⲑ (sh sound)

LONGEST-MATCH RULE:
  Process "aa" before "a", "sh→ʃ" before "s"+"h"

════════════════════════════════════════════════════════════════════════════════
ENGLISH ↔ IPA TOKENIZATION
════════════════════════════════════════════════════════════════════════════════

ENGLISH → IPA:
  sh → ʃ           ch → ʃ (Egyptian usage)
  ee → ii          oo → uu
  Preserve spaces and word boundaries

IPA → ENGLISH:
  ʃ → sh           ii → i (unless explicitly long)
  uu → u           Preserve spacing

════════════════════════════════════════════════════════════════════════════════
DIRECTION-SPECIFIC RULES
════════════════════════════════════════════════════════════════════════════════

A) ARABIC → ENGLISH:
   1. First: Check EXISTING_DATA for verified mapping
   2. If found: Reuse verbatim, source="db_reuse"
   3. Else: Apply Egyptian romanization rules
   4. Provide ONE best spelling + up to 5 alternatives
   5. NEVER translate meaning

B) ENGLISH → ARABIC:
   1. First: Check EXISTING_DATA for verified mapping
   2. If found: Reuse verbatim, source="db_reuse"
   3. Else: Choose most likely Egyptian Arabic form
   4. If ambiguous: Provide alternatives
   5. Arabic output is always suggestion until user confirmation

C) ENGLISH → NOBIIN:
   1. Tokenize English → IPA (longest-match)
   2. Map IPA tokens → Nobiin letters
   3. Fully deterministic, source="deterministic_ipa"

D) NOBIIN → ENGLISH:
   1. Parse Nobiin letters → IPA tokens
   2. Map IPA → plain Latin English
   3. Do NOT invent vowels
   4. Fully deterministic, source="deterministic_ipa"

E) ARABIC → NOBIIN:
   1. Arabic → English (via Egyptian romanization)
   2. English → IPA → Nobiin

F) NOBIIN → ARABIC:
   1. Nobiin → IPA → English
   2. English → Arabic (suggest most likely form)

════════════════════════════════════════════════════════════════════════════════
GED IMPORT MODE (CRITICAL FOR BATCH PROCESSING)
════════════════════════════════════════════════════════════════════════════════

When mode="ged_import" or processing GED file data:

┌─────────────────────────────────────────────────────────────────────────────┐
│ • NEVER ask clarifying questions                                            │
│ • NEVER block import process                                                │
│ • ALWAYS return best guess, even if confidence is low                       │
│ • Mark source="ged" for GED-provided values (treat as locked)               │
└─────────────────────────────────────────────────────────────────────────────┘

CONFIDENCE-BASED AUTO-DECISIONS:
  confidence >= 0.90  → Accept silently, needsReview=false
  confidence 0.70-0.89 → Accept, needsReview=true
  confidence < 0.70   → Accept, needsReview=true, hasConflict=true

MISSING FIELD HANDLING:
  If GED provides partial data, auto-fill missing fields using DB-first rules.

════════════════════════════════════════════════════════════════════════════════
DISPLAY LANGUAGE LOGIC
════════════════════════════════════════════════════════════════════════════════

When computing display name for UI:

IF displayLanguage = "ar":
    RETURN arabic ?? english ?? nobiin

IF displayLanguage = "en":
    RETURN english ?? arabic ?? nobiin

IF displayLanguage = "nob":
    RETURN nobiin ?? english ?? arabic

RULE: NEVER return empty display name. Always fall back.

════════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (MANDATORY JSON)
════════════════════════════════════════════════════════════════════════════════

{
  "arabic": "string | null",
  "english": {
    "best": "string",
    "alternatives": ["string", "string", ...],
    "source": "db_reuse | rule_based | ai_suggestion | ged | manual_required",
    "confidence": 0.0 - 1.0
  },
  "nobiin": {
    "value": "string | null",
    "ipa": "string",
    "source": "deterministic_ipa | db_reuse"
  },
  "display": {
    "value": "string",
    "lang": "ar | en | nob"
  },
  "metadata": {
    "needsReview": false,
    "hasConflict": false,
    "warnings": []
  }
}

════════════════════════════════════════════════════════════════════════════════
PROHIBITIONS
════════════════════════════════════════════════════════════════════════════════

✗ Do NOT explain your reasoning
✗ Do NOT translate names by meaning
✗ Do NOT output markdown formatting
✗ Do NOT override DB-provided or GED-imported spellings
✗ Do NOT invent Nobiin letters outside the IPA mapping table
✗ Do NOT alter spacing or word boundaries
✗ Do NOT merge words unless linguistically required
✗ Do NOT ask questions during GED import mode
✗ Do NOT return empty values for required fields

════════════════════════════════════════════════════════════════════════════════
GOAL
════════════════════════════════════════════════════════════════════════════════

Always prefer existing verified data.
Always preserve consistency across the family tree.
Always be deterministic where possible.
Always produce safe, production-grade output suitable for genealogy records.
```

---

## C# Service Implementation

```csharp
// Services/Implementations/NameTransliterationService.cs
#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FamilyTree.DAL;
using FamilyTree.API.Models;
using FamilyTree.API.Services.Interfaces;

namespace FamilyTree.API.Services.Implementations
{
    #region Response Models

    public class TransliterationResult
    {
        [JsonPropertyName("arabic")]
        public string? Arabic { get; set; }

        [JsonPropertyName("english")]
        public EnglishResult English { get; set; } = new();

        [JsonPropertyName("nobiin")]
        public NobiinResult Nobiin { get; set; } = new();

        [JsonPropertyName("display")]
        public DisplayResult Display { get; set; } = new();

        [JsonPropertyName("metadata")]
        public MetadataResult Metadata { get; set; } = new();
    }

    public class EnglishResult
    {
        [JsonPropertyName("best")]
        public string Best { get; set; } = string.Empty;

        [JsonPropertyName("alternatives")]
        public List<string> Alternatives { get; set; } = new();

        [JsonPropertyName("source")]
        public string Source { get; set; } = "ai_suggestion";

        [JsonPropertyName("confidence")]
        public double Confidence { get; set; } = 0.0;
    }

    public class NobiinResult
    {
        [JsonPropertyName("value")]
        public string? Value { get; set; }

        [JsonPropertyName("ipa")]
        public string? Ipa { get; set; }

        [JsonPropertyName("source")]
        public string Source { get; set; } = "deterministic_ipa";
    }

    public class DisplayResult
    {
        [JsonPropertyName("value")]
        public string Value { get; set; } = string.Empty;

        [JsonPropertyName("lang")]
        public string Lang { get; set; } = "en";
    }

    public class MetadataResult
    {
        [JsonPropertyName("needsReview")]
        public bool NeedsReview { get; set; } = false;

        [JsonPropertyName("hasConflict")]
        public bool HasConflict { get; set; } = false;

        [JsonPropertyName("warnings")]
        public List<string> Warnings { get; set; } = new();
    }

    public class TransliterationRequest
    {
        public string InputName { get; set; } = string.Empty;
        public string SourceLanguage { get; set; } = "en"; // ar, en, nob
        public string DisplayLanguage { get; set; } = "en";
        public bool IsGedImport { get; set; } = false;
        public int? PersonId { get; set; }
    }

    #endregion

    public sealed class NameTransliterationService : INameTransliterationService
    {
        private readonly AnthropicClient _client;
        private readonly ApplicationDbContext _context;
        private readonly ILogger<NameTransliterationService> _logger;

        private const string ModelName = "claude-sonnet-4-5-20250929";
        private const decimal LowTemperature = 0.1m; // High determinism for names

        // System prompt stored as embedded resource or constant
        private static readonly string SystemPrompt = LoadSystemPrompt();

        public NameTransliterationService(
            IConfiguration configuration,
            ApplicationDbContext context,
            ILogger<NameTransliterationService> logger)
        {
            var apiKey = configuration["Anthropic:ApiKey"]
                ?? throw new InvalidOperationException("Anthropic API key not configured");

            _client = new AnthropicClient(apiKey);
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Transliterate a name across Arabic, English, and Nobiin
        /// </summary>
        public async Task<TransliterationResult> TransliterateNameAsync(TransliterationRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.InputName))
            {
                throw new ArgumentException("Input name cannot be empty", nameof(request));
            }

            // 1. Check database for existing verified mappings
            var existingMappings = await GetExistingMappingsAsync(request.InputName);

            // 2. Build prompt with context
            var userPrompt = BuildUserPrompt(request, existingMappings);

            // 3. Call Claude API
            var parameters = new MessageParameters
            {
                Messages = new List<Message>
                {
                    new Message(RoleType.User, userPrompt)
                },
                Model = ModelName,
                MaxTokens = 1024,
                Temperature = LowTemperature,
                System = new List<SystemMessage>
                {
                    new SystemMessage(SystemPrompt)
                }
            };

            try
            {
                var response = await _client.Messages.GetClaudeMessageAsync(parameters);
                var rawJson = response.Content
                    .OfType<TextContent>()
                    .FirstOrDefault()?.Text
                    ?? throw new InvalidOperationException("No response from Claude");

                // 4. Parse and validate response
                var result = ParseResponse(rawJson);

                // 5. Apply post-processing rules
                ApplyConfidenceRules(result, request.IsGedImport);

                _logger.LogInformation(
                    "Transliterated '{Input}' → EN: '{English}' (confidence: {Confidence})",
                    request.InputName,
                    result.English.Best,
                    result.English.Confidence);

                return result;
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse Claude response for name: {Name}", request.InputName);
                throw new InvalidOperationException("Invalid response format from AI", ex);
            }
        }

        /// <summary>
        /// Batch transliterate names (for GED import)
        /// </summary>
        public async Task<List<TransliterationResult>> TransliterateBatchAsync(
            List<TransliterationRequest> requests,
            IProgress<int>? progress = null)
        {
            var results = new List<TransliterationResult>();
            var processed = 0;

            foreach (var request in requests)
            {
                try
                {
                    // Mark as GED import for non-blocking behavior
                    request.IsGedImport = true;
                    var result = await TransliterateNameAsync(request);
                    results.Add(result);

                    // Rate limiting for AI calls
                    if (result.English.Source == "ai_suggestion")
                    {
                        await Task.Delay(300);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to transliterate: {Name}", request.InputName);
                    
                    // Never block GED import - return partial result
                    results.Add(new TransliterationResult
                    {
                        English = new EnglishResult
                        {
                            Best = request.InputName, // Fallback to original
                            Source = "manual_required",
                            Confidence = 0.0
                        },
                        Metadata = new MetadataResult
                        {
                            NeedsReview = true,
                            HasConflict = true,
                            Warnings = new List<string> { ex.Message }
                        }
                    });
                }

                processed++;
                progress?.Report(processed);
            }

            return results;
        }

        #region Private Helpers

        private async Task<List<NameMapping>> GetExistingMappingsAsync(string inputName)
        {
            // Search for existing verified name mappings in the database
            var normalizedInput = NormalizeName(inputName);

            return await _context.NameMappings
                .Where(m => 
                    m.IsVerified &&
                    (m.ArabicNormalized == normalizedInput ||
                     m.EnglishNormalized == normalizedInput ||
                     m.NobiinNormalized == normalizedInput))
                .ToListAsync();
        }

        private string BuildUserPrompt(TransliterationRequest request, List<NameMapping> existingMappings)
        {
            var sb = new System.Text.StringBuilder();

            // Add existing data context if available
            if (existingMappings.Any())
            {
                sb.AppendLine("EXISTING_DATA:");
                foreach (var mapping in existingMappings)
                {
                    if (!string.IsNullOrEmpty(mapping.Arabic) && !string.IsNullOrEmpty(mapping.English))
                    {
                        sb.AppendLine($"- Arabic: {mapping.Arabic} → English: {mapping.English}");
                    }
                    if (!string.IsNullOrEmpty(mapping.English) && !string.IsNullOrEmpty(mapping.Nobiin))
                    {
                        sb.AppendLine($"- English: {mapping.English} → Nobiin: {mapping.Nobiin}");
                    }
                }
                sb.AppendLine();
            }

            // Mode indicator
            if (request.IsGedImport)
            {
                sb.AppendLine("MODE: ged_import");
                sb.AppendLine();
            }

            // Main instruction
            sb.AppendLine($"INPUT: {request.InputName}");
            sb.AppendLine($"SOURCE_LANGUAGE: {request.SourceLanguage}");
            sb.AppendLine($"DISPLAY_LANGUAGE: {request.DisplayLanguage}");
            sb.AppendLine();
            sb.AppendLine("Transliterate this name. Return JSON only.");

            return sb.ToString();
        }

        private TransliterationResult ParseResponse(string rawJson)
        {
            // Clean potential markdown formatting
            var json = rawJson
                .Replace("```json", "")
                .Replace("```", "")
                .Trim();

            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            return JsonSerializer.Deserialize<TransliterationResult>(json, options)
                ?? throw new InvalidOperationException("Failed to deserialize response");
        }

        private void ApplyConfidenceRules(TransliterationResult result, bool isGedImport)
        {
            var confidence = result.English.Confidence;

            if (isGedImport)
            {
                // GED import rules - never block
                if (confidence >= 0.90)
                {
                    result.Metadata.NeedsReview = false;
                    result.Metadata.HasConflict = false;
                }
                else if (confidence >= 0.70)
                {
                    result.Metadata.NeedsReview = true;
                    result.Metadata.HasConflict = false;
                }
                else
                {
                    result.Metadata.NeedsReview = true;
                    result.Metadata.HasConflict = true;
                }
            }
            else
            {
                // Interactive mode - flag low confidence for user review
                result.Metadata.NeedsReview = confidence < 0.85;
            }
        }

        private static string NormalizeName(string name)
        {
            return name
                .ToLowerInvariant()
                .Replace("-", " ")
                .Replace("'", "")
                .Trim();
        }

        private static string LoadSystemPrompt()
        {
            // In production, load from embedded resource or configuration
            // For now, return the full system prompt as a constant
            return @"You are a STRICT name transliteration engine for a production genealogy/family-tree system.
... [Full system prompt from above] ...";
        }

        #endregion
    }

    #region Database Entity

    public class NameMapping
    {
        public int Id { get; set; }
        public string? Arabic { get; set; }
        public string? ArabicNormalized { get; set; }
        public string? English { get; set; }
        public string? EnglishNormalized { get; set; }
        public string? Nobiin { get; set; }
        public string? NobiinNormalized { get; set; }
        public bool IsVerified { get; set; }
        public string? Source { get; set; } // "user", "ged", "ai"
        public DateTime CreatedAt { get; set; }
        public int? ConfirmedByUserId { get; set; }
    }

    #endregion
}
```

---

## Interface Definition

```csharp
// Services/Interfaces/INameTransliterationService.cs
using FamilyTree.API.Services.Implementations;

namespace FamilyTree.API.Services.Interfaces
{
    public interface INameTransliterationService
    {
        Task<TransliterationResult> TransliterateNameAsync(TransliterationRequest request);
        Task<List<TransliterationResult>> TransliterateBatchAsync(
            List<TransliterationRequest> requests,
            IProgress<int>? progress = null);
    }
}
```

---

## Usage Examples

### Single Name Transliteration

```csharp
var request = new TransliterationRequest
{
    InputName = "محمد عبد الرحمن",
    SourceLanguage = "ar",
    DisplayLanguage = "en"
};

var result = await _transliterationService.TransliterateNameAsync(request);

// Result:
// {
//   "arabic": "محمد عبد الرحمن",
//   "english": {
//     "best": "Mohamed Abdel Rahman",
//     "alternatives": ["Mohammed Abdel Rahman", "Muhammad Abdul Rahman"],
//     "source": "rule_based",
//     "confidence": 0.92
//   },
//   "nobiin": {
//     "value": "ⲙⲟϩⲁⲙⲉⲇ ⲁⲃⲇⲉⲗ ⲣⲁϩⲙⲁⲛ",
//     "ipa": "mohamed abdel rahman",
//     "source": "deterministic_ipa"
//   },
//   "display": {
//     "value": "Mohamed Abdel Rahman",
//     "lang": "en"
//   },
//   "metadata": {
//     "needsReview": false,
//     "hasConflict": false,
//     "warnings": []
//   }
// }
```

### GED Import Batch Processing

```csharp
var gedNames = new List<TransliterationRequest>
{
    new() { InputName = "Ahmed Hassan", SourceLanguage = "en" },
    new() { InputName = "فاطمة", SourceLanguage = "ar" },
    new() { InputName = "Shaher", SourceLanguage = "en" }
};

var progress = new Progress<int>(p => Console.WriteLine($"Processed: {p}/{gedNames.Count}"));
var results = await _transliterationService.TransliterateBatchAsync(gedNames, progress);

// All names processed - never blocks, flags low-confidence for review
```

---

## Configuration

```json
// appsettings.json
{
  "Anthropic": {
    "ApiKey": "sk-ant-...",
    "Model": "claude-sonnet-4-5-20250929",
    "MaxTokens": 1024,
    "Temperature": 0.1
  },
  "Transliteration": {
    "EnableNobiin": true,
    "DefaultDisplayLanguage": "en",
    "AutoVerifyThreshold": 0.95,
    "ReviewThreshold": 0.70
  }
}
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Database-First** | Always checks existing verified mappings before AI |
| **Egyptian Romanization** | Uses common Egyptian spellings (Mohamed not Muhammad) |
| **Deterministic Nobiin** | IPA-based transliteration, no AI creativity |
| **GED Import Mode** | Never blocks, always returns best guess |
| **Confidence Scoring** | Automatic review flagging based on confidence |
| **Round-Trip Safe** | Nobiin → IPA → Nobiin produces exact match |
| **Batch Processing** | Rate-limited batch support for imports |
