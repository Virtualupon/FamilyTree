using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

public interface IGedcomService
{
    /// <summary>
    /// Parse a GEDCOM file and return the parsed data without importing
    /// </summary>
    Task<(List<GedcomIndividual> Individuals, List<GedcomFamily> Families, List<string> Warnings)> ParseAsync(
        Stream gedcomStream,
        string? encoding = null);

    /// <summary>
    /// Import a GEDCOM file into a family tree
    /// </summary>
    Task<GedcomImportResult> ImportAsync(
        Stream gedcomStream,
        long userId,
        GedcomImportOptions options,
        string? encoding = null);
}
