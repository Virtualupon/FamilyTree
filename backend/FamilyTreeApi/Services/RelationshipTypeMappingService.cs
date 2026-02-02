using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service that maintains a mapping from i18n keys to database relationship type IDs.
/// Loads mapping from database at startup and caches it in memory.
/// </summary>
public class RelationshipTypeMappingService : IRelationshipTypeMappingService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RelationshipTypeMappingService> _logger;

    private Dictionary<string, int> _keyToIdMap = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, int> _nameToIdMap = new(StringComparer.OrdinalIgnoreCase);
    private string _cacheVersion = string.Empty;
    private bool _isInitialized = false;

    public bool IsInitialized => _isInitialized;

    public RelationshipTypeMappingService(
        IServiceScopeFactory scopeFactory,
        ILogger<RelationshipTypeMappingService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task InitializeAsync()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var types = await db.FamilyRelationshipTypes
                .Where(t => t.IsActive)
                .AsNoTracking()
                .ToListAsync();

            // Build name-to-ID map (NameEnglish is the key)
            _nameToIdMap = types
                .Where(t => !string.IsNullOrEmpty(t.NameEnglish))
                .ToDictionary(
                    t => t.NameEnglish.ToLowerInvariant(),
                    t => t.Id,
                    StringComparer.OrdinalIgnoreCase
                );

            // Build i18n key-to-ID map
            _keyToIdMap = BuildI18nKeyMap(types);

            // Cache version = hash of all IDs + names
            _cacheVersion = ComputeHash(types);

            _isInitialized = true;

            _logger.LogInformation(
                "RelationshipTypeMappingService initialized with {Count} types, version: {Version}",
                types.Count,
                _cacheVersion);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize RelationshipTypeMappingService");
            // Don't throw - allow app to start with empty mapping
            _isInitialized = true;
        }
    }

    public int? GetTypeIdByKey(string i18nKey)
    {
        if (string.IsNullOrEmpty(i18nKey))
            return null;

        if (_keyToIdMap.TryGetValue(i18nKey, out var id))
            return id;

        // Try without "relationship." prefix
        if (i18nKey.StartsWith("relationship.", StringComparison.OrdinalIgnoreCase))
        {
            var key = i18nKey.Substring("relationship.".Length);
            if (_keyToIdMap.TryGetValue(key, out id))
                return id;
        }

        _logger.LogDebug("Unknown i18n key: {Key}", i18nKey);
        return null;
    }

    public int? GetTypeIdByEnglishName(string englishName)
    {
        if (string.IsNullOrEmpty(englishName))
            return null;

        if (_nameToIdMap.TryGetValue(englishName, out var id))
            return id;

        _logger.LogDebug("Unknown English name: {Name}", englishName);
        return null;
    }

    public string GetCacheVersion()
    {
        return _cacheVersion;
    }

    private Dictionary<string, int> BuildI18nKeyMap(List<FamilyRelationshipType> types)
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var t in types)
        {
            if (string.IsNullOrEmpty(t.NameEnglish))
                continue;

            // Map standard i18n keys to DB IDs
            // "Father" -> "relationship.father"
            var camelCaseKey = ToCamelCase(t.NameEnglish);
            var fullKey = $"relationship.{camelCaseKey}";

            map[fullKey] = t.Id;
            map[camelCaseKey] = t.Id; // Also map without prefix

            // Add common variations
            AddVariations(map, t);
        }

        return map;
    }

    private void AddVariations(Dictionary<string, int> map, FamilyRelationshipType t)
    {
        var name = t.NameEnglish.ToLowerInvariant();
        var id = t.Id;

        // Handle hyphenated names: "Great-Grandfather" -> "greatGrandfather"
        // Already handled by ToCamelCase, but add some explicit mappings

        // Handle in-law variations
        if (name.Contains("-in-law"))
        {
            var inLawKey = name.Replace("-in-law", "InLaw").Replace("-", "");
            map[$"relationship.{inLawKey}"] = id;
        }

        // Handle cousin variations
        if (name.Contains("cousin"))
        {
            // "First Cousin" -> "cousin1", "Second Cousin" -> "cousin2", etc.
            if (name.StartsWith("first "))
                map["relationship.cousin1"] = id;
            else if (name.StartsWith("second "))
                map["relationship.cousin2"] = id;
            else if (name.StartsWith("third "))
                map["relationship.cousin3"] = id;

            // "Cousin Once Removed" -> "cousin1xRemoved"
            if (name.Contains("once removed"))
                map["relationship.cousin1xRemoved"] = id;
            else if (name.Contains("twice removed"))
                map["relationship.cousin2xRemoved"] = id;
        }

        // Handle great- variations
        if (name.StartsWith("great-"))
        {
            // "Great-Grandfather" -> "greatGrandfather" (already done)
            // Also add "relationship.greatGrandparent" -> matches "Great-Grandparent"
        }
    }

    private static string ToCamelCase(string input)
    {
        if (string.IsNullOrEmpty(input))
            return input;

        // Split on spaces, hyphens
        var parts = Regex.Split(input, @"[\s\-]+");

        if (parts.Length == 0)
            return input.ToLowerInvariant();

        var sb = new StringBuilder();

        for (int i = 0; i < parts.Length; i++)
        {
            var part = parts[i].Trim();
            if (string.IsNullOrEmpty(part))
                continue;

            if (sb.Length == 0)
            {
                // First part is lowercase
                sb.Append(part.ToLowerInvariant());
            }
            else
            {
                // Subsequent parts have first letter capitalized
                sb.Append(char.ToUpperInvariant(part[0]));
                if (part.Length > 1)
                    sb.Append(part.Substring(1).ToLowerInvariant());
            }
        }

        return sb.ToString();
    }

    private static string ComputeHash(List<FamilyRelationshipType> types)
    {
        // Create a string representation of all types
        var sb = new StringBuilder();
        foreach (var t in types.OrderBy(x => x.Id))
        {
            sb.Append(t.Id);
            sb.Append('|');
            sb.Append(t.NameEnglish);
            sb.Append('|');
            sb.Append(t.NameArabic);
            sb.Append('|');
            sb.Append(t.NameNubian);
            sb.Append(';');
        }

        // Compute SHA256 hash and return first 16 characters
        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).Substring(0, 16).ToLowerInvariant();
    }
}
