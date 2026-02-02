#nullable enable
namespace FamilyTreeApi.Services.Translation;

/// <summary>
/// Main translation service interface for text/sentence translation.
/// Orchestrates between LibreTranslate (for English ↔ Arabic) and AI (for Nobiin).
/// </summary>
public interface ITextTranslationService
{
    /// <summary>
    /// Translates text to all three languages (English, Arabic, Nobiin).
    /// Auto-detects the source language and translates to the other two.
    /// Uses LibreTranslate for English ↔ Arabic and AI for Nobiin translations.
    /// </summary>
    /// <param name="text">The text to translate</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Translations in all three languages</returns>
    Task<TextTranslationResult> TranslateAsync(string text, CancellationToken cancellationToken = default);

    /// <summary>
    /// Translates text from a specific source language to a target language.
    /// </summary>
    /// <param name="text">The text to translate</param>
    /// <param name="sourceLanguage">Source language code ("en", "ar", "nob")</param>
    /// <param name="targetLanguage">Target language code ("en", "ar", "nob")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Translation result</returns>
    Task<SingleTranslationResult> TranslateAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Result of text translation containing all three language versions.
/// </summary>
public class TextTranslationResult
{
    /// <summary>English translation (or original if input was English)</summary>
    public string? English { get; set; }

    /// <summary>Arabic translation (or original if input was Arabic)</summary>
    public string? Arabic { get; set; }

    /// <summary>Nobiin translation (or original if input was Nobiin)</summary>
    public string? Nobiin { get; set; }

    /// <summary>Detected source language code: "en", "ar", or "nob"</summary>
    public string SourceLanguage { get; set; } = "en";

    /// <summary>Whether translation was successful</summary>
    public bool Success { get; set; }

    /// <summary>Error message if translation failed</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Which service was used for English/Arabic translation</summary>
    public TranslationProvider EnArProvider { get; set; } = TranslationProvider.LibreTranslate;

    /// <summary>Which service was used for Nobiin translation</summary>
    public TranslationProvider NobiinProvider { get; set; } = TranslationProvider.ClaudeAI;
}

/// <summary>
/// Result of a single translation operation.
/// </summary>
public class SingleTranslationResult
{
    public string? TranslatedText { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public TranslationProvider Provider { get; set; }
}

/// <summary>
/// Translation provider used for the translation.
/// </summary>
public enum TranslationProvider
{
    LibreTranslate,
    ClaudeAI,
    Cache
}
