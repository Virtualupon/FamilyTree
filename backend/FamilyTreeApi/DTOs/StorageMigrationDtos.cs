using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

/// <summary>
/// Request parameters for storage migration.
/// </summary>
public class MigrationRequest
{
    /// <summary>Filter to specific organization (null = all orgs)</summary>
    public Guid? OrgId { get; set; }

    /// <summary>Filter to specific media kind (null = all kinds)</summary>
    public MediaKind? MediaKind { get; set; }

    /// <summary>Preview changes without executing (default: true for safety)</summary>
    public bool DryRun { get; set; } = true;

    /// <summary>Apply new descriptive naming scheme (default: true)</summary>
    public bool RenameFiles { get; set; } = true;

    /// <summary>Delete local files after successful migration (default: false)</summary>
    public bool DeleteLocalAfter { get; set; } = false;

    /// <summary>Number of files to process per batch (1-100, default: 50)</summary>
    public int BatchSize { get; set; } = 50;

    /// <summary>Maximum files to migrate (0 = unlimited)</summary>
    public int MaxFiles { get; set; } = 0;

    /// <summary>Maximum concurrent uploads (1-10, default: 5)</summary>
    public int MaxConcurrency { get; set; } = 5;
}

/// <summary>
/// Thread-safe progress tracking for migration operation.
/// Uses Interlocked operations for counter updates.
/// </summary>
public class MigrationProgress
{
    private int _totalFiles;
    private int _processedFiles;
    private int _successCount;
    private int _failedCount;
    private int _skippedCount;
    private long _totalBytesTransferred;
    private int _resultOverflowCount;
    private string? _currentFile;

    // Thread-safe counter properties
    public int TotalFiles
    {
        get => Volatile.Read(ref _totalFiles);
        set => Volatile.Write(ref _totalFiles, value);
    }

    public int ProcessedFiles => Volatile.Read(ref _processedFiles);
    public int SuccessCount => Volatile.Read(ref _successCount);
    public int FailedCount => Volatile.Read(ref _failedCount);
    public int SkippedCount => Volatile.Read(ref _skippedCount);
    public long TotalBytesTransferred => Volatile.Read(ref _totalBytesTransferred);
    public int ResultOverflowCount => Volatile.Read(ref _resultOverflowCount);

    public string? CurrentFile
    {
        get => Volatile.Read(ref _currentFile);
        set => Volatile.Write(ref _currentFile, value);
    }

    // Thread-safe increment methods
    public void IncrementProcessed() => Interlocked.Increment(ref _processedFiles);
    public void IncrementSuccess() => Interlocked.Increment(ref _successCount);
    public void IncrementFailed() => Interlocked.Increment(ref _failedCount);
    public void IncrementSkipped() => Interlocked.Increment(ref _skippedCount);
    public void AddBytesTransferred(long bytes) => Interlocked.Add(ref _totalBytesTransferred, bytes);
    public void IncrementResultOverflow() => Interlocked.Increment(ref _resultOverflowCount);

    // Cap FileResults to prevent memory exhaustion
    public const int MaxFileResults = 1000;
    private readonly object _resultsLock = new();
    private readonly List<MigrationFileResult> _fileResults = new();
    public IReadOnlyList<MigrationFileResult> FileResults
    {
        get { lock (_resultsLock) { return _fileResults.ToList(); } }
    }

    public void AddFileResult(MigrationFileResult result)
    {
        lock (_resultsLock)
        {
            if (_fileResults.Count < MaxFileResults)
                _fileResults.Add(result);
            else
                IncrementResultOverflow();
        }
    }

    private readonly object _errorsLock = new();
    private readonly List<MigrationError> _errors = new();
    public IReadOnlyList<MigrationError> Errors
    {
        get { lock (_errorsLock) { return _errors.ToList(); } }
    }

    public void AddError(MigrationError error)
    {
        lock (_errorsLock)
        {
            // Keep last 100 errors
            if (_errors.Count >= 100)
                _errors.RemoveAt(0);
            _errors.Add(error);
        }
    }

    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public bool IsComplete => CompletedAt.HasValue;
    public bool IsRunning => StartedAt != default && !CompletedAt.HasValue;
    public double ProgressPercent => TotalFiles > 0 ? (ProcessedFiles * 100.0 / TotalFiles) : 0;
    public TimeSpan? Duration => CompletedAt.HasValue
        ? CompletedAt.Value - StartedAt
        : (StartedAt != default ? DateTime.UtcNow - StartedAt : null);
}

/// <summary>
/// Result for a single migrated file.
/// </summary>
public class MigrationFileResult
{
    public Guid MediaId { get; set; }
    public string OldPath { get; set; } = string.Empty;
    public string NewPath { get; set; } = string.Empty;
    public long FileSize { get; set; }
}

/// <summary>
/// Error information for a failed migration.
/// </summary>
public class MigrationError
{
    public Guid MediaId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string OldPath { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Overall migration result.
/// </summary>
public class MigrationResult
{
    public bool Success { get; set; }
    public MigrationProgress Progress { get; set; } = new();
    public string Message { get; set; } = string.Empty;
}

/// <summary>
/// Summary of pending migrations.
/// </summary>
public class MigrationPendingCount
{
    public int TotalLocalFiles { get; set; }
    public long TotalBytes { get; set; }
    public Dictionary<string, int> ByMediaKind { get; set; } = new();
    public Dictionary<Guid, int> ByOrg { get; set; } = new();
}

/// <summary>
/// Consistent response type for status endpoint.
/// </summary>
public class MigrationStatusResponse
{
    public bool IsRunning { get; set; }
    public string Message { get; set; } = string.Empty;
    public MigrationProgress? Progress { get; set; }
}
