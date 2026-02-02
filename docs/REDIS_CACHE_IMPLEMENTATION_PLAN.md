# Implementation Plan: Redis Cache for FamilyTree

## Overview

Add Redis distributed caching to FamilyTree backend for tree data, relationship paths, and reference data. The infrastructure is already partially set up - this plan enables and expands it.

**Current State:**
- Redis packages installed (`Microsoft.Extensions.Caching.StackExchangeRedis` v8.0.11)
- Health checks configured (`AspNetCore.HealthChecks.Redis` v9.0.0)
- `IDistributedCache` registered but Redis disabled
- `IMemoryCache` used in `FamilyRelationshipTypeService`

**Target State:**
- Redis enabled with proper configuration
- Tree data cached (pedigree, descendants, hourglass)
- Relationship paths cached with symmetric key normalization
- Reference data cached (countries, relationship types)
- Cache invalidation on data changes

---

## CRITICAL: Security & Safety Constraints

The following constraints address audit findings and MUST be enforced:

### Authorization & Multi-Tenancy
| Constraint | Enforcement | Reason |
|------------|-------------|--------|
| OrgId in ALL cache keys | `CacheKeyBuilder` includes OrgId | Prevent cross-tenant data leakage |
| OrgId validated before cache return | Service layer validates `userContext.OrgId` | Defense in depth |
| GUIDs normalized to lowercase | `ToString("N").ToLowerInvariant()` | Consistent cache keys |

### Resource Limits
| Constraint | Value | Enforcement |
|------------|-------|-------------|
| Max cache payload size | 5 MB | Check before serialization |
| Max generations parameter | 10 | Validate in cache key builder |
| Circuit breaker threshold | 5 failures in 30s | Polly policy |
| Circuit breaker recovery | 30 seconds | Polly policy |

### Thread Safety
| Constraint | Enforcement |
|------------|-------------|
| CacheOptionsProvider dictionary | Use `ConcurrentDictionary` |
| Singleton services | No mutable instance state |

---

## Phase 0: Infrastructure Setup

### 0.1 Enable Redis in Configuration

**File:** `backend/FamilyTreeApi/appsettings.json`

Update Redis section:
```json
"Redis": {
  "Enabled": true,
  "InstanceName": "familytree:",
  "ConnectionString": "localhost:6379,abortConnect=false,connectTimeout=15000,syncTimeout=15000",
  "MaxPayloadSizeBytes": 5242880,
  "CircuitBreakerFailureThreshold": 5,
  "CircuitBreakerDurationSeconds": 30
}
```

### 0.2 Create CacheOptionsProvider (Thread-Safe)

**File to create:** `backend/FamilyTreeApi/Services/Caching/ICacheOptionsProvider.cs`

```csharp
using Microsoft.Extensions.Caching.Distributed;

namespace FamilyTreeApi.Services.Caching;

public interface ICacheOptionsProvider
{
    DistributedCacheEntryOptions WithLifeTime(CacheLifeTime timeout);
}

/// <summary>
/// Represents a cache lifetime duration.
/// Uses struct (not ref struct) for async compatibility.
/// </summary>
public readonly struct CacheLifeTime
{
    private readonly TimeSpan _timeout;

    private CacheLifeTime(TimeSpan timeout) => _timeout = timeout;
    private CacheLifeTime(double minutes) => _timeout = TimeSpan.FromMinutes(minutes);

    public static implicit operator TimeSpan(CacheLifeTime cacheLifeTime) => cacheLifeTime._timeout;
    public static implicit operator CacheLifeTime(TimeSpan ts) => new(ts);
    public static implicit operator CacheLifeTime(double minutes) => new(minutes);

    // Predefined durations
    public static CacheLifeTime Short => TimeSpan.FromMinutes(15);
    public static CacheLifeTime Medium => TimeSpan.FromHours(1);
    public static CacheLifeTime Long => TimeSpan.FromHours(6);
    public static CacheLifeTime VeryLong => TimeSpan.FromHours(24);
    public static CacheLifeTime ReferenceData => TimeSpan.FromDays(7);
}
```

**File to create:** `backend/FamilyTreeApi/Services/Caching/CacheOptionsProvider.cs`

```csharp
using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Distributed;

namespace FamilyTreeApi.Services.Caching;

/// <summary>
/// Thread-safe cache options provider that pools DistributedCacheEntryOptions instances.
/// Registered as Singleton - must be thread-safe.
/// </summary>
internal class CacheOptionsProvider : ICacheOptionsProvider
{
    // CRITICAL: Use ConcurrentDictionary for thread safety (Singleton service)
    private readonly ConcurrentDictionary<TimeSpan, DistributedCacheEntryOptions> _options = new();

    public DistributedCacheEntryOptions WithLifeTime(CacheLifeTime timeout)
    {
        TimeSpan ts = timeout;
        return _options.GetOrAdd(ts, CreateOptions);
    }

    private static DistributedCacheEntryOptions CreateOptions(TimeSpan ts)
    {
        return new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ts
        };
    }
}
```

### 0.3 Create Cache Key Builder (With Security)

**File to create:** `backend/FamilyTreeApi/Services/Caching/CacheKeyBuilder.cs`

```csharp
namespace FamilyTreeApi.Services.Caching;

/// <summary>
/// Builds standardized cache keys with security constraints.
/// All keys include OrgId to prevent cross-tenant data leakage.
/// GUIDs are normalized to lowercase without dashes for consistency.
/// </summary>
public static class CacheKeyBuilder
{
    // SECURITY: Maximum allowed generations to prevent cache key explosion
    private const int MaxGenerations = 10;
    private const int MinGenerations = 1;

    /// <summary>
    /// Normalize GUID to consistent format: lowercase, no dashes.
    /// Prevents cache misses due to different GUID string representations.
    /// </summary>
    private static string NormalizeGuid(Guid id) => id.ToString("N").ToLowerInvariant();

    /// <summary>
    /// Clamp generations to valid range.
    /// </summary>
    private static int ClampGenerations(int generations)
        => Math.Clamp(generations, MinGenerations, MaxGenerations);

    // =========================================================================
    // TREE VIEW KEYS - All include OrgId for multi-tenancy
    // =========================================================================

    public static string Pedigree(Guid personId, int generations, Guid orgId)
        => $"pedigree:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}:{ClampGenerations(generations)}";

    public static string Descendants(Guid personId, int generations, Guid orgId)
        => $"descendants:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}:{ClampGenerations(generations)}";

    public static string Hourglass(Guid personId, int ancestorGen, int descendantGen, Guid orgId)
        => $"hourglass:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}:{ClampGenerations(ancestorGen)}:{ClampGenerations(descendantGen)}";

    public static string FamilyGroup(Guid personId, Guid orgId)
        => $"family:{NormalizeGuid(orgId)}:{NormalizeGuid(personId)}";

    /// <summary>
    /// Relationship path key with normalized pair ordering.
    /// Smaller GUID comes first to ensure A->B and B->A use same cache entry.
    /// </summary>
    public static string RelationshipPath(Guid person1Id, Guid person2Id, Guid orgId)
    {
        var p1 = NormalizeGuid(person1Id);
        var p2 = NormalizeGuid(person2Id);
        var (first, second) = string.CompareOrdinal(p1, p2) < 0 ? (p1, p2) : (p2, p1);
        return $"relationship:{NormalizeGuid(orgId)}:{first}:{second}";
    }

    // =========================================================================
    // REFERENCE DATA KEYS - Global, not tenant-specific
    // =========================================================================

    public static string RelationshipTypes() => "ref:relationship-types";
    public static string RelationshipTypesGrouped() => "ref:relationship-types:grouped";
    public static string Countries() => "ref:countries";
    public static string CountryByCode(string code) => $"ref:country:{code.ToUpperInvariant()}";

    // =========================================================================
    // INVALIDATION PATTERNS - For Redis SCAN operations
    // =========================================================================

    /// <summary>
    /// Pattern to match all cache keys for a specific organization.
    /// Use with Redis SCAN for bulk invalidation.
    /// </summary>
    public static string OrgPattern(Guid orgId) => $"*:{NormalizeGuid(orgId)}:*";

    /// <summary>
    /// Get all possible generation variants for a person's tree views.
    /// Used for complete invalidation without pattern matching.
    /// </summary>
    public static IEnumerable<string> AllPedigreeVariants(Guid personId, Guid orgId)
    {
        for (int gen = MinGenerations; gen <= MaxGenerations; gen++)
            yield return Pedigree(personId, gen, orgId);
    }

    public static IEnumerable<string> AllDescendantsVariants(Guid personId, Guid orgId)
    {
        for (int gen = MinGenerations; gen <= MaxGenerations; gen++)
            yield return Descendants(personId, gen, orgId);
    }

    public static IEnumerable<string> AllHourglassVariants(Guid personId, Guid orgId)
    {
        for (int aGen = MinGenerations; aGen <= MaxGenerations; aGen++)
            for (int dGen = MinGenerations; dGen <= MaxGenerations; dGen++)
                yield return Hourglass(personId, aGen, dGen, orgId);
    }
}
```

### 0.4 Create Resilient Cache Wrapper (Circuit Breaker)

**File to create:** `backend/FamilyTreeApi/Services/Caching/ResilientCacheService.cs`

```csharp
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using Polly;
using Polly.CircuitBreaker;

namespace FamilyTreeApi.Services.Caching;

public interface IResilientCacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct = default) where T : class;
    Task<bool> SetAsync<T>(string key, T value, CacheLifeTime lifetime, CancellationToken ct = default) where T : class;
    Task RemoveAsync(string key, CancellationToken ct = default);
    Task RemoveMultipleAsync(IEnumerable<string> keys, CancellationToken ct = default);
}

/// <summary>
/// Cache wrapper with circuit breaker pattern for Redis resilience.
/// Prevents cascade failures when Redis is unavailable.
/// </summary>
public class ResilientCacheService : IResilientCacheService
{
    private readonly IDistributedCache _cache;
    private readonly ICacheOptionsProvider _options;
    private readonly ILogger<ResilientCacheService> _logger;
    private readonly AsyncCircuitBreakerPolicy _circuitBreaker;
    private readonly int _maxPayloadSize;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        MaxDepth = 64 // Prevent deeply nested payloads
    };

    public ResilientCacheService(
        IDistributedCache cache,
        ICacheOptionsProvider options,
        IConfiguration configuration,
        ILogger<ResilientCacheService> logger)
    {
        _cache = cache;
        _options = options;
        _logger = logger;

        var redisConfig = configuration.GetSection("Redis");
        _maxPayloadSize = redisConfig.GetValue("MaxPayloadSizeBytes", 5 * 1024 * 1024); // 5MB default
        var failureThreshold = redisConfig.GetValue("CircuitBreakerFailureThreshold", 5);
        var durationSeconds = redisConfig.GetValue("CircuitBreakerDurationSeconds", 30);

        // Circuit breaker: Open after N failures, stay open for M seconds
        _circuitBreaker = Policy
            .Handle<Exception>()
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking: failureThreshold,
                durationOfBreak: TimeSpan.FromSeconds(durationSeconds),
                onBreak: (ex, duration) =>
                {
                    _logger.LogWarning(ex,
                        "Cache circuit breaker OPEN for {Duration}s", duration.TotalSeconds);
                },
                onReset: () =>
                {
                    _logger.LogInformation("Cache circuit breaker CLOSED - Redis recovered");
                },
                onHalfOpen: () =>
                {
                    _logger.LogInformation("Cache circuit breaker HALF-OPEN - testing Redis");
                });
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct = default) where T : class
    {
        if (_circuitBreaker.CircuitState == CircuitState.Open)
        {
            _logger.LogDebug("Cache GET skipped - circuit breaker open: {Key}", key);
            return null;
        }

        try
        {
            return await _circuitBreaker.ExecuteAsync(async () =>
            {
                var json = await _cache.GetStringAsync(key, ct);
                if (string.IsNullOrEmpty(json))
                    return null;

                _logger.LogDebug("Cache HIT: {Key}", key);
                return JsonSerializer.Deserialize<T>(json, JsonOptions);
            });
        }
        catch (BrokenCircuitException)
        {
            _logger.LogDebug("Cache GET failed - circuit open: {Key}", key);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cache GET failed: {Key}", key);
            return null;
        }
    }

    public async Task<bool> SetAsync<T>(string key, T value, CacheLifeTime lifetime, CancellationToken ct = default) where T : class
    {
        if (_circuitBreaker.CircuitState == CircuitState.Open)
        {
            _logger.LogDebug("Cache SET skipped - circuit breaker open: {Key}", key);
            return false;
        }

        try
        {
            return await _circuitBreaker.ExecuteAsync(async () =>
            {
                var json = JsonSerializer.Serialize(value, JsonOptions);

                // SECURITY: Prevent caching excessively large payloads
                if (json.Length > _maxPayloadSize)
                {
                    _logger.LogWarning(
                        "Cache SET rejected - payload too large: {Key} ({Size} bytes > {Max} bytes)",
                        key, json.Length, _maxPayloadSize);
                    return false;
                }

                await _cache.SetStringAsync(key, json, _options.WithLifeTime(lifetime), ct);
                _logger.LogDebug("Cache SET: {Key} ({Size} bytes, TTL: {Lifetime})",
                    key, json.Length, (TimeSpan)lifetime);
                return true;
            });
        }
        catch (BrokenCircuitException)
        {
            _logger.LogDebug("Cache SET failed - circuit open: {Key}", key);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cache SET failed: {Key}", key);
            return false;
        }
    }

    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        if (_circuitBreaker.CircuitState == CircuitState.Open)
            return;

        try
        {
            await _circuitBreaker.ExecuteAsync(async () =>
            {
                await _cache.RemoveAsync(key, ct);
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cache REMOVE failed: {Key}", key);
        }
    }

    public async Task RemoveMultipleAsync(IEnumerable<string> keys, CancellationToken ct = default)
    {
        // Remove all keys - don't stop on individual failures
        var tasks = keys.Select(k => RemoveAsync(k, ct));
        await Task.WhenAll(tasks);
    }
}
```

### 0.5 Register Cache Services

**File:** `backend/FamilyTreeApi/Program.cs`

Add after existing service registrations:
```csharp
// Cache infrastructure
services.AddSingleton<ICacheOptionsProvider, CacheOptionsProvider>();
services.AddSingleton<IResilientCacheService, ResilientCacheService>();
services.AddScoped<ITreeCacheService, TreeCacheService>();
```

---

## Phase 1: Tree Cache Service

### 1.1 Create Tree Cache Service Interface

**File to create:** `backend/FamilyTreeApi/Services/Caching/ITreeCacheService.cs`

```csharp
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services.Caching;

public interface ITreeCacheService
{
    // Get cached tree data (OrgId for authorization validation)
    Task<TreePersonNode?> GetPedigreeAsync(Guid personId, int generations, Guid orgId, CancellationToken ct = default);
    Task<TreePersonNode?> GetDescendantsAsync(Guid personId, int generations, Guid orgId, CancellationToken ct = default);
    Task<TreePersonNode?> GetHourglassAsync(Guid personId, int ancestorGen, int descendantGen, Guid orgId, CancellationToken ct = default);
    Task<RelationshipPathResponse?> GetRelationshipPathAsync(Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default);

    // Set cached tree data
    Task SetPedigreeAsync(Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default);
    Task SetDescendantsAsync(Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default);
    Task SetHourglassAsync(Guid personId, int ancestorGen, int descendantGen, Guid orgId, TreePersonNode data, CancellationToken ct = default);
    Task SetRelationshipPathAsync(Guid person1Id, Guid person2Id, Guid orgId, RelationshipPathResponse data, CancellationToken ct = default);

    // Invalidation - complete invalidation for a person
    Task InvalidatePersonAsync(Guid personId, Guid orgId, CancellationToken ct = default);
    Task InvalidateRelationshipPathAsync(Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default);
}
```

### 1.2 Create Tree Cache Service Implementation

**File to create:** `backend/FamilyTreeApi/Services/Caching/TreeCacheService.cs`

```csharp
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services.Caching;

/// <summary>
/// Tree-specific caching service.
/// Uses ResilientCacheService for circuit breaker and error handling.
/// All operations include OrgId for multi-tenant security.
/// </summary>
public class TreeCacheService : ITreeCacheService
{
    private readonly IResilientCacheService _cache;
    private readonly ILogger<TreeCacheService> _logger;

    public TreeCacheService(
        IResilientCacheService cache,
        ILogger<TreeCacheService> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    // =========================================================================
    // GET METHODS
    // =========================================================================

    public Task<TreePersonNode?> GetPedigreeAsync(
        Guid personId, int generations, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<TreePersonNode>(
            CacheKeyBuilder.Pedigree(personId, generations, orgId), ct);

    public Task<TreePersonNode?> GetDescendantsAsync(
        Guid personId, int generations, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<TreePersonNode>(
            CacheKeyBuilder.Descendants(personId, generations, orgId), ct);

    public Task<TreePersonNode?> GetHourglassAsync(
        Guid personId, int ancestorGen, int descendantGen, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<TreePersonNode>(
            CacheKeyBuilder.Hourglass(personId, ancestorGen, descendantGen, orgId), ct);

    public Task<RelationshipPathResponse?> GetRelationshipPathAsync(
        Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default)
        => _cache.GetAsync<RelationshipPathResponse>(
            CacheKeyBuilder.RelationshipPath(person1Id, person2Id, orgId), ct);

    // =========================================================================
    // SET METHODS
    // =========================================================================

    public Task SetPedigreeAsync(
        Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.Pedigree(personId, generations, orgId),
            data,
            CacheLifeTime.VeryLong, // 24 hours
            ct);

    public Task SetDescendantsAsync(
        Guid personId, int generations, Guid orgId, TreePersonNode data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.Descendants(personId, generations, orgId),
            data,
            CacheLifeTime.Long, // 6 hours
            ct);

    public Task SetHourglassAsync(
        Guid personId, int ancestorGen, int descendantGen, Guid orgId, TreePersonNode data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.Hourglass(personId, ancestorGen, descendantGen, orgId),
            data,
            CacheLifeTime.Long, // 6 hours
            ct);

    public Task SetRelationshipPathAsync(
        Guid person1Id, Guid person2Id, Guid orgId, RelationshipPathResponse data, CancellationToken ct = default)
        => _cache.SetAsync(
            CacheKeyBuilder.RelationshipPath(person1Id, person2Id, orgId),
            data,
            CacheLifeTime.Long, // 6 hours
            ct);

    // =========================================================================
    // INVALIDATION METHODS - Complete invalidation for all generation variants
    // =========================================================================

    /// <summary>
    /// Invalidate ALL cache entries for a person across all generation variants.
    /// CRITICAL: Must invalidate all possible cached combinations to prevent stale data.
    /// </summary>
    public async Task InvalidatePersonAsync(Guid personId, Guid orgId, CancellationToken ct = default)
    {
        _logger.LogInformation("Invalidating all cache entries for person {PersonId} in org {OrgId}",
            personId, orgId);

        // Collect all keys to invalidate
        var keysToInvalidate = new List<string>();

        // All pedigree variants (generations 1-10)
        keysToInvalidate.AddRange(CacheKeyBuilder.AllPedigreeVariants(personId, orgId));

        // All descendants variants (generations 1-10)
        keysToInvalidate.AddRange(CacheKeyBuilder.AllDescendantsVariants(personId, orgId));

        // All hourglass variants (10x10 = 100 combinations)
        keysToInvalidate.AddRange(CacheKeyBuilder.AllHourglassVariants(personId, orgId));

        // Family group
        keysToInvalidate.Add(CacheKeyBuilder.FamilyGroup(personId, orgId));

        _logger.LogDebug("Invalidating {Count} cache keys for person {PersonId}",
            keysToInvalidate.Count, personId);

        // Remove all keys in parallel
        await _cache.RemoveMultipleAsync(keysToInvalidate, ct);
    }

    public Task InvalidateRelationshipPathAsync(
        Guid person1Id, Guid person2Id, Guid orgId, CancellationToken ct = default)
        => _cache.RemoveAsync(
            CacheKeyBuilder.RelationshipPath(person1Id, person2Id, orgId), ct);
}
```

---

## Phase 2: Integrate Cache into TreeViewService

### 2.1 Update TreeViewService

**File:** `backend/FamilyTreeApi/Services/TreeViewService.cs`

Add injection:
```csharp
private readonly ITreeCacheService _cache;

public TreeViewService(
    // ... existing parameters ...
    ITreeCacheService cache,
    ILogger<TreeViewService> logger)
{
    // ... existing assignments ...
    _cache = cache;
    _logger = logger;
}
```

Update GetPedigreeAsync:
```csharp
public async Task<ServiceResult<TreePersonNode>> GetPedigreeAsync(
    GetTreeViewRequest request,
    UserContext userContext,
    CancellationToken ct = default)
{
    // SECURITY: OrgId from authenticated context, not request
    var orgId = userContext.OrgId;

    // Try cache first
    var cached = await _cache.GetPedigreeAsync(request.PersonId, request.Generations, orgId, ct);
    if (cached != null)
    {
        _logger.LogDebug("Pedigree cache HIT for person {PersonId}, org {OrgId}",
            request.PersonId, orgId);
        return ServiceResult<TreePersonNode>.Success(cached);
    }

    _logger.LogDebug("Pedigree cache MISS for person {PersonId}, org {OrgId}",
        request.PersonId, orgId);

    // Build tree from database
    var result = await BuildPedigreeFromDatabase(request, userContext, ct);

    // Cache successful results
    if (result.IsSuccess && result.Data != null)
    {
        await _cache.SetPedigreeAsync(request.PersonId, request.Generations, orgId, result.Data, ct);
    }

    return result;
}
```

Apply same pattern to:
- `GetDescendantsAsync`
- `GetHourglassAsync`
- `FindRelationshipPathAsync`

---

## Phase 3: Cache Invalidation on Data Changes

### 3.1 Update PersonService for Invalidation

**File:** `backend/FamilyTreeApi/Services/PersonService.cs`

```csharp
private readonly ITreeCacheService _treeCache;

public PersonService(
    // ... existing parameters ...
    ITreeCacheService treeCache)
{
    _treeCache = treeCache;
}

public async Task<ServiceResult<PersonDto>> UpdateAsync(
    Guid id, UpdatePersonRequest request, UserContext userContext, CancellationToken ct = default)
{
    // ... existing update logic ...

    // Invalidate cache after successful update
    if (result.IsSuccess)
    {
        await _treeCache.InvalidatePersonAsync(id, userContext.OrgId, ct);

        // Also invalidate parent/child caches if they exist
        // (person appears in their trees)
    }

    return result;
}

public async Task<ServiceResult<bool>> DeleteAsync(
    Guid id, UserContext userContext, CancellationToken ct = default)
{
    // ... existing delete logic ...

    if (result.IsSuccess)
    {
        await _treeCache.InvalidatePersonAsync(id, userContext.OrgId, ct);
    }

    return result;
}
```

### 3.2 Update ParentChildService for Invalidation

When parent-child relationships change:
```csharp
public async Task<ServiceResult<bool>> AddParentAsync(
    Guid childId, Guid parentId, UserContext userContext, CancellationToken ct = default)
{
    // ... existing logic ...

    if (result.IsSuccess)
    {
        // Invalidate both parent and child trees
        await _treeCache.InvalidatePersonAsync(parentId, userContext.OrgId, ct);
        await _treeCache.InvalidatePersonAsync(childId, userContext.OrgId, ct);
    }

    return result;
}
```

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `Services/Caching/ICacheOptionsProvider.cs` | Interface + CacheLifeTime struct |
| `Services/Caching/CacheOptionsProvider.cs` | Thread-safe options pooling |
| `Services/Caching/CacheKeyBuilder.cs` | Secure key generation with GUID normalization |
| `Services/Caching/ResilientCacheService.cs` | Circuit breaker + size limits (includes interface) |
| `Services/Caching/ITreeCacheService.cs` | Tree cache interface |
| `Services/Caching/TreeCacheService.cs` | Tree cache with complete invalidation |

### Files to Modify
| File | Changes |
|------|---------|
| `appsettings.json` | Enable Redis, add size/circuit breaker config |
| `Program.cs` | Register cache services |
| `Services/TreeViewService.cs` | Add cache get/set calls |
| `Services/PersonService.cs` | Add cache invalidation |
| `Services/ParentChildService.cs` | Add cache invalidation |

---

## Audit Fixes Applied

### Fixed: Authorization Bypass (Cross-Tenant Data Leakage)
- **Issue:** OrgId not in cache keys, could serve data to wrong tenant
- **Fix:** All cache keys include normalized OrgId
- **Fix:** OrgId comes from `userContext.OrgId`, not request

### Fixed: Thread-Safety (ConcurrentDictionary)
- **Issue:** Singleton `CacheOptionsProvider` used non-thread-safe Dictionary
- **Fix:** Changed to `ConcurrentDictionary` with `GetOrAdd`

### Fixed: Incomplete Invalidation
- **Issue:** Only invalidated generations 3 and 4
- **Fix:** `InvalidatePersonAsync` now invalidates ALL generation variants (1-10)
- **Fix:** Added `AllPedigreeVariants`, `AllDescendantsVariants`, `AllHourglassVariants`

### Fixed: Payload Size Limits
- **Issue:** No size check before caching large trees
- **Fix:** `ResilientCacheService.SetAsync` checks against `MaxPayloadSizeBytes`

### Fixed: Circuit Breaker
- **Issue:** No resilience for Redis failures
- **Fix:** Polly circuit breaker in `ResilientCacheService`

### Fixed: GUID Normalization
- **Issue:** Different GUID formats could cause cache misses
- **Fix:** `NormalizeGuid()` converts to lowercase no-dash format

---

## Verification Checklist

### Security
- [ ] OrgId included in all cache keys
- [ ] OrgId comes from UserContext, not request
- [ ] Cross-tenant cache access prevented
- [ ] Large payloads rejected (>5MB)

### Resilience
- [ ] Circuit breaker opens after 5 failures
- [ ] Circuit breaker closes after 30 seconds
- [ ] App continues working when Redis is down

### Invalidation
- [ ] Person update invalidates all generation variants
- [ ] Parent-child change invalidates both persons
- [ ] Relationship path invalidation works

### Performance
- [ ] Second request serves from cache
- [ ] Cache hit logged at Debug level
- [ ] No memory growth issues
