#nullable enable
namespace FamilyTreeApi.Services.Translation;

/// <summary>
/// Service for translating between English and Arabic using LibreTranslate.
/// </summary>
public interface ILibreTranslateService
{
    /// <summary>
    /// Translates text between English and Arabic using LibreTranslate.
    /// </summary>
    /// <param name="text">Text to translate</param>
    /// <param name="sourceLanguage">Source language ("en" or "ar")</param>
    /// <param name="targetLanguage">Target language ("en" or "ar")</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Translation result</returns>
    Task<LibreTranslateResult> TranslateAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if LibreTranslate service is available.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>True if service is available</returns>
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Detects the language of the given text.
    /// </summary>
    /// <param name="text">Text to detect</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Detected language code</returns>
    Task<string> DetectLanguageAsync(string text, CancellationToken cancellationToken = default);
}

/// <summary>
/// Result from LibreTranslate translation.
/// </summary>
public class LibreTranslateResult
{
    public string? TranslatedText { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public bool FromCache { get; set; }
}
