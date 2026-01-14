#nullable enable
using System.Text;
using System.Text.Json;
using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FamilyTreeApi.Services;

/// <summary>
/// Implementation of name transliteration service using Claude AI.
/// Handles transliteration between Arabic, English, and Nobiin scripts.
/// </summary>
public sealed class NameTransliterationService : INameTransliterationService
{
    private readonly AnthropicClient _client;
    private readonly ApplicationDbContext _context;
    private readonly ILogger<NameTransliterationService> _logger;

    private const string ModelName = "claude-sonnet-4-5-20250929";
    private const decimal LowTemperature = 0.1m;

    private static readonly string SystemPrompt = GetSystemPrompt();

    public NameTransliterationService(
        IConfiguration configuration,
        ApplicationDbContext context,
        ILogger<NameTransliterationService> logger)
    {
        var apiKey = configuration["Anthropic:ApiKey"]
            ?? throw new InvalidOperationException("Anthropic API key not configured. Add 'Anthropic:ApiKey' to configuration.");

        _client = new AnthropicClient(apiKey);
        _context = context;
        _logger = logger;
    }

    public async Task<FamilyTreeApi.DTOs.TransliterationResult> TransliterateNameAsync(FamilyTreeApi.DTOs.TransliterationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.InputName))
        {
            throw new ArgumentException("Input name cannot be empty", nameof(request));
        }

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

        // 2. Build prompt with context
        var userPrompt = BuildUserPrompt(request, existingMappings);

        // 3. Call Claude API
        var messages = new List<Message>
        {
            new Message
            {
                Role = RoleType.User,
                Content = userPrompt
            }
        };

        var parameters = new MessageParameters
        {
            Messages = messages,
            Model = ModelName,
            MaxTokens = 1024,
            Temperature = LowTemperature,
            SystemMessage = SystemPrompt
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

            // 6. Save mapping to database
            var mapping = await SaveMappingAsync(result, request);
            result.MappingId = mapping.Id;

            _logger.LogInformation(
                "Transliterated '{Input}' -> EN: '{English}' (confidence: {Confidence}, ID: {Id})",
                request.InputName,
                result.English.Best,
                result.English.Confidence,
                mapping.Id);

            return result;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse Claude response for name: {Name}", request.InputName);
            throw new InvalidOperationException("Invalid response format from AI", ex);
        }
    }

    public async Task<FamilyTreeApi.DTOs.BatchTransliterationResult> TransliterateBatchAsync(
        List<FamilyTreeApi.DTOs.TransliterationRequest> requests,
        IProgress<int>? progress = null)
    {
        var results = new List<FamilyTreeApi.DTOs.TransliterationResult>();
        var processed = 0;
        var needsReviewCount = 0;
        var conflictCount = 0;
        var cachedCount = 0;

        foreach (var request in requests)
        {
            try
            {
                request.IsGedImport = true;
                var result = await TransliterateNameAsync(request);
                results.Add(result);

                if (result.Metadata.NeedsReview) needsReviewCount++;
                if (result.Metadata.HasConflict) conflictCount++;
                if (result.Metadata.FromCache) cachedCount++;

                // Rate limiting for AI calls
                if (!result.Metadata.FromCache)
                {
                    await Task.Delay(300);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to transliterate: {Name}", request.InputName);

                // Never block GED import - return partial result
                var fallback = new FamilyTreeApi.DTOs.TransliterationResult
                {
                    English = new FamilyTreeApi.DTOs.EnglishResult
                    {
                        Best = request.InputName,
                        Source = "manual_required",
                        Confidence = 0.0
                    },
                    Display = new FamilyTreeApi.DTOs.DisplayResult
                    {
                        Value = request.InputName,
                        Lang = "en"
                    },
                    Metadata = new FamilyTreeApi.DTOs.MetadataResult
                    {
                        NeedsReview = true,
                        HasConflict = true,
                        Warnings = new List<string> { ex.Message }
                    }
                };
                results.Add(fallback);
                needsReviewCount++;
                conflictCount++;
            }

            processed++;
            progress?.Report(processed);
        }

        return new FamilyTreeApi.DTOs.BatchTransliterationResult
        {
            Results = results,
            TotalProcessed = processed,
            NeedsReviewCount = needsReviewCount,
            ConflictCount = conflictCount,
            CachedCount = cachedCount
        };
    }

    public async Task<FamilyTreeApi.DTOs.VerifyMappingResult> VerifyMappingAsync(FamilyTreeApi.DTOs.VerifyMappingRequest request, long userId)
    {
        var mapping = await _context.NameMappings.FindAsync(request.MappingId);

        if (mapping == null)
        {
            return new FamilyTreeApi.DTOs.VerifyMappingResult
            {
                MappingId = request.MappingId,
                Success = false,
                Message = "Mapping not found"
            };
        }

        // Apply corrections if provided
        if (request.Arabic != null)
        {
            mapping.Arabic = request.Arabic;
            mapping.ArabicNormalized = NormalizeName(request.Arabic);
        }
        if (request.English != null)
        {
            mapping.English = request.English;
            mapping.EnglishNormalized = NormalizeName(request.English);
        }
        if (request.Nobiin != null)
        {
            mapping.Nobiin = request.Nobiin;
            mapping.NobiinNormalized = NormalizeName(request.Nobiin);
        }

        mapping.IsVerified = true;
        mapping.NeedsReview = false;
        mapping.ConfirmedByUserId = userId;
        mapping.UpdatedAt = DateTime.UtcNow;
        mapping.Source = "user";

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Mapping {Id} verified by user {UserId}",
            mapping.Id, userId);

        return new FamilyTreeApi.DTOs.VerifyMappingResult
        {
            MappingId = mapping.Id,
            Success = true,
            Message = "Mapping verified successfully",
            Mapping = MapToDto(mapping)
        };
    }

    public async Task<List<FamilyTreeApi.DTOs.NameMappingDto>> GetMappingsNeedingReviewAsync(Guid? orgId = null)
    {
        var query = _context.NameMappings
            .Where(m => m.NeedsReview && !m.IsVerified);

        if (orgId.HasValue)
        {
            query = query.Where(m => m.OrgId == orgId || m.OrgId == null);
        }

        var mappings = await query
            .OrderByDescending(m => m.CreatedAt)
            .Take(100)
            .ToListAsync();

        return mappings.Select(MapToDto).ToList();
    }

    public async Task<List<FamilyTreeApi.DTOs.NameMappingDto>> SearchMappingsAsync(string searchTerm, int limit = 20)
    {
        var normalized = NormalizeName(searchTerm);

        var mappings = await _context.NameMappings
            .Where(m =>
                (m.ArabicNormalized != null && m.ArabicNormalized.Contains(normalized)) ||
                (m.EnglishNormalized != null && m.EnglishNormalized.Contains(normalized)) ||
                (m.NobiinNormalized != null && m.NobiinNormalized.Contains(normalized)))
            .OrderByDescending(m => m.IsVerified)
            .ThenByDescending(m => m.CreatedAt)
            .Take(limit)
            .ToListAsync();

        return mappings.Select(MapToDto).ToList();
    }

    public async Task<FamilyTreeApi.DTOs.NameMappingDto?> GetMappingByIdAsync(int id)
    {
        var mapping = await _context.NameMappings.FindAsync(id);
        return mapping == null ? null : MapToDto(mapping);
    }

    #region Private Helpers

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

    private FamilyTreeApi.DTOs.TransliterationResult BuildResultFromMapping(NameMapping mapping, string displayLanguage, bool fromCache)
    {
        var displayValue = displayLanguage switch
        {
            "ar" => mapping.Arabic ?? mapping.English ?? mapping.Nobiin ?? "",
            "nob" => mapping.Nobiin ?? mapping.English ?? mapping.Arabic ?? "",
            _ => mapping.English ?? mapping.Arabic ?? mapping.Nobiin ?? ""
        };

        return new FamilyTreeApi.DTOs.TransliterationResult
        {
            Arabic = mapping.Arabic,
            English = new FamilyTreeApi.DTOs.EnglishResult
            {
                Best = mapping.English ?? "",
                Alternatives = new List<string>(),
                Source = mapping.IsVerified ? "db_reuse" : (mapping.Source ?? "ai_suggestion"),
                Confidence = mapping.Confidence ?? (mapping.IsVerified ? 1.0 : 0.8)
            },
            Nobiin = new FamilyTreeApi.DTOs.NobiinResult
            {
                Value = mapping.Nobiin,
                Ipa = mapping.Ipa,
                Source = mapping.IsVerified ? "db_reuse" : "deterministic_ipa"
            },
            Display = new FamilyTreeApi.DTOs.DisplayResult
            {
                Value = displayValue,
                Lang = displayLanguage
            },
            Metadata = new FamilyTreeApi.DTOs.MetadataResult
            {
                NeedsReview = mapping.NeedsReview,
                HasConflict = false,
                FromCache = fromCache,
                Warnings = new List<string>()
            },
            MappingId = mapping.Id
        };
    }

    private string BuildUserPrompt(FamilyTreeApi.DTOs.TransliterationRequest request, List<NameMapping> existingMappings)
    {
        var sb = new StringBuilder();

        // Add existing data context if available
        if (existingMappings.Any())
        {
            sb.AppendLine("EXISTING_DATA:");
            foreach (var mapping in existingMappings)
            {
                if (!string.IsNullOrEmpty(mapping.Arabic) && !string.IsNullOrEmpty(mapping.English))
                {
                    sb.AppendLine($"- Arabic: {mapping.Arabic} -> English: {mapping.English}");
                }
                if (!string.IsNullOrEmpty(mapping.English) && !string.IsNullOrEmpty(mapping.Nobiin))
                {
                    sb.AppendLine($"- English: {mapping.English} -> Nobiin: {mapping.Nobiin}");
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

    private FamilyTreeApi.DTOs.TransliterationResult ParseResponse(string rawJson)
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

        return JsonSerializer.Deserialize<FamilyTreeApi.DTOs.TransliterationResult>(json, options)
            ?? throw new InvalidOperationException("Failed to deserialize response");
    }

    private void ApplyConfidenceRules(FamilyTreeApi.DTOs.TransliterationResult result, bool isGedImport)
    {
        var confidence = result.English.Confidence;

        if (isGedImport)
        {
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
            result.Metadata.NeedsReview = confidence < 0.85;
        }
    }

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

    private static string NormalizeName(string name)
    {
        return name
            .ToLowerInvariant()
            .Replace("-", " ")
            .Replace("'", "")
            .Replace("\"", "")
            .Trim();
    }

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

    /// <summary>
    /// Detects which language column should be used based on script content.
    /// Returns "Arabic", "English", or "Nobiin" for column mapping.
    /// </summary>
    private static string DetectLanguageColumnFromContent(string content)
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

    private static FamilyTreeApi.DTOs.NameMappingDto MapToDto(NameMapping mapping)
    {
        return new FamilyTreeApi.DTOs.NameMappingDto
        {
            Id = mapping.Id,
            Arabic = mapping.Arabic,
            English = mapping.English,
            Nobiin = mapping.Nobiin,
            Ipa = mapping.Ipa,
            IsVerified = mapping.IsVerified,
            Source = mapping.Source,
            Confidence = mapping.Confidence,
            NeedsReview = mapping.NeedsReview,
            CreatedAt = mapping.CreatedAt,
            UpdatedAt = mapping.UpdatedAt
        };
    }

    private static string GetSystemPrompt()
    {
        return @"You are a STRICT name transliteration engine for a production genealogy/family-tree system.

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

1. EXISTING VERIFIED DATA (from EXISTING_DATA block) — HIGHEST PRIORITY
2. GED-IMPORTED DATA (treat as authoritative, mark source=""ged"")
3. USER-CONFIRMED DATA (locked, never override)
4. DETERMINISTIC RULES (Egyptian romanization, IPA→Nobiin mapping)
5. AI SUGGESTION (LAST RESORT ONLY, always mark source=""ai_suggestion"")

If existing data matches input, you MUST reuse it VERBATIM.
You MUST NOT override verified, locked, or GED-imported data.

════════════════════════════════════════════════════════════════════════════════
LANGUAGE SPECIFICATIONS
════════════════════════════════════════════════════════════════════════════════

ARABIC (ar):
• Canonical semantic source WHEN PROVIDED
• Preserve spelling and spacing EXACTLY
• Never reinterpret meaning
• Arabic output is always suggestion until user confirmation

ENGLISH / LATIN (en):
• Use COMMON EGYPTIAN spellings by default
• Prefer real-world Egyptian usage over academic romanization
• Output is always suggestion unless DB-verified or user-confirmed

STANDARD EGYPTIAN ROMANIZATION:
  ا → A/a       ب → B         ت → T         ث → S (Egyptian)
  ج → G         ح → H         خ → Kh        د → D
  ذ → Z         ر → R         ز → Z         س → S
  ش → Sh        ص → S         ض → D         ط → T
  ظ → Z         ع → A         غ → Gh        ف → F
  ق → Q/K       ك → K         ل → L         م → M
  ن → N         ه → H         و → W/O/U     ي → Y/I/E
  ة → A/T       ال → El-/Al-

COMMON NAME PATTERNS:
  محمد → Mohamed (NOT Muhammad)
  أحمد → Ahmed (NOT Ahmad)
  يوسف → Youssef (NOT Yusuf)
  عبد → Abdel (NOT Abdul)
  عبد الله → Abdallah, Abdullah
  عبد الرحمن → Abdel Rahman
  فاطمة → Fatma (NOT Fatima)
  خالد → Khaled (NOT Khalid)
  مصطفى → Mostafa, Moustafa
  حسن → Hassan
  حسين → Hussein, Hossein
  إبراهيم → Ibrahim, Ebrahim
  نور → Nour, Noor

NOBIIN (nob) — Old Nubian/Coptic Script:
• Deterministic transliteration ONLY via IPA tokens
• NO AI creativity allowed
• Must be round-trip safe: Nobiin → IPA → Nobiin = EXACT MATCH
• ALWAYS apply LONGEST-MATCH rule first

════════════════════════════════════════════════════════════════════════════════
IPA ↔ NOBIIN LETTER MAPPING (AUTHORITATIVE)
════════════════════════════════════════════════════════════════════════════════

VOWELS:
  a → ⲁ     aa → ⲁ̄     e → ⲉ     ee → ⲉ̄     o → ⲟ     oo → ⲟ̄
  u → ⲟⲩ    uu → ⲟ̅ⲩ̅    i → ⲓ     ii → ⲓ̄

CONSONANTS:
  k → ⲕ     g → ⲅ     ŋ → ⲝ     t → ⲧ     d → ⲇ     n → ⲛ
  p → ⲡ     b → ⲃ     m → ⲙ     f → ⲫ     s → ⲥ     z → ⲍ
  l → ⲗ     r → ⲣ     h → ϩ     w → ⲱ     j → ⲏ     ɲ → ⲯ
  ʃ → ⲑ (sh sound)

ENGLISH → IPA:
  sh → ʃ    ch → ʃ    ee → ii    oo → uu

IPA → ENGLISH:
  ʃ → sh    ii → i    uu → u

════════════════════════════════════════════════════════════════════════════════
DIRECTION-SPECIFIC RULES
════════════════════════════════════════════════════════════════════════════════

A) ARABIC → ENGLISH:
   1. Check EXISTING_DATA first
   2. If found: Reuse verbatim, source=""db_reuse""
   3. Else: Apply Egyptian romanization
   4. Provide ONE best + up to 5 alternatives

B) ENGLISH → ARABIC:
   1. Check EXISTING_DATA first
   2. If found: Reuse verbatim, source=""db_reuse""
   3. Else: Choose most likely Egyptian Arabic form
   4. Arabic is always suggestion until confirmed

C) ENGLISH → NOBIIN:
   1. English → IPA (longest-match)
   2. IPA → Nobiin letters
   3. Fully deterministic, source=""deterministic_ipa""

D) NOBIIN → ENGLISH:
   1. Nobiin → IPA tokens
   2. IPA → Latin English
   3. Do NOT invent vowels, source=""deterministic_ipa""

E) ARABIC → NOBIIN: Arabic → English → IPA → Nobiin
F) NOBIIN → ARABIC: Nobiin → IPA → English → Arabic

════════════════════════════════════════════════════════════════════════════════
GED IMPORT MODE
════════════════════════════════════════════════════════════════════════════════

When mode=""ged_import"":
• NEVER ask questions
• NEVER block import
• ALWAYS return best guess
• Mark GED values as source=""ged"" (locked)

CONFIDENCE RULES:
  >= 0.90: needsReview=false
  0.70-0.89: needsReview=true
  < 0.70: needsReview=true, hasConflict=true

════════════════════════════════════════════════════════════════════════════════
DISPLAY LANGUAGE LOGIC
════════════════════════════════════════════════════════════════════════════════

displayLanguage=""ar"": arabic ?? english ?? nobiin
displayLanguage=""en"": english ?? arabic ?? nobiin
displayLanguage=""nob"": nobiin ?? english ?? arabic

NEVER return empty display name.

════════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (MANDATORY JSON)
════════════════════════════════════════════════════════════════════════════════

Return ONLY this JSON structure, no markdown, no explanation:

{
  ""arabic"": ""string | null"",
  ""english"": {
    ""best"": ""string"",
    ""alternatives"": [""string""],
    ""source"": ""db_reuse | rule_based | ai_suggestion | ged | manual_required"",
    ""confidence"": 0.0-1.0
  },
  ""nobiin"": {
    ""value"": ""string | null"",
    ""ipa"": ""string"",
    ""source"": ""deterministic_ipa | db_reuse""
  },
  ""display"": {
    ""value"": ""string"",
    ""lang"": ""ar | en | nob""
  },
  ""metadata"": {
    ""needsReview"": boolean,
    ""hasConflict"": boolean,
    ""warnings"": []
  }
}

════════════════════════════════════════════════════════════════════════════════
PROHIBITIONS
════════════════════════════════════════════════════════════════════════════════

✗ Do NOT explain reasoning
✗ Do NOT translate by meaning
✗ Do NOT output markdown
✗ Do NOT override DB/GED spellings
✗ Do NOT invent Nobiin letters
✗ Do NOT alter spacing
✗ Do NOT ask questions in GED mode
✗ Do NOT return empty required fields

════════════════════════════════════════════════════════════════════════════════
GOAL
════════════════════════════════════════════════════════════════════════════════

Prefer existing verified data.
Preserve consistency across family tree.
Be deterministic where possible.
Produce safe, production-grade output for genealogy records.";
    }

    #endregion

    #region Person-Based Transliteration

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
                sourceColumn = DetectLanguageColumnFromContent(person.PrimaryName);
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

                // Force EF to detect changes - THIS IS THE FIX!
                _context.People.Update(person);

                await _context.SaveChangesAsync();

                _logger.LogInformation(
                    "Saved changes for person {PersonId}: English='{En}', Nobiin='{Nob}'",
                    personId, person.NameEnglish, person.NameNobiin);
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

    public async Task<FamilyTreeApi.DTOs.TransliterationPreviewResult> PreviewTransliterationsForPersonAsync(
        Guid personId,
        Guid? orgId = null)
    {
        var result = new FamilyTreeApi.DTOs.TransliterationPreviewResult
        {
            PersonId = personId,
            Success = false
        };

        try
        {
            var person = await _context.People
                .FirstOrDefaultAsync(p => p.Id == personId && (!orgId.HasValue || p.OrgId == orgId));

            if (person == null)
            {
                result.Message = "Person not found";
                return result;
            }

            // Populate existing names from direct columns
            if (!string.IsNullOrWhiteSpace(person.NameArabic))
            {
                result.ExistingNames.Add(new FamilyTreeApi.DTOs.ExistingNameInfo
                {
                    Script = "Arabic",
                    FullName = person.NameArabic,
                    IsPrimary = person.PrimaryName == person.NameArabic
                });
            }
            if (!string.IsNullOrWhiteSpace(person.NameEnglish))
            {
                result.ExistingNames.Add(new FamilyTreeApi.DTOs.ExistingNameInfo
                {
                    Script = "Latin",
                    FullName = person.NameEnglish,
                    IsPrimary = person.PrimaryName == person.NameEnglish
                });
            }
            if (!string.IsNullOrWhiteSpace(person.NameNobiin))
            {
                result.ExistingNames.Add(new FamilyTreeApi.DTOs.ExistingNameInfo
                {
                    Script = "Coptic/Nobiin",
                    FullName = person.NameNobiin,
                    IsPrimary = person.PrimaryName == person.NameNobiin
                });
            }

            // Determine missing scripts using direct columns
            var missingScripts = new List<string>();
            if (string.IsNullOrWhiteSpace(person.NameArabic)) missingScripts.Add("arabic");
            if (string.IsNullOrWhiteSpace(person.NameEnglish)) missingScripts.Add("latin");
            if (string.IsNullOrWhiteSpace(person.NameNobiin)) missingScripts.Add("coptic");

            result.MissingScripts = missingScripts;

            if (!result.MissingScripts.Any())
            {
                result.Message = "All scripts present";
                result.Success = true;
                return result;
            }

            // Find source name to transliterate from
            var sourceName = person.NameArabic ?? person.NameEnglish ?? person.NameNobiin ?? person.PrimaryName;
            if (string.IsNullOrWhiteSpace(sourceName))
            {
                result.Message = "No valid source name found for transliteration";
                result.Success = true;
                return result;
            }

            var sourceLanguage = DetectSourceLanguageFromContent(sourceName);
            var sourceScript = sourceLanguage switch
            {
                "ar" => "Arabic",
                "nob" => "Coptic",
                _ => "Latin"
            };

            // Get transliteration preview (without saving)
            var translitRequest = new FamilyTreeApi.DTOs.TransliterationRequest
            {
                InputName = sourceName,
                SourceLanguage = sourceLanguage,
                DisplayLanguage = "en"
            };

            var translitResult = await TransliterateNameAsync(translitRequest);

            // Build proposed names
            if (result.MissingScripts.Contains("arabic") && !string.IsNullOrWhiteSpace(translitResult.Arabic))
            {
                result.ProposedNames.Add(new FamilyTreeApi.DTOs.ProposedNameInfo
                {
                    Script = "Arabic",
                    ProposedFullName = translitResult.Arabic,
                    SourceScript = sourceScript,
                    SourceName = sourceName,
                    Confidence = translitResult.English?.Confidence ?? 0,
                    NeedsReview = translitResult.Metadata?.NeedsReview ?? false
                });
            }

            if (result.MissingScripts.Contains("latin") && !string.IsNullOrWhiteSpace(translitResult.English?.Best))
            {
                result.ProposedNames.Add(new FamilyTreeApi.DTOs.ProposedNameInfo
                {
                    Script = "Latin/English",
                    ProposedFullName = translitResult.English.Best,
                    SourceScript = sourceScript,
                    SourceName = sourceName,
                    Confidence = translitResult.English.Confidence,
                    NeedsReview = translitResult.Metadata?.NeedsReview ?? false
                });
            }

            if (result.MissingScripts.Contains("coptic") && !string.IsNullOrWhiteSpace(translitResult.Nobiin?.Value))
            {
                result.ProposedNames.Add(new FamilyTreeApi.DTOs.ProposedNameInfo
                {
                    Script = "Coptic/Nobiin",
                    ProposedFullName = translitResult.Nobiin.Value,
                    SourceScript = sourceScript,
                    SourceName = sourceName,
                    Confidence = 1.0,
                    NeedsReview = false
                });
            }

            result.Success = true;
            result.Message = result.ProposedNames.Any()
                ? $"Can generate {result.ProposedNames.Count} name(s)"
                : "No translations available";

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error previewing translations for person {PersonId}", personId);
            result.Message = $"Error: {ex.Message}";
            return result;
        }
    }

    public async Task<FamilyTreeApi.DTOs.BulkTransliterationResult> BulkGenerateMissingNamesAsync(FamilyTreeApi.DTOs.BulkTransliterationRequest request)
    {
        var result = new FamilyTreeApi.DTOs.BulkTransliterationResult
        {
            Success = false
        };

        if (!request.OrgId.HasValue)
        {
            result.Message = "OrgId is required";
            return result;
        }

        try
        {
            // Find persons with incomplete names (using direct columns)
            var personsQuery = _context.People
                .Where(p => p.OrgId == request.OrgId.Value);

            if (request.SkipComplete)
            {
                // Only get persons missing at least one script
                personsQuery = personsQuery.Where(p =>
                    string.IsNullOrEmpty(p.NameArabic) ||
                    string.IsNullOrEmpty(p.NameEnglish) ||
                    string.IsNullOrEmpty(p.NameNobiin));
            }

            var persons = await personsQuery
                .Take(request.MaxPersons)
                .ToListAsync();

            _logger.LogInformation(
                "Bulk transliteration: Found {Count} persons to process in org {OrgId}",
                persons.Count, request.OrgId);

            foreach (var person in persons)
            {
                try
                {
                    var personResult = await GenerateMissingNamesForPersonAsync(person.Id, request.OrgId);
                    result.Results.Add(personResult);

                    if (personResult.Success)
                    {
                        result.TotalNamesGenerated += personResult.NamesGenerated;
                        result.TotalPersonsProcessed++;
                    }
                    else
                    {
                        result.Errors++;
                    }

                    // Rate limiting
                    if (personResult.NamesGenerated > 0)
                    {
                        await Task.Delay(300); // Prevent API rate limiting
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error processing person {PersonId} in bulk", person.Id);
                    result.Errors++;
                    result.Results.Add(new FamilyTreeApi.DTOs.PersonTransliterationResult
                    {
                        PersonId = person.Id,
                        Success = false,
                        Message = ex.Message
                    });
                }
            }

            result.Success = true;
            result.Message = $"Processed {result.TotalPersonsProcessed} persons, generated {result.TotalNamesGenerated} names";

            _logger.LogInformation(
                "Bulk transliteration complete: {Processed} persons, {Generated} names, {Errors} errors",
                result.TotalPersonsProcessed, result.TotalNamesGenerated, result.Errors);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in bulk transliteration for org {OrgId}", request.OrgId);
            result.Message = $"Error: {ex.Message}";
            return result;
        }
    }

    private static string NormalizeScript(string? script)
    {
        if (string.IsNullOrWhiteSpace(script)) return "unknown";

        return script.ToLowerInvariant() switch
        {
            "ar" or "arabic" => "arabic",
            "nob" or "nobiin" or "coptic" => "coptic",
            "en" or "english" or "latin" => "latin",
            _ => "unknown"
        };
    }

    /// <summary>
    /// Detects script from Unicode character ranges in the content.
    /// Arabic: U+0600-U+06FF, U+0750-U+077F, U+08A0-U+08FF
    /// Coptic: U+2C80-U+2CFF, U+0370-U+03FF (Greek/Coptic block)
    /// </summary>
    private static string DetectScriptFromContent(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return "latin";

        // Check for Arabic characters
        if (System.Text.RegularExpressions.Regex.IsMatch(content, @"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]"))
            return "arabic";

        // Check for Coptic characters
        if (System.Text.RegularExpressions.Regex.IsMatch(content, @"[\u2C80-\u2CFF\u0370-\u03FF]"))
            return "coptic";

        return "latin";
    }

    /// <summary>
    /// Gets the effective script, using content detection if script field is unknown.
    /// </summary>
    private static string GetEffectiveScript(string? script, string? content)
    {
        var normalized = NormalizeScript(script);
        if (normalized == "unknown" && !string.IsNullOrWhiteSpace(content))
        {
            return DetectScriptFromContent(content);
        }
        return normalized == "unknown" ? "latin" : normalized;
    }

    /// <summary>
    /// Detects source language code from content using Unicode detection.
    /// Returns: "ar" for Arabic, "nob" for Nobiin/Coptic, "en" for English/Latin
    /// </summary>
    private static string DetectSourceLanguageFromContent(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return "en";

        // Check for Arabic characters
        if (System.Text.RegularExpressions.Regex.IsMatch(content, @"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]"))
            return "ar";

        // Check for Coptic characters
        if (System.Text.RegularExpressions.Regex.IsMatch(content, @"[\u2C80-\u2CFF\u0370-\u03FF]"))
            return "nob";

        return "en";
    }

    #endregion
}
