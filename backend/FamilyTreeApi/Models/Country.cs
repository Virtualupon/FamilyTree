using System.ComponentModel.DataAnnotations;

namespace FamilyTreeApi.Models;

/// <summary>
/// Represents a country for nationality selection.
/// Uses ISO 3166-1 alpha-2 country codes as primary key.
/// </summary>
public class Country
{
    /// <summary>ISO 3166-1 alpha-2 country code (e.g., "EG", "US")</summary>
    [Key]
    [MaxLength(2)]
    public string Code { get; set; } = string.Empty;

    /// <summary>English name of the country</summary>
    [Required]
    [MaxLength(100)]
    public string NameEn { get; set; } = string.Empty;

    /// <summary>Arabic name of the country</summary>
    [MaxLength(100)]
    public string? NameAr { get; set; }

    /// <summary>Nobiin (local) name of the country</summary>
    [MaxLength(100)]
    public string? NameLocal { get; set; }

    /// <summary>Geographic region (e.g., "Africa", "Middle East", "Europe")</summary>
    [MaxLength(50)]
    public string? Region { get; set; }

    /// <summary>Whether this country is active/visible in dropdowns</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Display order for sorting (lower numbers first)</summary>
    public int DisplayOrder { get; set; } = 0;
}
