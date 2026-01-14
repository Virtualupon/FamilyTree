namespace FamilyTreeApi.DTOs;

/// <summary>
/// Country data transfer object
/// </summary>
public record CountryDto
{
    /// <summary>ISO 3166-1 alpha-2 country code (e.g., "EG", "US")</summary>
    public string Code { get; init; } = string.Empty;

    /// <summary>English name of the country</summary>
    public string NameEn { get; init; } = string.Empty;

    /// <summary>Arabic name of the country</summary>
    public string? NameAr { get; init; }

    /// <summary>Nobiin (local) name of the country</summary>
    public string? NameLocal { get; init; }

    /// <summary>Geographic region</summary>
    public string? Region { get; init; }

    /// <summary>Whether the country is active for selection</summary>
    public bool IsActive { get; init; } = true;

    /// <summary>Display order for sorting</summary>
    public int DisplayOrder { get; init; }
}

/// <summary>
/// DTO for creating a new country
/// </summary>
public record CreateCountryDto
{
    /// <summary>ISO 3166-1 alpha-2 country code (e.g., "EG", "US")</summary>
    public string Code { get; init; } = string.Empty;

    /// <summary>English name of the country</summary>
    public string NameEn { get; init; } = string.Empty;

    /// <summary>Arabic name of the country</summary>
    public string? NameAr { get; init; }

    /// <summary>Nobiin (local) name of the country</summary>
    public string? NameLocal { get; init; }

    /// <summary>Geographic region</summary>
    public string? Region { get; init; }

    /// <summary>Whether the country is active for selection</summary>
    public bool IsActive { get; init; } = true;

    /// <summary>Display order for sorting</summary>
    public int DisplayOrder { get; init; }
}

/// <summary>
/// DTO for updating an existing country
/// </summary>
public record UpdateCountryDto
{
    /// <summary>English name of the country</summary>
    public string? NameEn { get; init; }

    /// <summary>Arabic name of the country</summary>
    public string? NameAr { get; init; }

    /// <summary>Nobiin (local) name of the country</summary>
    public string? NameLocal { get; init; }

    /// <summary>Geographic region</summary>
    public string? Region { get; init; }

    /// <summary>Whether the country is active for selection</summary>
    public bool? IsActive { get; init; }

    /// <summary>Display order for sorting</summary>
    public int? DisplayOrder { get; init; }
}
