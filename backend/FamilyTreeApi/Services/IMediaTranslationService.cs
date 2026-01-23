#nullable enable
namespace FamilyTreeApi.Services;

/// <summary>
/// Service for translating media descriptions and notes across languages (English, Arabic, Nobiin).
/// Uses Claude AI for translation.
/// </summary>
public interface IMediaTranslationService
{
    /// <summary>
    /// Translates text to all three languages (English, Arabic, Nobiin).
    /// Auto-detects the source language and translates to the other two.
    /// </summary>
    /// <param name="text">The text to translate</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Translations in all three languages</returns>
    Task<MediaTranslationResult> TranslateTextAsync(string text, CancellationToken cancellationToken = default);
}

/// <summary>
/// Result of media text translation containing all three language versions.
/// </summary>
public class MediaTranslationResult
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
}
