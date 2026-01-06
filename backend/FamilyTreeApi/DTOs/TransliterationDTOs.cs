using System.Text.Json.Serialization;

namespace FamilyTreeApi.DTOs;

#region Request DTOs

/// <summary>
/// Request to transliterate a single name between Arabic, English, and Nobiin
/// </summary>
public class TransliterationRequest
{
    /// <summary>The name to transliterate</summary>
    public string InputName { get; set; } = string.Empty;

    /// <summary>Source language: "ar" (Arabic), "en" (English), "nob" (Nobiin)</summary>
    public string SourceLanguage { get; set; } = "en";

    /// <summary>Preferred display language: "ar", "en", "nob"</summary>
    public string DisplayLanguage { get; set; } = "en";

    /// <summary>Whether this is part of a GED import (never blocks)</summary>
    public bool IsGedImport { get; set; } = false;

    /// <summary>Optional person ID to associate with the mapping</summary>
    public Guid? PersonId { get; set; }

    /// <summary>Optional organization/tree ID</summary>
    public Guid? OrgId { get; set; }
}

/// <summary>
/// Request to transliterate multiple names (batch processing)
/// </summary>
public class BatchTransliterationRequest
{
    /// <summary>List of names to transliterate</summary>
    public List<TransliterationRequest> Names { get; set; } = new();
}

/// <summary>
/// Request to verify/confirm a transliteration mapping
/// </summary>
public class VerifyMappingRequest
{
    /// <summary>ID of the mapping to verify</summary>
    public int MappingId { get; set; }

    /// <summary>Corrected Arabic value (null to keep existing)</summary>
    public string? Arabic { get; set; }

    /// <summary>Corrected English value (null to keep existing)</summary>
    public string? English { get; set; }

    /// <summary>Corrected Nobiin value (null to keep existing)</summary>
    public string? Nobiin { get; set; }
}

#endregion

#region Response DTOs

/// <summary>
/// Complete transliteration result with all language variants
/// </summary>
public class TransliterationResult
{
    [JsonPropertyName("arabic")]
    public string? Arabic { get; set; }

    [JsonPropertyName("english")]
    public EnglishResult English { get; set; } = new();

    [JsonPropertyName("nobiin")]
    public NobiinResult Nobiin { get; set; } = new();

    [JsonPropertyName("display")]
    public DisplayResult Display { get; set; } = new();

    [JsonPropertyName("metadata")]
    public MetadataResult Metadata { get; set; } = new();

    [JsonPropertyName("mappingId")]
    public int? MappingId { get; set; }
}

/// <summary>
/// English transliteration result with alternatives
/// </summary>
public class EnglishResult
{
    [JsonPropertyName("best")]
    public string Best { get; set; } = string.Empty;

    [JsonPropertyName("alternatives")]
    public List<string> Alternatives { get; set; } = new();

    [JsonPropertyName("source")]
    public string Source { get; set; } = "ai_suggestion";

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; } = 0.0;
}

/// <summary>
/// Nobiin transliteration result with IPA representation
/// </summary>
public class NobiinResult
{
    [JsonPropertyName("value")]
    public string? Value { get; set; }

    [JsonPropertyName("ipa")]
    public string? Ipa { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; } = "deterministic_ipa";
}

/// <summary>
/// Display name based on user's preferred language
/// </summary>
public class DisplayResult
{
    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;

    [JsonPropertyName("lang")]
    public string Lang { get; set; } = "en";
}

/// <summary>
/// Metadata about the transliteration process
/// </summary>
public class MetadataResult
{
    [JsonPropertyName("needsReview")]
    public bool NeedsReview { get; set; } = false;

    [JsonPropertyName("hasConflict")]
    public bool HasConflict { get; set; } = false;

    [JsonPropertyName("warnings")]
    public List<string> Warnings { get; set; } = new();

    [JsonPropertyName("fromCache")]
    public bool FromCache { get; set; } = false;
}

/// <summary>
/// Batch transliteration result
/// </summary>
public class BatchTransliterationResult
{
    /// <summary>List of transliteration results</summary>
    public List<TransliterationResult> Results { get; set; } = new();

    /// <summary>Total number of names processed</summary>
    public int TotalProcessed { get; set; }

    /// <summary>Number of names that need review</summary>
    public int NeedsReviewCount { get; set; }

    /// <summary>Number of names with conflicts</summary>
    public int ConflictCount { get; set; }

    /// <summary>Number of names retrieved from cache</summary>
    public int CachedCount { get; set; }
}

/// <summary>
/// Response for name mapping verification
/// </summary>
public class VerifyMappingResult
{
    public int MappingId { get; set; }
    public bool Success { get; set; }
    public string? Message { get; set; }
    public NameMappingDto? Mapping { get; set; }
}

/// <summary>
/// DTO for exposing NameMapping data
/// </summary>
public class NameMappingDto
{
    public int Id { get; set; }
    public string? Arabic { get; set; }
    public string? English { get; set; }
    public string? Nobiin { get; set; }
    public string? Ipa { get; set; }
    public bool IsVerified { get; set; }
    public string? Source { get; set; }
    public double? Confidence { get; set; }
    public bool NeedsReview { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Request for bulk transliteration generation
/// </summary>
public class BulkTransliterationRequest
{
    /// <summary>Organization/Tree ID to process</summary>
    public Guid? OrgId { get; set; }
    
    /// <summary>Only process persons missing specific scripts</summary>
    public List<string>? MissingScripts { get; set; }
    
    /// <summary>Maximum persons to process (default 100)</summary>
    public int MaxPersons { get; set; } = 100;
    
    /// <summary>Skip persons that already have all 3 scripts</summary>
    public bool SkipComplete { get; set; } = true;
}

/// <summary>
/// Result of generating translations for a single person
/// </summary>
public class PersonTransliterationResult
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public Guid PersonId { get; set; }
    public int NamesGenerated { get; set; }
    public List<GeneratedNameInfo> GeneratedNames { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
}

/// <summary>
/// Info about a generated name
/// </summary>
public class GeneratedNameInfo
{
    public Guid NameId { get; set; }
    public string Script { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string SourceScript { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
    public double Confidence { get; set; }
}

/// <summary>
/// Result of bulk transliteration generation
/// </summary>
public class BulkTransliterationResult
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public int TotalPersonsProcessed { get; set; }
    public int TotalNamesGenerated { get; set; }
    public int PersonsSkipped { get; set; }
    public int Errors { get; set; }
    public List<PersonTransliterationResult> Results { get; set; } = new();
}

/// <summary>
/// Preview of what translations would be generated
/// </summary>
public class TransliterationPreviewResult
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public Guid PersonId { get; set; }
    public List<ExistingNameInfo> ExistingNames { get; set; } = new();
    public List<ProposedNameInfo> ProposedNames { get; set; } = new();
    public List<string> MissingScripts { get; set; } = new();
}

/// <summary>
/// Info about an existing name
/// </summary>
public class ExistingNameInfo
{
    public Guid NameId { get; set; }
    public string Script { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public bool IsPrimary { get; set; }
}

/// <summary>
/// Info about a proposed name to generate
/// </summary>
public class ProposedNameInfo
{
    public string Script { get; set; } = string.Empty;
    public string ProposedFullName { get; set; } = string.Empty;
    public string SourceScript { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public bool NeedsReview { get; set; }
}

#endregion
