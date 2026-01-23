#nullable enable
using System.Text.Json;
using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FamilyTreeApi.Services;

/// <summary>
/// Implementation of media translation service using Claude AI.
/// Translates media descriptions and notes between English, Arabic, and Nobiin.
/// </summary>
public sealed class MediaTranslationService : IMediaTranslationService
{
    private readonly AnthropicClient _client;
    private readonly ILogger<MediaTranslationService> _logger;

    private const string ModelName = "claude-sonnet-4-5-20250929";
    private const decimal LowTemperature = 0.3m;

    private static readonly string SystemPrompt = @"You are a translation service for a family tree application.
Your task is to translate text between three languages:
- English (en)
- Arabic (ar) - Standard Arabic, commonly used in Egypt/Sudan
- Nobiin (nob) - A Nubian language spoken in Egypt and Sudan

RULES:
1. Auto-detect the source language from the input text
2. Translate the text to ALL THREE languages (including the source language as-is)
3. For Nobiin: Use Latin script transliteration since Nobiin doesn't have a standardized written form
4. Keep translations natural and appropriate for family tree context (describing photos, people, events)
5. Preserve proper nouns (names of people, places) - transliterate don't translate
6. Keep the tone and style consistent across translations

OUTPUT FORMAT (JSON only, no markdown):
{
  ""sourceLanguage"": ""en"" | ""ar"" | ""nob"",
  ""english"": ""English translation"",
  ""arabic"": ""Arabic translation"",
  ""nobiin"": ""Nobiin translation (Latin script)""
}

EXAMPLES:

Input: ""This is a family photo from 1985""
Output:
{
  ""sourceLanguage"": ""en"",
  ""english"": ""This is a family photo from 1985"",
  ""arabic"": ""هذه صورة عائلية من عام 1985"",
  ""nobiin"": ""In uu familii foto 1985-geed""
}

Input: ""جدي وجدتي في يوم زفافهما""
Output:
{
  ""sourceLanguage"": ""ar"",
  ""english"": ""My grandfather and grandmother on their wedding day"",
  ""arabic"": ""جدي وجدتي في يوم زفافهما"",
  ""nobiin"": ""Abba-n abba ir abba-n anna, igir doorii-n""
}

Return ONLY the JSON object, no explanations.";

    public MediaTranslationService(
        IConfiguration configuration,
        ILogger<MediaTranslationService> logger)
    {
        var apiKey = configuration["Anthropic:ApiKey"]
            ?? throw new InvalidOperationException("Anthropic API key not configured. Add 'Anthropic:ApiKey' to configuration.");

        _client = new AnthropicClient(apiKey);
        _logger = logger;
    }

    public async Task<MediaTranslationResult> TranslateTextAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return new MediaTranslationResult
            {
                Success = true,
                English = text,
                Arabic = text,
                Nobiin = text,
                SourceLanguage = "en"
            };
        }

        try
        {
            var messages = new List<Message>
            {
                new Message
                {
                    Role = RoleType.User,
                    Content = $"Translate this text to all three languages:\n\n{text}"
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

            _logger.LogInformation("Translating media text: '{Text}'", text.Length > 50 ? text[..50] + "..." : text);

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

            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            var parsed = JsonSerializer.Deserialize<TranslationResponse>(json, options)
                ?? throw new InvalidOperationException("Failed to deserialize translation response");

            _logger.LogInformation(
                "Translation complete. Source: {Source}, EN: '{En}', AR: '{Ar}'",
                parsed.SourceLanguage,
                parsed.English?.Length > 30 ? parsed.English[..30] + "..." : parsed.English,
                parsed.Arabic?.Length > 30 ? parsed.Arabic[..30] + "..." : parsed.Arabic);

            return new MediaTranslationResult
            {
                Success = true,
                English = parsed.English,
                Arabic = parsed.Arabic,
                Nobiin = parsed.Nobiin,
                SourceLanguage = parsed.SourceLanguage ?? DetectLanguage(text)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to translate text: '{Text}'", text.Length > 50 ? text[..50] + "..." : text);

            // Return original text in all fields on failure
            var detectedLang = DetectLanguage(text);
            return new MediaTranslationResult
            {
                Success = false,
                ErrorMessage = ex.Message,
                SourceLanguage = detectedLang,
                English = detectedLang == "en" ? text : null,
                Arabic = detectedLang == "ar" ? text : null,
                Nobiin = detectedLang == "nob" ? text : null
            };
        }
    }

    /// <summary>
    /// Simple language detection based on character ranges.
    /// </summary>
    private static string DetectLanguage(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "en";

        foreach (var ch in text)
        {
            // Arabic: U+0600 to U+06FF
            if (ch >= '\u0600' && ch <= '\u06FF')
                return "ar";
        }

        // Default to English
        return "en";
    }

    private class TranslationResponse
    {
        public string? SourceLanguage { get; set; }
        public string? English { get; set; }
        public string? Arabic { get; set; }
        public string? Nobiin { get; set; }
    }
}
