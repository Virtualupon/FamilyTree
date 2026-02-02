#nullable enable
namespace FamilyTreeApi.Services.Translation;

/// <summary>
/// Service for translating to/from Nobiin language.
/// Currently uses Claude AI, but interface allows swapping to external API later.
/// </summary>
public interface INobiinTranslationService
{
    /// <summary>
    /// Translates text to Nobiin from English or Arabic.
    /// </summary>
    /// <param name="text">Text to translate</param>
    /// <param name="sourceLanguage">Source language ("en" or "ar")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Nobiin translation result</returns>
    Task<NobiinTranslationResult> TranslateToNobiinAsync(
        string text,
        string sourceLanguage,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Translates text from Nobiin to English or Arabic.
    /// </summary>
    /// <param name="text">Nobiin text to translate</param>
    /// <param name="targetLanguage">Target language ("en" or "ar")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Translation result</returns>
    Task<NobiinTranslationResult> TranslateFromNobiinAsync(
        string text,
        string targetLanguage,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Translates text to all languages from Nobiin.
    /// Returns English and Arabic translations.
    /// </summary>
    /// <param name="nobiinText">Nobiin text to translate</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Translation result with English and Arabic</returns>
    Task<NobiinFullTranslationResult> TranslateFromNobiinToAllAsync(
        string nobiinText,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Result from Nobiin translation.
/// </summary>
public class NobiinTranslationResult
{
    public string? TranslatedText { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Result from translating Nobiin to all languages.
/// </summary>
public class NobiinFullTranslationResult
{
    public string? English { get; set; }
    public string? Arabic { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
}
