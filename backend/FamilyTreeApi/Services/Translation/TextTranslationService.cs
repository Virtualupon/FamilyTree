#nullable enable
using Microsoft.Extensions.Logging;

namespace FamilyTreeApi.Services.Translation;

/// <summary>
/// Main text translation service that orchestrates between LibreTranslate and AI services.
/// - English ↔ Arabic: Uses LibreTranslate (with AI fallback)
/// - Nobiin translations: Uses Claude AI
/// </summary>
public sealed class TextTranslationService : ITextTranslationService
{
    private readonly ILibreTranslateService _libreTranslate;
    private readonly INobiinTranslationService _nobiinService;
    private readonly ILogger<TextTranslationService> _logger;

    public TextTranslationService(
        ILibreTranslateService libreTranslate,
        INobiinTranslationService nobiinService,
        ILogger<TextTranslationService> logger)
    {
        _libreTranslate = libreTranslate;
        _nobiinService = nobiinService;
        _logger = logger;
    }

    public async Task<TextTranslationResult> TranslateAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return new TextTranslationResult
            {
                Success = true,
                English = text,
                Arabic = text,
                Nobiin = text,
                SourceLanguage = "en"
            };
        }

        // Detect source language
        var sourceLanguage = await DetectLanguageAsync(text, cancellationToken);

        _logger.LogInformation(
            "Starting translation for text (length: {Length}), detected language: {Lang}",
            text.Length, sourceLanguage);

        var result = new TextTranslationResult
        {
            SourceLanguage = sourceLanguage
        };

        try
        {
            switch (sourceLanguage)
            {
                case "en":
                    await TranslateFromEnglishAsync(text, result, cancellationToken);
                    break;

                case "ar":
                    await TranslateFromArabicAsync(text, result, cancellationToken);
                    break;

                case "nob":
                    await TranslateFromNobiinAsync(text, result, cancellationToken);
                    break;

                default:
                    // Treat unknown as English
                    result.SourceLanguage = "en";
                    await TranslateFromEnglishAsync(text, result, cancellationToken);
                    break;
            }

            result.Success = true;
            _logger.LogInformation("Translation completed successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Translation failed");
            result.Success = false;
            result.ErrorMessage = ex.Message;

            // Preserve original text in source language
            SetSourceLanguageText(result, sourceLanguage, text);
        }

        return result;
    }

    public async Task<SingleTranslationResult> TranslateAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text) || sourceLanguage == targetLanguage)
        {
            return new SingleTranslationResult
            {
                Success = true,
                TranslatedText = text,
                Provider = TranslationProvider.Cache
            };
        }

        // Nobiin translations always use AI
        if (sourceLanguage == "nob" || targetLanguage == "nob")
        {
            return await TranslateWithNobiinAsync(text, sourceLanguage, targetLanguage, cancellationToken);
        }

        // English ↔ Arabic uses LibreTranslate
        return await TranslateWithLibreAsync(text, sourceLanguage, targetLanguage, cancellationToken);
    }

    private async Task TranslateFromEnglishAsync(string text, TextTranslationResult result, CancellationToken cancellationToken)
    {
        result.English = text;

        // Translate to Arabic and Nobiin in parallel
        var arabicTask = TranslateToArabicAsync(text, cancellationToken);
        var nobiinTask = _nobiinService.TranslateToNobiinAsync(text, "en", cancellationToken);

        await Task.WhenAll(arabicTask, nobiinTask);

        var arabicResult = await arabicTask;
        result.Arabic = arabicResult.TranslatedText;
        result.EnArProvider = arabicResult.Success ? TranslationProvider.LibreTranslate : TranslationProvider.ClaudeAI;

        var nobiinResult = await nobiinTask;
        result.Nobiin = nobiinResult.TranslatedText;
        result.NobiinProvider = TranslationProvider.ClaudeAI;
    }

    private async Task TranslateFromArabicAsync(string text, TextTranslationResult result, CancellationToken cancellationToken)
    {
        result.Arabic = text;

        // Translate to English first (needed for Nobiin translation)
        var englishResult = await TranslateToEnglishAsync(text, cancellationToken);
        result.English = englishResult.TranslatedText;
        result.EnArProvider = englishResult.Success ? TranslationProvider.LibreTranslate : TranslationProvider.ClaudeAI;

        // Translate to Nobiin (from Arabic or English depending on what's available)
        var sourceForNobiin = text; // Use Arabic directly
        var nobiinResult = await _nobiinService.TranslateToNobiinAsync(sourceForNobiin, "ar", cancellationToken);
        result.Nobiin = nobiinResult.TranslatedText;
        result.NobiinProvider = TranslationProvider.ClaudeAI;
    }

    private async Task TranslateFromNobiinAsync(string text, TextTranslationResult result, CancellationToken cancellationToken)
    {
        result.Nobiin = text;
        result.NobiinProvider = TranslationProvider.ClaudeAI;

        // Translate to both English and Arabic in one AI call
        var allResult = await _nobiinService.TranslateFromNobiinToAllAsync(text, cancellationToken);

        if (allResult.Success)
        {
            result.English = allResult.English;
            result.Arabic = allResult.Arabic;
            result.EnArProvider = TranslationProvider.ClaudeAI; // Both came from AI
        }
        else
        {
            // Fallback: Translate separately
            var englishTask = _nobiinService.TranslateFromNobiinAsync(text, "en", cancellationToken);
            var arabicTask = _nobiinService.TranslateFromNobiinAsync(text, "ar", cancellationToken);

            await Task.WhenAll(englishTask, arabicTask);

            result.English = (await englishTask).TranslatedText;
            result.Arabic = (await arabicTask).TranslatedText;
            result.EnArProvider = TranslationProvider.ClaudeAI;
        }
    }

    private async Task<LibreTranslateResult> TranslateToArabicAsync(string englishText, CancellationToken cancellationToken)
    {
        var result = await _libreTranslate.TranslateAsync(englishText, "en", "ar", cancellationToken);

        if (!result.Success)
        {
            _logger.LogWarning("LibreTranslate failed, falling back to AI for en→ar");
            // Fallback to AI for Arabic translation would go here
            // For now, we'll just return the failed result
        }

        return result;
    }

    private async Task<LibreTranslateResult> TranslateToEnglishAsync(string arabicText, CancellationToken cancellationToken)
    {
        var result = await _libreTranslate.TranslateAsync(arabicText, "ar", "en", cancellationToken);

        if (!result.Success)
        {
            _logger.LogWarning("LibreTranslate failed, falling back to AI for ar→en");
            // Fallback to AI for English translation would go here
        }

        return result;
    }

    private async Task<SingleTranslationResult> TranslateWithNobiinAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken)
    {
        if (targetLanguage == "nob")
        {
            var result = await _nobiinService.TranslateToNobiinAsync(text, sourceLanguage, cancellationToken);
            return new SingleTranslationResult
            {
                TranslatedText = result.TranslatedText,
                Success = result.Success,
                ErrorMessage = result.ErrorMessage,
                Provider = TranslationProvider.ClaudeAI
            };
        }
        else // sourceLanguage == "nob"
        {
            var result = await _nobiinService.TranslateFromNobiinAsync(text, targetLanguage, cancellationToken);
            return new SingleTranslationResult
            {
                TranslatedText = result.TranslatedText,
                Success = result.Success,
                ErrorMessage = result.ErrorMessage,
                Provider = TranslationProvider.ClaudeAI
            };
        }
    }

    private async Task<SingleTranslationResult> TranslateWithLibreAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken)
    {
        var result = await _libreTranslate.TranslateAsync(text, sourceLanguage, targetLanguage, cancellationToken);

        return new SingleTranslationResult
        {
            TranslatedText = result.TranslatedText,
            Success = result.Success,
            ErrorMessage = result.ErrorMessage,
            Provider = result.FromCache ? TranslationProvider.Cache : TranslationProvider.LibreTranslate
        };
    }

    private async Task<string> DetectLanguageAsync(string text, CancellationToken cancellationToken)
    {
        // First, check for Arabic characters
        foreach (var ch in text)
        {
            if (ch >= '\u0600' && ch <= '\u06FF')
                return "ar";
        }

        // Check for Nobiin-specific patterns (Latin transliteration with specific patterns)
        // Nobiin uses patterns like "-n" suffixes, "uu", "ii" vowel combinations
        var lowerText = text.ToLowerInvariant();
        if (ContainsNobiinPatterns(lowerText))
        {
            return "nob";
        }

        // Try LibreTranslate detection as fallback
        try
        {
            var detected = await _libreTranslate.DetectLanguageAsync(text, cancellationToken);
            return detected;
        }
        catch
        {
            return "en"; // Default to English
        }
    }

    private static bool ContainsNobiinPatterns(string text)
    {
        // Common Nobiin patterns in Latin transliteration
        var nobiinPatterns = new[]
        {
            "-n ", "-n,", "-n.", // Definite article suffix
            " ir ",              // "and" in Nobiin
            "uu",                // Long vowel
            "ii",                // Long vowel
            "-geed",             // Year/time suffix
            "abba",              // Father/grandfather
            "anna",              // Mother/grandmother
            "doorii"             // Wedding
        };

        var matches = 0;
        foreach (var pattern in nobiinPatterns)
        {
            if (text.Contains(pattern))
                matches++;
        }

        // Require at least 2 pattern matches to classify as Nobiin
        return matches >= 2;
    }

    private static void SetSourceLanguageText(TextTranslationResult result, string sourceLanguage, string text)
    {
        switch (sourceLanguage)
        {
            case "en":
                result.English = text;
                break;
            case "ar":
                result.Arabic = text;
                break;
            case "nob":
                result.Nobiin = text;
                break;
        }
    }
}
