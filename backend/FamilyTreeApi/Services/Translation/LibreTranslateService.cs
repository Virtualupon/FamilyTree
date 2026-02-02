#nullable enable
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FamilyTreeApi.Models.Configuration;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTreeApi.Services.Translation;

/// <summary>
/// LibreTranslate service implementation for English ↔ Arabic translation.
/// Includes caching, circuit breaker awareness, and retry logic via Polly (configured in DI).
/// </summary>
public sealed class LibreTranslateService : ILibreTranslateService
{
    private readonly HttpClient _httpClient;
    private readonly IDistributedCache _cache;
    private readonly ILogger<LibreTranslateService> _logger;
    private readonly LibreTranslateConfiguration _config;

    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(30);
    private const string CacheKeyPrefix = "translation:libre:";

    public LibreTranslateService(
        HttpClient httpClient,
        IDistributedCache cache,
        IOptions<LibreTranslateConfiguration> options,
        ILogger<LibreTranslateService> logger)
    {
        _httpClient = httpClient;
        _cache = cache;
        _logger = logger;
        _config = options.Value;

        // Configure base address from settings
        if (!string.IsNullOrEmpty(_config.BaseUrl))
        {
            _httpClient.BaseAddress = new Uri(_config.BaseUrl.TrimEnd('/') + "/");
        }
    }

    public async Task<LibreTranslateResult> TranslateAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return new LibreTranslateResult
            {
                Success = true,
                TranslatedText = text
            };
        }

        // Validate languages (LibreTranslate only supports en/ar for this service)
        if (!IsValidLanguage(sourceLanguage) || !IsValidLanguage(targetLanguage))
        {
            return new LibreTranslateResult
            {
                Success = false,
                ErrorMessage = $"LibreTranslate only supports 'en' and 'ar'. Got: {sourceLanguage} → {targetLanguage}"
            };
        }

        // Same language? Return as-is
        if (sourceLanguage.Equals(targetLanguage, StringComparison.OrdinalIgnoreCase))
        {
            return new LibreTranslateResult
            {
                Success = true,
                TranslatedText = text
            };
        }

        // Check cache first
        var cacheKey = GenerateCacheKey(text, sourceLanguage, targetLanguage);
        try
        {
            var cachedResult = await _cache.GetStringAsync(cacheKey, cancellationToken);
            if (!string.IsNullOrEmpty(cachedResult))
            {
                _logger.LogDebug("Cache hit for translation: {Source} → {Target}", sourceLanguage, targetLanguage);
                return new LibreTranslateResult
                {
                    Success = true,
                    TranslatedText = cachedResult,
                    FromCache = true
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read from cache, proceeding with translation");
        }

        try
        {
            var request = new LibreTranslateRequest
            {
                Q = text,
                Source = sourceLanguage,
                Target = targetLanguage,
                ApiKey = _config.ApiKey
            };

            _logger.LogInformation(
                "Translating via LibreTranslate: {Source} → {Target}, text length: {Length}",
                sourceLanguage, targetLanguage, text.Length);

            var response = await _httpClient.PostAsJsonAsync("translate", request, cancellationToken);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<LibreTranslateResponse>(cancellationToken: cancellationToken);

            if (result == null || string.IsNullOrEmpty(result.TranslatedText))
            {
                return new LibreTranslateResult
                {
                    Success = false,
                    ErrorMessage = "Empty response from LibreTranslate"
                };
            }

            // Cache the result
            try
            {
                await _cache.SetStringAsync(
                    cacheKey,
                    result.TranslatedText,
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

            _logger.LogInformation(
                "LibreTranslate success: {Source} → {Target}",
                sourceLanguage, targetLanguage);

            return new LibreTranslateResult
            {
                Success = true,
                TranslatedText = result.TranslatedText
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "LibreTranslate HTTP error: {Message}", ex.Message);
            return new LibreTranslateResult
            {
                Success = false,
                ErrorMessage = $"LibreTranslate service unavailable: {ex.Message}"
            };
        }
        catch (TaskCanceledException ex) when (ex.InnerException is TimeoutException)
        {
            _logger.LogError(ex, "LibreTranslate timeout");
            return new LibreTranslateResult
            {
                Success = false,
                ErrorMessage = "LibreTranslate request timed out"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "LibreTranslate unexpected error");
            return new LibreTranslateResult
            {
                Success = false,
                ErrorMessage = $"Translation failed: {ex.Message}"
            };
        }
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync("languages", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<string> DetectLanguageAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
            return "en";

        try
        {
            var request = new { q = text };
            var response = await _httpClient.PostAsJsonAsync("detect", request, cancellationToken);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<List<DetectResult>>(cancellationToken: cancellationToken);
            var detected = result?.FirstOrDefault()?.Language ?? "en";

            // Map to our supported languages
            return detected switch
            {
                "ar" => "ar",
                "en" => "en",
                _ => "en" // Default to English for unsupported languages
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Language detection failed, falling back to character analysis");
            return DetectLanguageByCharacters(text);
        }
    }

    private static bool IsValidLanguage(string lang)
    {
        return lang.Equals("en", StringComparison.OrdinalIgnoreCase) ||
               lang.Equals("ar", StringComparison.OrdinalIgnoreCase);
    }

    private static string GenerateCacheKey(string text, string source, string target)
    {
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(text));
        var hashString = Convert.ToBase64String(hash)[..16]; // Use first 16 chars
        return $"{CacheKeyPrefix}{source}:{target}:{hashString}";
    }

    private static string DetectLanguageByCharacters(string text)
    {
        foreach (var ch in text)
        {
            // Arabic: U+0600 to U+06FF
            if (ch >= '\u0600' && ch <= '\u06FF')
                return "ar";
        }
        return "en";
    }

    private class LibreTranslateRequest
    {
        [JsonPropertyName("q")]
        public string Q { get; set; } = "";

        [JsonPropertyName("source")]
        public string Source { get; set; } = "";

        [JsonPropertyName("target")]
        public string Target { get; set; } = "";

        [JsonPropertyName("api_key")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ApiKey { get; set; }
    }

    private class LibreTranslateResponse
    {
        [JsonPropertyName("translatedText")]
        public string? TranslatedText { get; set; }
    }

    private class DetectResult
    {
        [JsonPropertyName("language")]
        public string? Language { get; set; }

        [JsonPropertyName("confidence")]
        public double Confidence { get; set; }
    }
}
