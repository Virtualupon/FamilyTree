using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.Services.Translation;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// API controller for text translation between English, Arabic, and Nobiin.
/// Uses LibreTranslate for English ↔ Arabic and AI for Nobiin translations.
/// </summary>
[ApiController]
[Route("api/translation")]
[Authorize]
public class TranslationController : ControllerBase
{
    private readonly ITextTranslationService _translationService;
    private readonly ILogger<TranslationController> _logger;

    public TranslationController(
        ITextTranslationService translationService,
        ILogger<TranslationController> logger)
    {
        _translationService = translationService;
        _logger = logger;
    }

    /// <summary>
    /// Translate text to all three languages (English, Arabic, Nobiin).
    /// Auto-detects the source language and translates to the other two.
    /// </summary>
    /// <param name="request">Translation request with text to translate</param>
    /// <returns>Translations in all three languages</returns>
    [HttpPost]
    [ProducesResponseType(typeof(TranslateTextResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TranslateTextResponse>> TranslateText(
        [FromBody] TranslateTextRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Text))
            {
                return BadRequest(new { message = "Text is required" });
            }

            // Limit text length for performance
            if (request.Text.Length > 5000)
            {
                return BadRequest(new { message = "Text must be 5000 characters or less" });
            }

            _logger.LogInformation("Translating text ({Length} chars)", request.Text.Length);

            var result = await _translationService.TranslateAsync(request.Text, cancellationToken);

            return Ok(new TranslateTextResponse
            {
                Success = result.Success,
                English = result.English,
                Arabic = result.Arabic,
                Nobiin = result.Nobiin,
                SourceLanguage = result.SourceLanguage,
                ErrorMessage = result.ErrorMessage
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error translating text");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to translate text" });
        }
    }

    /// <summary>
    /// Translate text from a specific source language to a target language.
    /// </summary>
    /// <param name="request">Single translation request</param>
    /// <returns>Translation result</returns>
    [HttpPost("single")]
    [ProducesResponseType(typeof(SingleTranslateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SingleTranslateResponse>> TranslateSingle(
        [FromBody] SingleTranslateRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Text))
            {
                return BadRequest(new { message = "Text is required" });
            }

            if (string.IsNullOrWhiteSpace(request.SourceLanguage) ||
                string.IsNullOrWhiteSpace(request.TargetLanguage))
            {
                return BadRequest(new { message = "Source and target languages are required" });
            }

            var validLanguages = new[] { "en", "ar", "nob" };
            if (!validLanguages.Contains(request.SourceLanguage.ToLower()) ||
                !validLanguages.Contains(request.TargetLanguage.ToLower()))
            {
                return BadRequest(new { message = "Invalid language. Use 'en', 'ar', or 'nob'" });
            }

            if (request.Text.Length > 5000)
            {
                return BadRequest(new { message = "Text must be 5000 characters or less" });
            }

            var result = await _translationService.TranslateAsync(
                request.Text,
                request.SourceLanguage.ToLower(),
                request.TargetLanguage.ToLower(),
                cancellationToken);

            return Ok(new SingleTranslateResponse
            {
                Success = result.Success,
                TranslatedText = result.TranslatedText,
                ErrorMessage = result.ErrorMessage
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in single translation");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to translate text" });
        }
    }
}

#region Request/Response DTOs

/// <summary>
/// Request to translate text to all three languages.
/// </summary>
public class TranslateTextRequest
{
    /// <summary>Text to translate (max 5000 characters)</summary>
    public string Text { get; set; } = string.Empty;
}

/// <summary>
/// Response with translations in all three languages.
/// </summary>
public class TranslateTextResponse
{
    /// <summary>Whether translation was successful</summary>
    public bool Success { get; set; }

    /// <summary>English translation (or original if input was English)</summary>
    public string? English { get; set; }

    /// <summary>Arabic translation (or original if input was Arabic)</summary>
    public string? Arabic { get; set; }

    /// <summary>Nobiin translation (or original if input was Nobiin)</summary>
    public string? Nobiin { get; set; }

    /// <summary>Detected source language: "en", "ar", or "nob"</summary>
    public string SourceLanguage { get; set; } = "en";

    /// <summary>Error message if translation failed</summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Request to translate from one specific language to another.
/// </summary>
public class SingleTranslateRequest
{
    /// <summary>Text to translate (max 5000 characters)</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>Source language code: "en", "ar", or "nob"</summary>
    public string SourceLanguage { get; set; } = "en";

    /// <summary>Target language code: "en", "ar", or "nob"</summary>
    public string TargetLanguage { get; set; } = "ar";
}

/// <summary>
/// Response for single translation.
/// </summary>
public class SingleTranslateResponse
{
    /// <summary>Whether translation was successful</summary>
    public bool Success { get; set; }

    /// <summary>Translated text</summary>
    public string? TranslatedText { get; set; }

    /// <summary>Error message if translation failed</summary>
    public string? ErrorMessage { get; set; }
}

#endregion
