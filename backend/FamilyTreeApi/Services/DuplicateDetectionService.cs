#nullable enable
using System;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs.DuplicateDetection;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service for detecting and resolving duplicate person records.
/// Implements access control, scanning, and merge operations.
/// </summary>
public class DuplicateDetectionService : IDuplicateDetectionService
{
    private readonly ApplicationDbContext _context;
    private readonly IDuplicateDetectionRepository _repository;
    private readonly ILogger<DuplicateDetectionService> _logger;

    public DuplicateDetectionService(
        ApplicationDbContext context,
        IDuplicateDetectionRepository repository,
        ILogger<DuplicateDetectionService> logger)
    {
        _context = context;
        _repository = repository;
        _logger = logger;
    }

    // ========================================================================
    // SCAN
    // ========================================================================

    public async Task<ServiceResult<DuplicateScanResult>> ScanAsync(
        DuplicateScanRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Validate access
        var accessResult = await ValidateScanAccessAsync(request.TreeId, request.TargetTreeId, userContext, cancellationToken);
        if (!accessResult.IsSuccess)
            return ServiceResult<DuplicateScanResult>.Failure(accessResult.ErrorMessage!, accessResult.ErrorType);

        try
        {
            var result = await _repository.DetectCandidatesAsync(
                request.TreeId,
                request.TargetTreeId,
                request.Mode,
                request.MinConfidence,
                request.Page,
                request.PageSize,
                cancellationToken);

            return ServiceResult<DuplicateScanResult>.Success(result);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Invalid scan request");
            return ServiceResult<DuplicateScanResult>.Failure(ex.Message, ServiceErrorType.BadRequest);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error scanning for duplicates");
            return ServiceResult<DuplicateScanResult>.InternalError("Failed to scan for duplicates");
        }
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================

    public async Task<ServiceResult<DuplicateSummaryResult>> GetSummaryAsync(
        Guid? treeId,
        Guid? targetTreeId,
        string mode,
        int minConfidence,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Validate access
        var accessResult = await ValidateScanAccessAsync(treeId, targetTreeId, userContext, cancellationToken);
        if (!accessResult.IsSuccess)
            return ServiceResult<DuplicateSummaryResult>.Failure(accessResult.ErrorMessage!, accessResult.ErrorType);

        try
        {
            var summaryItems = await _repository.GetSummaryAsync(
                treeId,
                targetTreeId,
                mode,
                minConfidence,
                cancellationToken);

            // Get tree name if specified
            string? treeName = null;
            if (treeId.HasValue)
            {
                var tree = await _context.Orgs.FindAsync(new object[] { treeId.Value }, cancellationToken);
                treeName = tree?.Name;
            }

            var result = new DuplicateSummaryResult
            {
                TreeId = treeId,
                TreeName = treeName,
                TotalCandidates = summaryItems.Sum(s => s.CandidateCount),
                ByMatchType = summaryItems
            };

            return ServiceResult<DuplicateSummaryResult>.Success(result);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Invalid summary request");
            return ServiceResult<DuplicateSummaryResult>.Failure(ex.Message, ServiceErrorType.BadRequest);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting duplicate summary");
            return ServiceResult<DuplicateSummaryResult>.InternalError("Failed to get duplicate summary");
        }
    }

    // ========================================================================
    // RESOLVE
    // ========================================================================

    public async Task<ServiceResult> ResolveAsync(
        Guid personAId,
        Guid personBId,
        DuplicateResolveRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Validate both persons exist
        var personA = await _context.People.FindAsync(new object[] { personAId }, cancellationToken);
        var personB = await _context.People.FindAsync(new object[] { personBId }, cancellationToken);

        if (personA == null || personB == null)
            return ServiceResult.NotFound("One or both persons not found");

        if (personA.IsDeleted || personB.IsDeleted)
            return ServiceResult.Failure("Cannot resolve deleted persons", ServiceErrorType.BadRequest);

        // Validate access to both persons' trees
        var accessResultA = await ValidateScanAccessAsync(personA.OrgId, null, userContext, cancellationToken);
        if (!accessResultA.IsSuccess)
            return accessResultA;

        if (personA.OrgId != personB.OrgId)
        {
            var accessResultB = await ValidateScanAccessAsync(personB.OrgId, null, userContext, cancellationToken);
            if (!accessResultB.IsSuccess)
                return accessResultB;
        }

        return request.Action.ToLowerInvariant() switch
        {
            "approve_link" => await ApproveLinkAsync(personA, personB, request.Notes, userContext, cancellationToken),
            "reject" => await RejectAsync(personA, personB, request.Notes, userContext, cancellationToken),
            "merge" => await MergeAsync(personA, personB, request.KeepPersonId, request.Notes, userContext, cancellationToken),
            _ => ServiceResult.Failure($"Invalid action: {request.Action}. Must be 'approve_link', 'reject', or 'merge'", ServiceErrorType.BadRequest)
        };
    }

    // ========================================================================
    // APPROVE LINK
    // ========================================================================

    private async Task<ServiceResult> ApproveLinkAsync(
        Person personA,
        Person personB,
        string? notes,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // Check if link already exists
        var existingLink = await _context.Set<PersonLink>()
            .FirstOrDefaultAsync(pl =>
                (pl.SourcePersonId == personA.Id && pl.TargetPersonId == personB.Id) ||
                (pl.SourcePersonId == personB.Id && pl.TargetPersonId == personA.Id),
                cancellationToken);

        if (existingLink != null)
            return ServiceResult.Failure("A link already exists between these persons", ServiceErrorType.BadRequest);

        var link = new PersonLink
        {
            SourcePersonId = personA.Id,
            TargetPersonId = personB.Id,
            LinkType = PersonLinkType.SamePerson,
            Status = PersonLinkStatus.Approved,
            Confidence = 100,
            CreatedByUserId = userContext.UserId,
            ApprovedByUserId = userContext.UserId
        };

        _context.Set<PersonLink>().Add(link);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Created approved PersonLink between {PersonAId} and {PersonBId}", personA.Id, personB.Id);
            return ServiceResult.Success();
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            _logger.LogWarning("Race condition: Link already exists between {PersonAId} and {PersonBId}", personA.Id, personB.Id);
            return ServiceResult.Failure("A link already exists between these persons", ServiceErrorType.BadRequest);
        }
    }

    // ========================================================================
    // REJECT
    // ========================================================================

    private async Task<ServiceResult> RejectAsync(
        Person personA,
        Person personB,
        string? notes,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // Check if link already exists
        var existingLink = await _context.Set<PersonLink>()
            .FirstOrDefaultAsync(pl =>
                (pl.SourcePersonId == personA.Id && pl.TargetPersonId == personB.Id) ||
                (pl.SourcePersonId == personB.Id && pl.TargetPersonId == personA.Id),
                cancellationToken);

        if (existingLink != null)
            return ServiceResult.Failure("A link already exists between these persons", ServiceErrorType.BadRequest);

        var link = new PersonLink
        {
            SourcePersonId = personA.Id,
            TargetPersonId = personB.Id,
            LinkType = PersonLinkType.SamePerson,
            Status = PersonLinkStatus.Rejected,
            Confidence = 0,
            CreatedByUserId = userContext.UserId,
            ApprovedByUserId = userContext.UserId
        };

        _context.Set<PersonLink>().Add(link);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Created rejected PersonLink between {PersonAId} and {PersonBId}", personA.Id, personB.Id);
            return ServiceResult.Success();
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            _logger.LogWarning("Race condition: Link already exists between {PersonAId} and {PersonBId}", personA.Id, personB.Id);
            return ServiceResult.Failure("A link already exists between these persons", ServiceErrorType.BadRequest);
        }
    }

    // ========================================================================
    // MERGE
    // ========================================================================

    private async Task<ServiceResult> MergeAsync(
        Person personA,
        Person personB,
        Guid? keepPersonId,
        string? notes,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        if (!keepPersonId.HasValue)
            return ServiceResult.Failure("keepPersonId is required for merge action", ServiceErrorType.BadRequest);

        if (keepPersonId.Value != personA.Id && keepPersonId.Value != personB.Id)
            return ServiceResult.Failure("keepPersonId must be one of the two persons being merged", ServiceErrorType.BadRequest);

        var keep = keepPersonId.Value == personA.Id ? personA : personB;
        var remove = keepPersonId.Value == personA.Id ? personB : personA;

        // [C2] Wrap in transaction
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);

        try
        {
            // Step 1: Transfer non-null data from remove to keep
            TransferPersonData(keep, remove);
            keep.NeedsReview = true;
            keep.UpdatedAt = DateTime.UtcNow;

            // Step 2: Re-point ParentChildren
            var parentChildrenAsParent = await _context.Set<ParentChild>()
                .Where(pc => pc.ParentId == remove.Id && !pc.IsDeleted)
                .ToListAsync(cancellationToken);

            var parentChildrenAsChild = await _context.Set<ParentChild>()
                .Where(pc => pc.ChildId == remove.Id && !pc.IsDeleted)
                .ToListAsync(cancellationToken);

            foreach (var pc in parentChildrenAsParent)
            {
                // Check if keep already has this relationship
                var exists = await _context.Set<ParentChild>()
                    .AnyAsync(x => x.ParentId == keep.Id && x.ChildId == pc.ChildId && !x.IsDeleted, cancellationToken);
                if (!exists)
                {
                    pc.ParentId = keep.Id;
                }
                else
                {
                    pc.IsDeleted = true;
                    pc.DeletedAt = DateTime.UtcNow;
                }
            }

            foreach (var pc in parentChildrenAsChild)
            {
                // [C5] Use else if - don't process same row twice
                // Check if keep already has this relationship
                var exists = await _context.Set<ParentChild>()
                    .AnyAsync(x => x.ParentId == pc.ParentId && x.ChildId == keep.Id && !x.IsDeleted, cancellationToken);
                if (!exists)
                {
                    pc.ChildId = keep.Id;
                }
                else
                {
                    pc.IsDeleted = true;
                    pc.DeletedAt = DateTime.UtcNow;
                }
            }

            // Step 3: Re-point UnionMembers
            var unionMembers = await _context.Set<UnionMember>()
                .Where(um => um.PersonId == remove.Id)
                .ToListAsync(cancellationToken);

            foreach (var um in unionMembers)
            {
                var exists = await _context.Set<UnionMember>()
                    .AnyAsync(x => x.UnionId == um.UnionId && x.PersonId == keep.Id, cancellationToken);
                if (!exists)
                {
                    um.PersonId = keep.Id;
                }
                else
                {
                    _context.Set<UnionMember>().Remove(um);
                }
            }

            // Step 4: Re-point PersonMedia
            var personMedia = await _context.Set<PersonMedia>()
                .Where(pm => pm.PersonId == remove.Id)
                .ToListAsync(cancellationToken);

            foreach (var pm in personMedia)
            {
                var exists = await _context.Set<PersonMedia>()
                    .AnyAsync(x => x.PersonId == keep.Id && x.MediaId == pm.MediaId, cancellationToken);
                if (!exists)
                {
                    pm.PersonId = keep.Id;
                }
                else
                {
                    _context.Set<PersonMedia>().Remove(pm);
                }
            }

            // Step 5: Soft-delete removed person
            remove.IsDeleted = true;
            remove.DeletedAt = DateTime.UtcNow;
            remove.DeletedByUserId = userContext.UserId;

            // Step 6: Create audit PersonLink
            var auditLink = new PersonLink
            {
                SourcePersonId = keep.Id,
                TargetPersonId = remove.Id,
                LinkType = PersonLinkType.SamePerson,
                Status = PersonLinkStatus.Approved,
                Confidence = 100,
                CreatedByUserId = userContext.UserId,
                ApprovedByUserId = userContext.UserId
            };
            _context.Set<PersonLink>().Add(auditLink);

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            _logger.LogInformation("Merged person {RemovedId} into {KeptId}", remove.Id, keep.Id);
            return ServiceResult.Success();
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogWarning("Race condition during merge of {PersonAId} and {PersonBId}", personA.Id, personB.Id);
            return ServiceResult.Failure("A conflict occurred during merge. Please try again.", ServiceErrorType.BadRequest);
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogError(ex, "Error merging persons {PersonAId} and {PersonBId}", personA.Id, personB.Id);
            return ServiceResult.InternalError("Failed to merge persons");
        }
    }

    private static void TransferPersonData(Person keep, Person remove)
    {
        // Transfer non-null fields from remove to keep (only if keep's field is null)
        keep.PrimaryName ??= remove.PrimaryName;
        keep.NameArabic ??= remove.NameArabic;
        keep.NameEnglish ??= remove.NameEnglish;
        keep.NameNobiin ??= remove.NameNobiin;
        keep.BirthDate ??= remove.BirthDate;
        keep.BirthPlaceId ??= remove.BirthPlaceId;
        keep.DeathDate ??= remove.DeathDate;
        keep.DeathPlaceId ??= remove.DeathPlaceId;
        keep.Occupation ??= remove.Occupation;
        keep.Education ??= remove.Education;
        keep.Religion ??= remove.Religion;
        keep.Nationality ??= remove.Nationality;
        keep.Ethnicity ??= remove.Ethnicity;
        keep.AvatarMediaId ??= remove.AvatarMediaId;

        // Notes are now stored in EntityNotes table - no inline notes to transfer
    }

    // ========================================================================
    // ACCESS CONTROL
    // ========================================================================

    private async Task<ServiceResult> ValidateScanAccessAsync(
        Guid? treeId,
        Guid? targetTreeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // Only Developer, SuperAdmin, and Admin can use duplicate detection
        if (!userContext.HasAdminOrHigherAccess)
            return ServiceResult.Forbidden("Duplicate detection requires Admin or SuperAdmin role");

        // [M6] Admin must specify a tree (Developer and SuperAdmin can scan globally)
        if (userContext.IsAdmin && !userContext.IsSuperAdmin && !userContext.IsDeveloper && !treeId.HasValue)
            return ServiceResult.Failure("Admin must specify a tree to scan", ServiceErrorType.BadRequest);

        // [C3] targetTreeId requires treeId
        if (targetTreeId.HasValue && !treeId.HasValue)
            return ServiceResult.Failure("treeId is required when targetTreeId is specified", ServiceErrorType.BadRequest);

        // Developer and SuperAdmin can access any tree
        if (userContext.IsSuperAdmin || userContext.IsDeveloper)
            return ServiceResult.Success();

        // Admin: validate tree access
        if (treeId.HasValue)
        {
            var hasAccess = await HasAdminAccessToTreeAsync(userContext.UserId, treeId.Value, cancellationToken);
            if (!hasAccess)
                return ServiceResult.Forbidden("You don't have admin access to this tree");
        }

        if (targetTreeId.HasValue && targetTreeId.Value != treeId)
        {
            var hasAccess = await HasAdminAccessToTreeAsync(userContext.UserId, targetTreeId.Value, cancellationToken);
            if (!hasAccess)
                return ServiceResult.Forbidden("You don't have admin access to the target tree");
        }

        return ServiceResult.Success();
    }

    private async Task<bool> HasAdminAccessToTreeAsync(long userId, Guid treeId, CancellationToken cancellationToken)
    {
        // Check AdminTreeAssignment
        var hasAssignment = await _context.Set<AdminTreeAssignment>()
            .AnyAsync(a => a.UserId == userId && a.TreeId == treeId, cancellationToken);

        if (hasAssignment)
            return true;

        // Check OrgUsers with Admin/Owner role
        var hasOrgRole = await _context.OrgUsers
            .AnyAsync(ou =>
                ou.OrgId == treeId &&
                ou.UserId == userId &&
                (ou.Role == OrgRole.Owner || ou.Role == OrgRole.Admin),
                cancellationToken);

        return hasOrgRole;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    /// <summary>
    /// Check if exception is a PostgreSQL unique constraint violation (23505)
    /// </summary>
    private static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        if (ex.InnerException is PostgresException pgEx)
        {
            return pgEx.SqlState == "23505";
        }
        return false;
    }
}
