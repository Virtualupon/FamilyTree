namespace FamilyTreeApi.Models.Enums;

/// <summary>
/// Confidence level for suggestions indicating how certain the submitter is
/// </summary>
public enum ConfidenceLevel
{
    /// <summary>Absolutely certain (e.g., first-hand knowledge)</summary>
    Certain = 0,

    /// <summary>Highly likely (e.g., reliable sources)</summary>
    Probable = 1,

    /// <summary>Reasonably possible (e.g., family stories)</summary>
    Possible = 2,

    /// <summary>Uncertain (e.g., speculation)</summary>
    Uncertain = 3
}
