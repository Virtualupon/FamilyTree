#nullable enable
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FamilyTreeApi.Services.Translation;

/// <summary>
/// Nobiin translation service using Claude AI.
/// This service is designed to be swappable with an external Nobiin API when available.
/// </summary>
public sealed class NobiinAITranslationService : INobiinTranslationService
{
    private readonly AnthropicClient _client;
    private readonly IDistributedCache _cache;
    private readonly ILogger<NobiinAITranslationService> _logger;

    private const string ModelName = "claude-sonnet-4-5-20250929";
    private const decimal LowTemperature = 0.3m;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);
    private const string CacheKeyPrefix = "translation:nobiin:";

    private static readonly string ToNobiinSystemPrompt = @"You are a translator specializing in Nobiin (ⲛⲟⲃⲓⲓⲛ), a Nubian language spoken in Egypt and Sudan.

TASK: Translate the given text TO Nobiin.

RULES:
1. Use Latin script transliteration for Nobiin (the language doesn't have a standardized written form)
2. Keep proper nouns (names of people, places) - transliterate, don't translate
3. Keep the translation natural and appropriate for family tree context
4. Nobiin uses SOV word order (Subject-Object-Verb)

OUTPUT: Return ONLY the Nobiin translation, nothing else. No explanations, no JSON, just the translated text.

EXAMPLE INPUT: ""My grandfather and grandmother on their wedding day""
EXAMPLE OUTPUT: Abba-n abba ir abba-n anna, igir doorii-n";

    private static readonly string FromNobiinSystemPrompt = @"You are a translator specializing in Nobiin (ⲛⲟⲃⲓⲓⲛ), a Nubian language spoken in Egypt and Sudan.

TASK: Translate the given Nobiin text to {TARGET_LANG}.

RULES:
1. Nobiin input is in Latin script transliteration
2. Keep proper nouns (names of people, places) - transliterate, don't translate
3. Keep the translation natural and appropriate for family tree context

OUTPUT: Return ONLY the translation, nothing else. No explanations, no JSON, just the translated text.";

    private static readonly string FromNobiinToAllSystemPrompt = @"You are a translator specializing in Nobiin (ⲛⲟⲃⲓⲓⲛ), a Nubian language spoken in Egypt and Sudan.

TASK: Translate the given Nobiin text to both English and Arabic.

RULES:
1. Nobiin input is in Latin script transliteration
2. Keep proper nouns (names of people, places) - transliterate, don't translate
3. Keep the translations natural and appropriate for family tree context

OUTPUT FORMAT (JSON only, no markdown):
{
  ""english"": ""English translation"",
  ""arabic"": ""Arabic translation""
}

EXAMPLE INPUT: Abba-n abba ir abba-n anna, igir doorii-n
EXAMPLE OUTPUT:
{
  ""english"": ""My grandfather and grandmother on their wedding day"",
  ""arabic"": ""جدي وجدتي في يوم زفافهما""
}

Return ONLY the JSON object, no explanations.";

    public NobiinAITranslationService(
        IConfiguration configuration,
        IDistributedCache cache,
        ILogger<NobiinAITranslationService> logger)
    {
        var apiKey = configuration["Anthropic:ApiKey"]
            ?? throw new InvalidOperationException("Anthropic API key not configured. Add 'Anthropic:ApiKey' to configuration.");

        _client = new AnthropicClient(apiKey);
        _cache = cache;
        _logger = logger;
    }

    public async Task<NobiinTranslationResult> TranslateToNobiinAsync(
        string text,
        string sourceLanguage,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return new NobiinTranslationResult
            {
                Success = true,
                TranslatedText = text
            };
        }

        // Check cache
        var cacheKey = GenerateCacheKey($"to_nob:{sourceLanguage}", text);
        try
        {
            var cached = await _cache.GetStringAsync(cacheKey, cancellationToken);
            if (!string.IsNullOrEmpty(cached))
            {
                _logger.LogDebug("Cache hit for Nobiin translation");
                return new NobiinTranslationResult
                {
                    Success = true,
                    TranslatedText = cached
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read from cache");
        }

        try
        {
            var langName = sourceLanguage == "ar" ? "Arabic" : "English";
            var userMessage = $"Translate this {langName} text to Nobiin:\n\n{text}";

            var messages = new List<Message>
            {
                new Message
                {
                    Role = RoleType.User,
                    Content = userMessage
                }
            };

            var parameters = new MessageParameters
            {
                Messages = messages,
                Model = ModelName,
                MaxTokens = 1024,
                Temperature = LowTemperature,
                SystemMessage = ToNobiinSystemPrompt
            };

            _logger.LogInformation("Translating to Nobiin via Claude AI: {Source} text length: {Length}",
                sourceLanguage, text.Length);

            var response = await _client.Messages.GetClaudeMessageAsync(parameters);
            var result = response.Content
                .OfType<TextContent>()
                .FirstOrDefault()?.Text?.Trim()
                ?? throw new InvalidOperationException("No response from Claude");

            // Cache the result
            await CacheResultAsync(cacheKey, result, cancellationToken);

            _logger.LogInformation("Nobiin translation success");

            return new NobiinTranslationResult
            {
                Success = true,
                TranslatedText = result
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to translate to Nobiin");
            return new NobiinTranslationResult
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }

    public async Task<NobiinTranslationResult> TranslateFromNobiinAsync(
        string text,
        string targetLanguage,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return new NobiinTranslationResult
            {
                Success = true,
                TranslatedText = text
            };
        }

        // Check cache
        var cacheKey = GenerateCacheKey($"from_nob:{targetLanguage}", text);
        try
        {
            var cached = await _cache.GetStringAsync(cacheKey, cancellationToken);
            if (!string.IsNullOrEmpty(cached))
            {
                _logger.LogDebug("Cache hit for Nobiin→{Target} translation", targetLanguage);
                return new NobiinTranslationResult
                {
                    Success = true,
                    TranslatedText = cached
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read from cache");
        }

        try
        {
            var langName = targetLanguage == "ar" ? "Arabic" : "English";
            var systemPrompt = FromNobiinSystemPrompt.Replace("{TARGET_LANG}", langName);
            var userMessage = $"Translate this Nobiin text to {langName}:\n\n{text}";

            var messages = new List<Message>
            {
                new Message
                {
                    Role = RoleType.User,
                    Content = userMessage
                }
            };

            var parameters = new MessageParameters
            {
                Messages = messages,
                Model = ModelName,
                MaxTokens = 1024,
                Temperature = LowTemperature,
                SystemMessage = systemPrompt
            };

            _logger.LogInformation("Translating from Nobiin via Claude AI: target={Target}, text length: {Length}",
                targetLanguage, text.Length);

            var response = await _client.Messages.GetClaudeMessageAsync(parameters);
            var result = response.Content
                .OfType<TextContent>()
                .FirstOrDefault()?.Text?.Trim()
                ?? throw new InvalidOperationException("No response from Claude");

            // Cache the result
            await CacheResultAsync(cacheKey, result, cancellationToken);

            _logger.LogInformation("Nobiin→{Target} translation success", targetLanguage);

            return new NobiinTranslationResult
            {
                Success = true,
                TranslatedText = result
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to translate from Nobiin");
            return new NobiinTranslationResult
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }

    public async Task<NobiinFullTranslationResult> TranslateFromNobiinToAllAsync(
        string nobiinText,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(nobiinText))
        {
            return new NobiinFullTranslationResult
            {
                Success = true,
                English = nobiinText,
                Arabic = nobiinText
            };
        }

        // Check cache
        var cacheKey = GenerateCacheKey("from_nob:all", nobiinText);
        try
        {
            var cached = await _cache.GetStringAsync(cacheKey, cancellationToken);
            if (!string.IsNullOrEmpty(cached))
            {
                _logger.LogDebug("Cache hit for Nobiin→All translation");
                var cachedResult = JsonSerializer.Deserialize<NobiinFullTranslationResult>(cached);
                if (cachedResult != null)
                {
                    cachedResult.Success = true;
                    return cachedResult;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read from cache");
        }

        try
        {
            var userMessage = $"Translate this Nobiin text to English and Arabic:\n\n{nobiinText}";

            var messages = new List<Message>
            {
                new Message
                {
                    Role = RoleType.User,
                    Content = userMessage
                }
            };

            var parameters = new MessageParameters
            {
                Messages = messages,
                Model = ModelName,
                MaxTokens = 1024,
                Temperature = LowTemperature,
                SystemMessage = FromNobiinToAllSystemPrompt
            };

            _logger.LogInformation("Translating from Nobiin to all via Claude AI, text length: {Length}",
                nobiinText.Length);

            var response = await _client.Messages.GetClaudeMessageAsync(parameters);
            var rawJson = response.Content
                .OfType<TextContent>()
                .FirstOrDefault()?.Text
                ?? throw new InvalidOperationException("No response from Claude");

            // Clean potential markdown formatting
            var json = rawJson
                .Replace("```json", "")
                .Replace("```", "")
                .Trim();

            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var parsed = JsonSerializer.Deserialize<TranslationPair>(json, options)
                ?? throw new InvalidOperationException("Failed to deserialize translation response");

            var result = new NobiinFullTranslationResult
            {
                Success = true,
                English = parsed.English,
                Arabic = parsed.Arabic
            };

            // Cache the result
            await CacheResultAsync(cacheKey, JsonSerializer.Serialize(result), cancellationToken);

            _logger.LogInformation("Nobiin→All translation success");

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to translate from Nobiin to all");
            return new NobiinFullTranslationResult
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }

    private async Task CacheResultAsync(string key, string value, CancellationToken cancellationToken)
    {
        try
        {
            await _cache.SetStringAsync(
                key,
                value,
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = CacheDuration
                },
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to cache translation result");
        }
    }

    private static string GenerateCacheKey(string prefix, string text)
    {
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(text));
        var hashString = Convert.ToBase64String(hash)[..16];
        return $"{CacheKeyPrefix}{prefix}:{hashString}";
    }

    private class TranslationPair
    {
        public string? English { get; set; }
        public string? Arabic { get; set; }
    }
}
