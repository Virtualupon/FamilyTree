#nullable enable
using FamilyTreeApi.Services.Translation;
using Microsoft.Extensions.Logging;

namespace FamilyTreeApi.Services;

/// <summary>
/// Implementation of media translation service.
/// Delegates to ITextTranslationService which orchestrates LibreTranslate and AI services.
/// </summary>
public sealed class MediaTranslationService : IMediaTranslationService
{
    private readonly ITextTranslationService _textTranslationService;
    private readonly ILogger<MediaTranslationService> _logger;

    public MediaTranslationService(
        ITextTranslationService textTranslationService,
        ILogger<MediaTranslationService> logger)
    {
        _textTranslationService = textTranslationService;
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
            _logger.LogInformation("Translating media text: '{Text}'", text.Length > 50 ? text[..50] + "..." : text);

            var result = await _textTranslationService.TranslateAsync(text, cancellationToken);

            if (result.Success)
            {
                _logger.LogInformation(
                    "Translation complete. Source: {Source}, EN→AR via: {EnArProvider}, Nobiin via: {NobProvider}",
                    result.SourceLanguage,
                    result.EnArProvider,
                    result.NobiinProvider);
            }
            else
            {
                _logger.LogWarning("Translation failed: {Error}", result.ErrorMessage);
            }

            return new MediaTranslationResult
            {
                Success = result.Success,
                English = result.English,
                Arabic = result.Arabic,
                Nobiin = result.Nobiin,
                SourceLanguage = result.SourceLanguage,
                ErrorMessage = result.ErrorMessage
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
}
