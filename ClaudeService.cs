// UPDATED: Migrated from AudioFiles/ImageFiles/VideoFiles to unified Media table
// Services/Implementations/ClaudeService.cs
#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NobiinDictionary.API.Models;
using NobiinDictionary.API.Services.Interfaces;
using NobiinDictionary.DAL;

namespace NobiinDictionary.API.Services.Implementations
{
    /// <summary>
    /// AI prediction result for number pronunciation
    /// </summary>
    public class NumberPrediction
    {
        public int Number { get; set; }
        public string NobiinWord { get; set; } = string.Empty;
        public string? LatinTransliteration { get; set; }
        public string? IPA { get; set; }
        public string? EnglishTranslation { get; set; }
        public string? ArabicTranslation { get; set; }
        public bool ExistsInDatabase { get; set; }
        public string Source { get; set; } = "unknown"; // "database" or "ai_generated"
        public int? WordID { get; set; }
        public List<Media> AudioMedia { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    /// <summary>
    /// Internal training data structure
    /// </summary>
    internal class TrainingNumber
    {
        public int WordID { get; set; }
        public int NumericValue { get; set; }
        public string NobiinWord { get; set; } = "";
        public string LatinTransliteration { get; set; } = "";
        public string EnglishTranslation { get; set; } = "";
        public string ArabicTranslation { get; set; } = "";
    }

    public sealed class ClaudeService : IClaudeService
    {
        private readonly AnthropicClient _client;
        private readonly ApplicationDbContext _context;
        private readonly IMediaService _mediaService;
        private readonly ILogger<ClaudeService> _logger;
        private const string ModelName = "claude-sonnet-4-5-20250929";
        private const int NumberCategoryID = 107;

        public ClaudeService(
            IConfiguration configuration,
            ApplicationDbContext context,
            IMediaService mediaService,
            ILogger<ClaudeService> logger)
        {
            var apiKey = configuration["Anthropic:ApiKey"]
                ?? throw new InvalidOperationException("Anthropic API key not configured");

            _client = new AnthropicClient(apiKey);
            _context = context;
            _mediaService = mediaService;
            _logger = logger;
        }

        // ========================================================================
        // NUMBER PREDICTION
        // ========================================================================

        /// <summary>
        /// Get or predict pronunciation for a number (checks DB first, then uses AI)
        /// </summary>
        public async Task<NumberPrediction> GetOrPredictNumberAsync(int number)
        {
            if (number < 0)
            {
                throw new ArgumentException("Number must be non-negative", nameof(number));
            }

            if (number > 10_000_000)
            {
                throw new ArgumentException("Number too large. Maximum is 10 million.", nameof(number));
            }

            // Check if number exists in database
            var existingWord = await _context.Words
                .Include(w => w.Medias.Where(m => m.MediaType == "Audio" && m.IsPrimary))
                .Where(w => w.NumericValue == number && w.PartOfSpeech == "number")
                .FirstOrDefaultAsync();

            if (existingWord != null)
            {
                _logger.LogInformation("Number {Number} found in database (WordID: {WordID})",
                    number, existingWord.WordID);

                return new NumberPrediction
                {
                    Number = number,
                    NobiinWord = existingWord.NobiinWord,
                    LatinTransliteration = existingWord.LatinTransliteration,
                    EnglishTranslation = existingWord.EnglishTranslation,
                    ArabicTranslation = existingWord.ArabicTranslation,
                    ExistsInDatabase = true,
                    Source = "database",
                    WordID = existingWord.WordID,
                    AudioMedia = existingWord.Medias.Where(m => m.MediaType == "Audio").ToList()
                };
            }

            // Number not in database - generate with AI
            _logger.LogInformation("Number {Number} not in database, generating with AI", number);
            return await PredictNumberWithAIAsync(number);
        }

        /// <summary>
        /// Use AI to predict a number based on training data
        /// </summary>
        private async Task<NumberPrediction> PredictNumberWithAIAsync(int number)
        {
            // Get training data from database
            var trainingData = await GetTrainingNumbersFromDatabaseAsync();

            if (trainingData.Count == 0)
            {
                throw new InvalidOperationException(
                    "No training data available. Please add Nobiin numbers to the database first.");
            }

            // Build comprehensive prompt with all training data
            var prompt = BuildPredictionPrompt(number, trainingData);

            // Call Claude
            var parameters = new MessageParameters
            {
                Messages = new List<Message>
                {
                    new Message(RoleType.User, prompt)
                },
                Model = ModelName,
                MaxTokens = 1024,
                Temperature = 0.2m, // Low temperature for consistency
                System = new List<SystemMessage>
                {
                    new SystemMessage(
                        "You are an expert linguist specializing in the Nobiin language. " +
                        "You generate accurate Nobiin number words using Old Nubian/Coptic script. " +
                        "You always follow the exact patterns shown in the training examples. " +
                        "Pay special attention to the distinction between 100-199 (using ⲓⲙⲓⲗⲉ̄ⲣ and ⳣⲉ̄ⲣ) " +
                        "versus 200-999 (using ⲓⲙⲓⲗ + multiplier and ⳣⲉ̄ⲣⲁ)."
                    )
                }
            };

            var response = await _client.Messages.GetClaudeMessageAsync(parameters);
            var rawResponse = response.Content.OfType<TextContent>().FirstOrDefault()?.Text
                ?? throw new InvalidOperationException("No response from Claude");

            // Parse and return prediction
            var prediction = ParsePredictionResponse(number, rawResponse);
            prediction.Source = "ai_generated";
            prediction.ExistsInDatabase = false;

            _logger.LogInformation(
                "Generated Nobiin word for {Number}: {Word}",
                number,
                prediction.NobiinWord);

            return prediction;
        }

        /// <summary>
        /// Build comprehensive prediction prompt with training examples
        /// </summary>
        private string BuildPredictionPrompt(int targetNumber, List<TrainingNumber> trainingData)
        {
            var sb = new StringBuilder();

            sb.AppendLine("You are an expert in Nobiin language using Old Nubian/Coptic script.");
            sb.AppendLine();
            sb.AppendLine("=== NOBIIN NUMBER SYSTEM - TRAINING DATA ===");
            sb.AppendLine();

            // Organize by magnitude for better pattern recognition
            var ones = trainingData.Where(n => n.NumericValue >= 1 && n.NumericValue <= 10).OrderBy(n => n.NumericValue);
            var teens = trainingData.Where(n => n.NumericValue >= 11 && n.NumericValue <= 19).OrderBy(n => n.NumericValue);
            var decades = trainingData.Where(n => n.NumericValue >= 20 && n.NumericValue < 100 && n.NumericValue % 10 == 0).OrderBy(n => n.NumericValue);
            var compounds = trainingData.Where(n => n.NumericValue >= 20 && n.NumericValue < 100 && n.NumericValue % 10 != 0).OrderBy(n => n.NumericValue);
            var hundreds = trainingData.Where(n => n.NumericValue >= 100 && n.NumericValue < 1000).OrderBy(n => n.NumericValue);
            var thousands = trainingData.Where(n => n.NumericValue >= 1000 && n.NumericValue < 1000000).OrderBy(n => n.NumericValue);
            var millions = trainingData.Where(n => n.NumericValue >= 1000000).OrderBy(n => n.NumericValue);

            if (ones.Any())
            {
                sb.AppendLine("Base Numbers (1-10):");
                foreach (var n in ones)
                    sb.AppendLine($"  {n.NumericValue,2} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            if (teens.Any())
            {
                sb.AppendLine("Teens (11-19):");
                foreach (var n in teens)
                    sb.AppendLine($"  {n.NumericValue,2} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            if (decades.Any())
            {
                sb.AppendLine("Decades (20, 30, 40, 50, 60, 70, 80, 90):");
                foreach (var n in decades)
                    sb.AppendLine($"  {n.NumericValue,2} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            if (compounds.Any())
            {
                sb.AppendLine("Compound Numbers (21, 31, 41, 51, 61, 71, 81, 91):");
                foreach (var n in compounds)
                    sb.AppendLine($"  {n.NumericValue,2} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            if (hundreds.Any())
            {
                sb.AppendLine("Hundreds (100-999):");
                foreach (var n in hundreds)
                    sb.AppendLine($"  {n.NumericValue,4:N0} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            if (thousands.Any())
            {
                sb.AppendLine("Thousands (1,000+):");
                foreach (var n in thousands)
                    sb.AppendLine($"  {n.NumericValue,10:N0} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            if (millions.Any())
            {
                sb.AppendLine("Millions (1,000,000+):");
                foreach (var n in millions)
                    sb.AppendLine($"  {n.NumericValue,15:N0} = {n.NobiinWord} ({n.LatinTransliteration})");
                sb.AppendLine();
            }

            sb.AppendLine("═══════════════════════════════════════════════════════════");
            sb.AppendLine("NOBIIN NUMBER FORMATION RULES:");
            sb.AppendLine("═══════════════════════════════════════════════════════════");
            sb.AppendLine();
            sb.AppendLine("1. Base numbers (1-10): Memorize these foundation words");
            sb.AppendLine("   1=ⳣⲉ̄ⲣⲁ, 2=ⲟⲩⳣⳣⲟ, 3=ⲧⲟⲩⲥⲕⲟ, 4=ⲕⲉⲙⲥⲟ, 5=ⲇⲓⳝⲁ,");
            sb.AppendLine("   6=ⲅⲟⲣⳝⲟ, 7=ⲕⲟⲗⲟⲇⲁ, 8=ⲓⲇⳣⲟ, 9=ⲟⲥⲕⲟⲇⲁ, 10=ⲇⲓⲙⲉ");
            sb.AppendLine();
            sb.AppendLine("2. Teens (11-19): ⲇⲓⲙⲉ + [space] + [unit]");
            sb.AppendLine("   11 = ⲇⲓⲙⲉ ⳣⲉ̄ⲣⲁ (ten + one)");
            sb.AppendLine("   12 = ⲇⲓⲙⲉ ⲟⲩⳣⳣⲟ (ten + two)");
            sb.AppendLine("   13 = ⲇⲓⲙⲉ ⲧⲟⲩⲥⲕⲟ (ten + three)");
            sb.AppendLine();
            sb.AppendLine("3. Decades (30-90): [base unit modified] + ⲛⲇⲓ");
            sb.AppendLine("   30 = ⲧⲟⲥⲕⲟⲛⲇⲓ (3→ⲧⲟⲩⲥⲕⲟ becomes ⲧⲟⲥⲕⲟ + ⲛⲇⲓ)");
            sb.AppendLine("   40 = ⲕⲉⲙⲥⲟⲛⲇⲓ (4→ⲕⲉⲙⲥⲟ + ⲛⲇⲓ)");
            sb.AppendLine("   50 = ⲇⲓⳝⲟⲛⲇⲓ (5→ⲇⲓⳝⲁ becomes ⲇⲓⳝⲟ + ⲛⲇⲓ)");
            sb.AppendLine("   Exception: 20 = ⲁⲣⲟ (irregular)");
            sb.AppendLine();
            sb.AppendLine("4. Compound numbers (21-99): [decade] + [space] + [unit]");
            sb.AppendLine("   For +1: use ⳣⲉ̄ⲣⲁ (with macron)");
            sb.AppendLine("   21 = ⲁⲣⲟ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   22 = ⲁⲣⲟ ⲟⲩⳣⳣⲟ");
            sb.AppendLine("   31 = ⲧⲟⲥⲕⲟⲛⲇⲓ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   35 = ⲧⲟⲥⲕⲟⲛⲇⲓ ⲇⲓⳝⲁ");
            sb.AppendLine();
            sb.AppendLine("5. Hundreds (100-900): ⲓⲙⲓⲗ + [space] + [multiplier if >100]");
            sb.AppendLine("   100 = ⲓⲙⲓⲗ");
            sb.AppendLine("   200 = ⲓⲙⲓⲗ ⲟⲩⳣⳣⲟ");
            sb.AppendLine("   300 = ⲓⲙⲓⲗ ⲧⲟⲩⲥⲕⲟ");
            sb.AppendLine();
            sb.AppendLine("6. Complex hundreds (101-999) - CRITICAL DISTINCTION:");
            sb.AppendLine();
            sb.AppendLine("   ╔═══════════════════════════════════════════════════════╗");
            sb.AppendLine("   ║  SPECIAL RULE FOR 100-199 RANGE                       ║");
            sb.AppendLine("   ╚═══════════════════════════════════════════════════════╝");
            sb.AppendLine("   When hundred digit is 1 (i.e., 100-199):");
            sb.AppendLine("   - Change ⲓⲙⲓⲗ → ⲓⲙⲓⲗⲉ̄ⲣ (add connecting suffix ⲉ̄ⲣ)");
            sb.AppendLine("   - Change ⳣⲉ̄ⲣⲁ → ⳣⲉ̄ⲣ (drop final ⲁ from 'one')");
            sb.AppendLine();
            sb.AppendLine("   Examples:");
            sb.AppendLine("   101 = ⲓⲙⲓⲗⲉ̄ⲣ ⳣⲉ̄ⲣ (NOT ⲓⲙⲓⲗ ⳣⲉ̄ⲣⲁ)");
            sb.AppendLine("   121 = ⲓⲙⲓⲗⲉ̄ⲣ ⲁⲣⲟ ⳣⲉ̄ⲣ");
            sb.AppendLine("   141 = ⲓⲙⲓⲗⲉ̄ⲣ ⲕⲉⲙⲥⲟⲛⲇⲓ ⳣⲉ̄ⲣ");
            sb.AppendLine("   150 = ⲓⲙⲓⲗⲉ̄ⲣ ⲇⲓⳝⲟⲛⲇⲓ (no 'one' since it's exactly 150)");
            sb.AppendLine();
            sb.AppendLine("   ╔═══════════════════════════════════════════════════════╗");
            sb.AppendLine("   ║  STANDARD RULE FOR 200-999 RANGE                      ║");
            sb.AppendLine("   ╚═══════════════════════════════════════════════════════╝");
            sb.AppendLine("   When hundred digit is 2-9 (i.e., 200-999):");
            sb.AppendLine("   - Use standard: ⲓⲙⲓⲗ + [multiplier]");
            sb.AppendLine("   - Keep full ⳣⲉ̄ⲣⲁ (with final ⲁ for 'one')");
            sb.AppendLine();
            sb.AppendLine("   Examples:");
            sb.AppendLine("   201 = ⲓⲙⲓⲗ ⲟⲩⳣⳣⲟ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   401 = ⲓⲙⲓⲗ ⲕⲉⲙⲥⲟ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   501 = ⲓⲙⲓⲗ ⲇⲓⳝⲁ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   601 = ⲓⲙⲓⲗ ⲅⲟⲣⳝⲟ ⳣⲉⲣⲁ");
            sb.AppendLine("   701 = ⲓⲙⲓⲗ ⲕⲟⲗⲟⲇⲁ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   801 = ⲓⲙⲓⲗ ⲓⲇⳣⲟ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   901 = ⲓⲙⲓⲗ ⲟⲥⲕⲟⲇⲁ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   902 = ⲓⲙⲓⲗ ⲟⲥⲕⲟⲇⲁ ⲟⲩⳣⳣⲟ");
            sb.AppendLine();
            sb.AppendLine("   ╔═══════════════════════════════════════════════════════╗");
            sb.AppendLine("   ║  DECISION ALGORITHM                                    ║");
            sb.AppendLine("   ╚═══════════════════════════════════════════════════════╝");
            sb.AppendLine("   IF (hundred_digit == 1) THEN");
            sb.AppendLine("       use ⲓⲙⲓⲗⲉ̄ⲣ [remainder with ⳣⲉ̄ⲣ for 'one']");
            sb.AppendLine("   ELSE IF (hundred_digit >= 2 AND hundred_digit <= 9) THEN");
            sb.AppendLine("       use ⲓⲙⲓⲗ [multiplier] [remainder with ⳣⲉ̄ⲣⲁ for 'one']");
            sb.AppendLine("   END IF");
            sb.AppendLine();
            sb.AppendLine("7. Thousands (1,000+): ⲇⲟⲩⲣⲉ̄ + [remainder components]");
            sb.AppendLine("   1000 = ⲇⲟⲩⲣⲉ̄");
            sb.AppendLine("   1001 = ⲇⲟⲩⲣⲉ̄ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("   2000 = ⲇⲟⲩⲣⲉ̄ ⲟⲩⳣⳣⲟ");
            sb.AppendLine("   10001 = ⲇⲟⲩⲣⲉ̄ ⲇⲓⲙⲉ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine();
            sb.AppendLine("8. Millions (1,000,000+): ⲇⲟⲩⲣⲉ ⲇⲟⲣⲉ̄");
            sb.AppendLine("   1000000 = ⲇⲟⲩⲣⲉ ⲇⲟⲣⲉ̄");
            sb.AppendLine("   1000001 = ⲇⲟⲩⲣⲉ ⲇⲟⲣⲉ̄ ⳣⲉ̄ⲣⲁ");
            sb.AppendLine();
            sb.AppendLine("═══════════════════════════════════════════════════════════");
            sb.AppendLine($"TASK: Generate Nobiin word for {targetNumber:N0}");
            sb.AppendLine("═══════════════════════════════════════════════════════════");
            sb.AppendLine();
            sb.AppendLine("Step-by-step breakdown:");
            sb.AppendLine($"1. Identify the magnitude of {targetNumber:N0}");
            sb.AppendLine("2. Extract hundred digit if applicable");
            sb.AppendLine("3. Apply the correct rule based on hundred digit:");
            sb.AppendLine("   - If hundred digit = 1 → use ⲓⲙⲓⲗⲉ̄ⲣ and ⳣⲉ̄ⲣ");
            sb.AppendLine("   - If hundred digit = 2-9 → use ⲓⲙⲓⲗ + multiplier and ⳣⲉ̄ⲣⲁ");
            sb.AppendLine("4. Construct the complete number word");
            sb.AppendLine();
            sb.AppendLine("Use ONLY Coptic/Old Nubian script characters.");
            sb.AppendLine("Pay attention to spacing between components.");
            sb.AppendLine();
            sb.AppendLine("CRITICAL REMINDERS:");
            sb.AppendLine("- For 100-199: Use ⲓⲙⲓⲗⲉ̄ⲣ (with ⲉ̄ⲣ) and ⳣⲉ̄ⲣ (without final ⲁ)");
            sb.AppendLine("- For 200-999: Use ⲓⲙⲓⲗ + multiplier and ⳣⲉ̄ⲣⲁ (with final ⲁ)");
            sb.AppendLine();
            sb.AppendLine("RESPONSE FORMAT (exactly 2 lines):");
            sb.AppendLine("NOBIIN: [complete word in Coptic script]");
            sb.AppendLine("LATIN: [Latin transliteration]");

            return sb.ToString();
        }

        /// <summary>
        /// Generate pronunciations for multiple numbers
        /// </summary>
        public async Task<List<NumberPrediction>> PredictNumberBatchAsync(List<int> numbers)
        {
            var predictions = new List<NumberPrediction>();

            foreach (var number in numbers.OrderBy(n => n))
            {
                try
                {
                    var prediction = await GetOrPredictNumberAsync(number);
                    predictions.Add(prediction);

                    // Delay to avoid rate limiting (only for AI-generated)
                    if (prediction.Source == "ai_generated")
                    {
                        await Task.Delay(500);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to predict number {Number}", number);
                    predictions.Add(new NumberPrediction
                    {
                        Number = number,
                        Source = "error",
                        Warnings = new List<string> { ex.Message }
                    });
                }
            }

            return predictions;
        }

        // ========================================================================
        // ANALYSIS & TRANSLATION
        // ========================================================================

        /// <summary>
        /// Analyze and explain Nobiin number formation patterns
        /// </summary>
        public async Task<string> AnalyzeNumberPatternsAsync()
        {
            var trainingData = await GetTrainingNumbersFromDatabaseAsync();

            if (trainingData.Count == 0)
            {
                return "No number data available for analysis.";
            }

            var sb = new StringBuilder();
            sb.AppendLine("You are a linguistic expert. Analyze these Nobiin numbers and explain the formation patterns:");
            sb.AppendLine();

            foreach (var n in trainingData.OrderBy(x => x.NumericValue))
            {
                sb.AppendLine($"{n.NumericValue,10:N0} = {n.NobiinWord} ({n.LatinTransliteration})");
            }

            sb.AppendLine();
            sb.AppendLine("Provide comprehensive analysis including:");
            sb.AppendLine("1. Base numbers (1-10) and their characteristics");
            sb.AppendLine("2. Formation rules for teens (11-19)");
            sb.AppendLine("3. Decade formation pattern (20-90)");
            sb.AppendLine("4. Compound number structure (21-99)");
            sb.AppendLine("5. Hundreds patterns - especially the critical distinction:");
            sb.AppendLine("   - 100-199 range (using ⲓⲙⲓⲗⲉ̄ⲣ and ⳣⲉ̄ⲣ)");
            sb.AppendLine("   - 200-999 range (using ⲓⲙⲓⲗ + multiplier and ⳣⲉ̄ⲣⲁ)");
            sb.AppendLine("6. Thousands and millions patterns");
            sb.AppendLine("7. Any irregularities or exceptions");
            sb.AppendLine("8. Predictive rules for generating any number 1-10,000,000");

            return await GenerateResponseAsync(sb.ToString());
        }

        /// <summary>
        /// Translate text between languages
        /// </summary>
        public async Task<string> TranslateTextAsync(string text, string sourceLanguage, string targetLanguage)
        {
            var prompt = $@"Translate the following text from {sourceLanguage} to {targetLanguage}:

{text}

Provide only the translation, no explanation.";

            return await GenerateResponseAsync(prompt);
        }

        // ========================================================================
        // PUBLIC HELPER METHODS
        // ========================================================================

        /// <summary>
        /// Get all available numbers from database
        /// </summary>
        public async Task<List<NumberPrediction>> GetAvailableNumbersAsync()
        {
            var trainingData = await GetTrainingNumbersFromDatabaseAsync();

            return trainingData.Select(n => new NumberPrediction
            {
                Number = n.NumericValue,
                NobiinWord = n.NobiinWord,
                LatinTransliteration = n.LatinTransliteration,
                EnglishTranslation = n.EnglishTranslation,
                ArabicTranslation = n.ArabicTranslation,
                ExistsInDatabase = true,
                Source = "database",
                WordID = n.WordID
            }).ToList();
        }

        /// <summary>
        /// Check which numbers in a range are missing from database
        /// </summary>
        public async Task<List<int>> GetMissingNumbersInRangeAsync(int start, int end)
        {
            var existingNumbers = await _context.Words
                .Where(w => w.NumericValue >= start
                    && w.NumericValue <= end
                    && w.PartOfSpeech == "number")
                .Select(w => (int)w.NumericValue!.Value)
                .ToListAsync();

            var existing = existingNumbers.ToHashSet();

            return Enumerable.Range(start, end - start + 1)
                .Where(n => !existing.Contains(n))
                .ToList();
        }

        // ========================================================================
        // PRIVATE HELPER METHODS
        // ========================================================================

        /// <summary>
        /// Core AI method for simple prompts
        /// </summary>
        private async Task<string> GenerateResponseAsync(string prompt)
        {
            try
            {
                var messages = new List<Message>
                {
                    new Message(RoleType.User, prompt)
                };

                var parameters = new MessageParameters
                {
                    Messages = messages,
                    Model = ModelName,
                    MaxTokens = 4096,
                    Temperature = 0.7m
                };

                var response = await _client.Messages.GetClaudeMessageAsync(parameters);
                return response.Content.OfType<TextContent>().FirstOrDefault()?.Text ?? string.Empty;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calling Claude API");
                throw;
            }
        }

        /// <summary>
        /// Fetch training numbers from database (using NumericValue column)
        /// </summary>
        private async Task<List<TrainingNumber>> GetTrainingNumbersFromDatabaseAsync()
        {
            try
            {
                var numbers = await _context.Words
                    .Where(w => w.NumericValue != null && w.PartOfSpeech == "number")
                    .OrderBy(w => w.NumericValue)
                    .Select(w => new TrainingNumber
                    {
                        WordID = w.WordID,
                        NumericValue = (int)w.NumericValue!.Value,
                        NobiinWord = w.NobiinWord,
                        LatinTransliteration = w.LatinTransliteration ?? "",
                        EnglishTranslation = w.EnglishTranslation ?? "",
                        ArabicTranslation = w.ArabicTranslation ?? ""
                    })
                    .ToListAsync();

                _logger.LogInformation("Loaded {Count} training numbers from database", numbers.Count);
                return numbers;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading training numbers from database");
                return new List<TrainingNumber>();
            }
        }

        /// <summary>
        /// Parse AI response into structured prediction
        /// </summary>
        private NumberPrediction ParsePredictionResponse(int number, string rawResponse)
        {
            var prediction = new NumberPrediction { Number = number };
            var warnings = new List<string>();

            var lines = rawResponse.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            foreach (var line in lines)
            {
                if (line.StartsWith("NOBIIN:", StringComparison.OrdinalIgnoreCase))
                {
                    prediction.NobiinWord = line.Substring(7).Trim();
                }
                else if (line.StartsWith("LATIN:", StringComparison.OrdinalIgnoreCase))
                {
                    prediction.LatinTransliteration = line.Substring(6).Trim();
                }
            }

            // Validation
            if (string.IsNullOrEmpty(prediction.NobiinWord))
            {
                warnings.Add("Failed to extract Nobiin word from AI response");
            }
            else if (!ContainsEthiopicScript(prediction.NobiinWord))
            {
                warnings.Add("Generated text may not be in correct Ethiopic/Coptic script");
            }

            if (string.IsNullOrEmpty(prediction.LatinTransliteration))
            {
                warnings.Add("No Latin transliteration provided");
            }

            prediction.Warnings = warnings;
            return prediction;
        }

        /// <summary>
        /// Check if text contains Ethiopic/Coptic script characters
        /// </summary>
        private bool ContainsEthiopicScript(string text)
        {
            return text.Any(c => (c >= '\u1200' && c <= '\u137F') || (c >= '\u2C80' && c <= '\u2CFF'));
        }
    }
}