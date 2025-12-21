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

    public async Task<TransliterationResult> TransliterateNameAsync(TransliterationRequest request)
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
            _logger.LogInformation(
                "Found cached mapping for '{Input}' (ID: {Id})",
                request.InputName, cached.Id);

            return BuildResultFromMapping(cached, request.DisplayLanguage, fromCache: true);
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

    public async Task<BatchTransliterationResult> TransliterateBatchAsync(
        List<TransliterationRequest> requests,
        IProgress<int>? progress = null)
    {
        var results = new List<TransliterationResult>();
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
                var fallback = new TransliterationResult
                {
                    English = new EnglishResult
                    {
                        Best = request.InputName,
                        Source = "manual_required",
                        Confidence = 0.0
                    },
                    Display = new DisplayResult
                    {
                        Value = request.InputName,
                        Lang = "en"
                    },
                    Metadata = new MetadataResult
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

        return new BatchTransliterationResult
        {
            Results = results,
            TotalProcessed = processed,
            NeedsReviewCount = needsReviewCount,
            ConflictCount = conflictCount,
            CachedCount = cachedCount
        };
    }

    public async Task<VerifyMappingResult> VerifyMappingAsync(VerifyMappingRequest request, long userId)
    {
        var mapping = await _context.NameMappings.FindAsync(request.MappingId);

        if (mapping == null)
        {
            return new VerifyMappingResult
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

        return new VerifyMappingResult
        {
            MappingId = mapping.Id,
            Success = true,
            Message = "Mapping verified successfully",
            Mapping = MapToDto(mapping)
        };
    }

    public async Task<List<NameMappingDto>> GetMappingsNeedingReviewAsync(Guid? orgId = null)
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

    public async Task<List<NameMappingDto>> SearchMappingsAsync(string searchTerm, int limit = 20)
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

    public async Task<NameMappingDto?> GetMappingByIdAsync(int id)
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

    private TransliterationResult BuildResultFromMapping(NameMapping mapping, string displayLanguage, bool fromCache)
    {
        var displayValue = displayLanguage switch
        {
            "ar" => mapping.Arabic ?? mapping.English ?? mapping.Nobiin ?? "",
            "nob" => mapping.Nobiin ?? mapping.English ?? mapping.Arabic ?? "",
            _ => mapping.English ?? mapping.Arabic ?? mapping.Nobiin ?? ""
        };

        return new TransliterationResult
        {
            Arabic = mapping.Arabic,
            English = new EnglishResult
            {
                Best = mapping.English ?? "",
                Alternatives = new List<string>(),
                Source = mapping.IsVerified ? "db_reuse" : (mapping.Source ?? "ai_suggestion"),
                Confidence = mapping.Confidence ?? (mapping.IsVerified ? 1.0 : 0.8)
            },
            Nobiin = new NobiinResult
            {
                Value = mapping.Nobiin,
                Ipa = mapping.Ipa,
                Source = mapping.IsVerified ? "db_reuse" : "deterministic_ipa"
            },
            Display = new DisplayResult
            {
                Value = displayValue,
                Lang = displayLanguage
            },
            Metadata = new MetadataResult
            {
                NeedsReview = mapping.NeedsReview,
                HasConflict = false,
                FromCache = fromCache,
                Warnings = new List<string>()
            },
            MappingId = mapping.Id
        };
    }

    private string BuildUserPrompt(TransliterationRequest request, List<NameMapping> existingMappings)
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

    private async Task<NameMapping> SaveMappingAsync(TransliterationResult result, TransliterationRequest request)
    {
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

    private static string NormalizeName(string name)
    {
        return name
            .ToLowerInvariant()
            .Replace("-", " ")
            .Replace("'", "")
            .Replace("\"", "")
            .Trim();
    }

    private static NameMappingDto MapToDto(NameMapping mapping)
    {
        return new NameMappingDto
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
}
