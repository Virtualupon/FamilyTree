using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace FamilyTreeApi.Utilities;

/// <summary>
/// Generates URL-safe slugs from names with multi-language support.
/// Thread-safe: all members are static and use no shared mutable state.
/// </summary>
public static class SlugGenerator
{
    // AUDIT FIX: Compiled regex for performance under load
    private static readonly Regex MultipleHyphensRegex = new("-+", RegexOptions.Compiled);

    private static readonly Dictionary<char, string> ArabicTranslit = new()
    {
        // Hamza forms
        ['أ'] = "a", ['ا'] = "a", ['إ'] = "e", ['آ'] = "a", ['ٱ'] = "a",
        // Core letters
        ['ب'] = "b", ['ت'] = "t", ['ث'] = "th", ['ج'] = "j",
        ['ح'] = "h", ['خ'] = "kh", ['د'] = "d", ['ذ'] = "th",
        ['ر'] = "r", ['ز'] = "z", ['س'] = "s", ['ش'] = "sh",
        ['ص'] = "s", ['ض'] = "d", ['ط'] = "t", ['ظ'] = "z",
        ['ع'] = "a", ['غ'] = "gh", ['ف'] = "f", ['ق'] = "q",
        ['ك'] = "k", ['ل'] = "l", ['م'] = "m", ['ن'] = "n",
        ['ه'] = "h", ['و'] = "w", ['ي'] = "y", ['ى'] = "a",
        ['ة'] = "a", ['ء'] = "", ['ئ'] = "y", ['ؤ'] = "w",
        // Persian/Urdu extensions
        ['پ'] = "p", ['چ'] = "ch", ['ژ'] = "zh", ['گ'] = "g", ['ڤ'] = "v",
        // Arabic numerals
        ['٠'] = "0", ['١'] = "1", ['٢'] = "2", ['٣'] = "3", ['٤'] = "4",
        ['٥'] = "5", ['٦'] = "6", ['٧'] = "7", ['٨'] = "8", ['٩'] = "9"
    };

    /// <summary>
    /// Generate URL-safe slug from any name (supports Arabic, Latin, etc.)
    /// </summary>
    /// <param name="input">The name to convert to a slug</param>
    /// <param name="maxLength">Maximum length of the resulting slug (default 50)</param>
    /// <returns>URL-safe slug, or "unknown" if input is null/empty</returns>
    public static string GenerateSlug(string? input, int maxLength = 50)
    {
        if (string.IsNullOrWhiteSpace(input))
            return "unknown";

        var result = new StringBuilder(input.Length);

        foreach (var c in input.ToLowerInvariant())
        {
            if (c >= 'a' && c <= 'z')
                result.Append(c);
            else if (c >= '0' && c <= '9')
                result.Append(c);
            else if (c == ' ' || c == '-' || c == '_')
                result.Append('-');
            else if (ArabicTranslit.TryGetValue(c, out var translit))
                result.Append(translit);
            else
            {
                // Try to normalize other characters (accents, etc.)
                var normalized = RemoveDiacriticsSafe(c);
                if (normalized.HasValue && char.IsLetter(normalized.Value))
                    result.Append(char.ToLowerInvariant(normalized.Value));
            }
        }

        // AUDIT FIX: Use compiled regex
        var slug = MultipleHyphensRegex.Replace(result.ToString(), "-").Trim('-');

        // Limit length
        if (slug.Length > maxLength)
            slug = slug[..maxLength].TrimEnd('-');

        return string.IsNullOrEmpty(slug) ? "unknown" : slug;
    }

    /// <summary>
    /// Remove diacritics from a single character.
    /// AUDIT FIX: Returns nullable char, handles exceptions safely.
    /// </summary>
    private static char? RemoveDiacriticsSafe(char c)
    {
        try
        {
            var str = c.ToString();
            var normalized = str.Normalize(NormalizationForm.FormD);

            foreach (var nc in normalized)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(nc) != UnicodeCategory.NonSpacingMark)
                    return nc;
            }

            return null;
        }
        catch (ArgumentException)
        {
            // Invalid Unicode sequence - skip this character
            return null;
        }
    }
}
