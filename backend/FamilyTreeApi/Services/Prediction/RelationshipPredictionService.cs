using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.DTOs.Prediction;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Services.Prediction.Rules;

namespace FamilyTreeApi.Services.Prediction;

public class RelationshipPredictionService : IRelationshipPredictionService
{
    private readonly ApplicationDbContext _context;
    private readonly IEnumerable<IPredictionRule> _rules;
    private readonly ILogger<RelationshipPredictionService> _logger;

    public RelationshipPredictionService(
        ApplicationDbContext context,
        IEnumerable<IPredictionRule> rules,
        ILogger<RelationshipPredictionService> logger)
    {
        _context = context;
        _rules = rules;
        _logger = logger;
    }

    public async Task<ServiceResult<PredictionScanResult>> ScanTreeAsync(
        Guid treeId, UserContext userContext, CancellationToken ct = default)
    {
        if (!HasAdminAccess(userContext))
            return ServiceResult<PredictionScanResult>.Forbidden();

        // Verify tree exists
        var treeExists = await _context.Orgs.AnyAsync(o => o.Id == treeId, ct);
        if (!treeExists)
            return ServiceResult<PredictionScanResult>.NotFound("Tree not found");

        var scanBatchId = Guid.NewGuid();
        _logger.LogInformation("Starting prediction scan for tree {TreeId}, batch {BatchId}",
            treeId, scanBatchId);

        // Run all prediction rules
        var allCandidates = new List<PredictionCandidate>();

        foreach (var rule in _rules)
        {
            try
            {
                _logger.LogInformation("Running rule {RuleId} for tree {TreeId}", rule.RuleId, treeId);
                var ruleCandidates = await rule.DetectAsync(treeId, ct);
                _logger.LogInformation("Rule {RuleId} found {Count} candidates", rule.RuleId, ruleCandidates.Count);
                allCandidates.AddRange(ruleCandidates);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error running prediction rule {RuleId} for tree {TreeId}",
                    rule.RuleId, treeId);
                // Continue with other rules
            }
        }

        // Aggregate candidates (merge multi-rule matches using Noisy-OR)
        var aggregated = ConfidenceAggregator.AggregateCandidates(allCandidates);

        // Remove stale predictions for this tree (those that are still New from previous scans)
        var stalePredictions = await _context.PredictedRelationships
            .Where(p => p.TreeId == treeId && p.Status == PredictionStatus.New)
            .ToListAsync(ct);
        _context.PredictedRelationships.RemoveRange(stalePredictions);

        // Save new predictions
        var newPredictions = new List<PredictedRelationship>();
        foreach (var candidate in aggregated)
        {
            var confidenceLevel = ConfidenceAggregator.GetConfidenceLevel(candidate.Confidence);

            var prediction = new PredictedRelationship
            {
                Id = Guid.NewGuid(),
                TreeId = treeId,
                RuleId = candidate.RuleId,
                PredictedType = candidate.PredictedType,
                SourcePersonId = candidate.SourcePersonId,
                TargetPersonId = candidate.TargetPersonId,
                Confidence = candidate.Confidence,
                ConfidenceLevel = confidenceLevel,
                Explanation = candidate.Explanation,
                Status = PredictionStatus.New,
                CreatedAt = DateTime.UtcNow,
                ScanBatchId = scanBatchId
            };

            newPredictions.Add(prediction);
        }

        // Use upsert logic: skip duplicates (unique constraint on TreeId, Source, Target, Type)
        foreach (var prediction in newPredictions)
        {
            var existing = await _context.PredictedRelationships
                .FirstOrDefaultAsync(p =>
                    p.TreeId == prediction.TreeId
                    && p.SourcePersonId == prediction.SourcePersonId
                    && p.TargetPersonId == prediction.TargetPersonId
                    && p.PredictedType == prediction.PredictedType
                    && p.Status != PredictionStatus.New, ct);

            if (existing != null)
            {
                // Already confirmed/dismissed/applied — skip
                continue;
            }

            _context.PredictedRelationships.Add(prediction);
        }

        try
        {
            await _context.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("unique") == true
            || ex.InnerException?.Message.Contains("duplicate") == true)
        {
            _logger.LogWarning(ex, "Duplicate prediction entries skipped during scan");
            // Some duplicates — partial save is OK
        }

        // Build result
        var savedPredictions = await _context.PredictedRelationships
            .Where(p => p.TreeId == treeId && p.ScanBatchId == scanBatchId && p.Status == PredictionStatus.New)
            .Include(p => p.SourcePerson)
            .Include(p => p.TargetPerson)
            .OrderByDescending(p => p.Confidence)
            .ToListAsync(ct);

        var predictionDtos = savedPredictions.Select(MapToDto).ToList();

        var result = new PredictionScanResult(
            ScanBatchId: scanBatchId,
            TotalPredictions: predictionDtos.Count,
            HighConfidence: predictionDtos.Count(p => p.ConfidenceLevel == "High"),
            MediumConfidence: predictionDtos.Count(p => p.ConfidenceLevel == "Medium"),
            LowConfidence: predictionDtos.Count(p => p.ConfidenceLevel == "Low"),
            Predictions: predictionDtos
        );

        _logger.LogInformation(
            "Prediction scan complete for tree {TreeId}: {Total} predictions ({High} high, {Medium} medium, {Low} low)",
            treeId, result.TotalPredictions, result.HighConfidence, result.MediumConfidence, result.LowConfidence);

        return ServiceResult<PredictionScanResult>.Success(result);
    }

    public async Task<ServiceResult<PagedResult<PredictionDto>>> GetPredictionsAsync(
        Guid treeId, PredictionFilterDto filter, UserContext userContext, CancellationToken ct = default)
    {
        if (!HasAdminAccess(userContext))
            return ServiceResult<PagedResult<PredictionDto>>.Forbidden();

        var query = _context.PredictedRelationships
            .Where(p => p.TreeId == treeId)
            .Include(p => p.SourcePerson)
            .Include(p => p.TargetPerson)
            .AsQueryable();

        // Apply filters
        if (!string.IsNullOrEmpty(filter.Status))
        {
            if (Enum.TryParse<PredictionStatus>(filter.Status, true, out var status))
                query = query.Where(p => p.Status == status);
        }
        if (!string.IsNullOrEmpty(filter.ConfidenceLevel))
            query = query.Where(p => p.ConfidenceLevel == filter.ConfidenceLevel);
        if (!string.IsNullOrEmpty(filter.RuleId))
            query = query.Where(p => p.RuleId == filter.RuleId);
        if (!string.IsNullOrEmpty(filter.PredictedType))
            query = query.Where(p => p.PredictedType == filter.PredictedType);

        var totalCount = await query.CountAsync(ct);
        var totalPages = (int)Math.Ceiling(totalCount / (double)filter.PageSize);

        var items = await query
            .OrderByDescending(p => p.Confidence)
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(ct);

        var dtos = items.Select(MapToDto).ToList();
        var result = new PagedResult<PredictionDto>(dtos, totalCount, filter.Page, filter.PageSize, totalPages);

        return ServiceResult<PagedResult<PredictionDto>>.Success(result);
    }

    public async Task<ServiceResult> AcceptPredictionAsync(
        Guid predictionId, UserContext userContext, CancellationToken ct = default)
    {
        if (!HasAdminAccess(userContext))
            return ServiceResult.Forbidden();

        var prediction = await _context.PredictedRelationships
            .FirstOrDefaultAsync(p => p.Id == predictionId, ct);

        if (prediction == null)
            return ServiceResult.NotFound("Prediction not found");

        if (prediction.Status != PredictionStatus.New)
            return ServiceResult.Failure($"Prediction is already {prediction.Status}");

        // Create the actual relationship
        try
        {
            if (prediction.PredictedType == "parent_child")
            {
                var parentChild = new ParentChild
                {
                    Id = Guid.NewGuid(),
                    ParentId = prediction.SourcePersonId,
                    ChildId = prediction.TargetPersonId,
                    RelationshipType = Models.Enums.RelationshipType.Biological,
                    CreatedAt = DateTime.UtcNow
                };

                _context.ParentChildren.Add(parentChild);
                prediction.AppliedEntityType = "ParentChild";
                prediction.AppliedEntityId = parentChild.Id;
            }
            else if (prediction.PredictedType == "union")
            {
                var union = new Union
                {
                    Id = Guid.NewGuid(),
                    OrgId = prediction.TreeId,
                    Type = Models.Enums.UnionType.Marriage,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _context.Unions.Add(union);

                _context.UnionMembers.Add(new UnionMember
                {
                    Id = Guid.NewGuid(),
                    UnionId = union.Id,
                    PersonId = prediction.SourcePersonId,
                    Role = "Partner",
                    CreatedAt = DateTime.UtcNow
                });
                _context.UnionMembers.Add(new UnionMember
                {
                    Id = Guid.NewGuid(),
                    UnionId = union.Id,
                    PersonId = prediction.TargetPersonId,
                    Role = "Partner",
                    CreatedAt = DateTime.UtcNow
                });

                prediction.AppliedEntityType = "Union";
                prediction.AppliedEntityId = union.Id;
            }

            prediction.Status = PredictionStatus.Applied;
            prediction.ResolvedByUserId = userContext.UserId;
            prediction.ResolvedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(ct);

            _logger.LogInformation("Prediction {PredictionId} accepted: created {Type} {EntityId}",
                predictionId, prediction.AppliedEntityType, prediction.AppliedEntityId);

            return ServiceResult.Success();
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Error applying prediction {PredictionId}", predictionId);
            return ServiceResult.Failure("Failed to create the relationship. It may already exist.");
        }
    }

    public async Task<ServiceResult> DismissPredictionAsync(
        Guid predictionId, string? reason, UserContext userContext, CancellationToken ct = default)
    {
        if (!HasAdminAccess(userContext))
            return ServiceResult.Forbidden();

        var prediction = await _context.PredictedRelationships
            .FirstOrDefaultAsync(p => p.Id == predictionId, ct);

        if (prediction == null)
            return ServiceResult.NotFound("Prediction not found");

        if (prediction.Status != PredictionStatus.New)
            return ServiceResult.Failure($"Prediction is already {prediction.Status}");

        prediction.Status = PredictionStatus.Dismissed;
        prediction.DismissReason = reason;
        prediction.ResolvedByUserId = userContext.UserId;
        prediction.ResolvedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);

        _logger.LogInformation("Prediction {PredictionId} dismissed", predictionId);
        return ServiceResult.Success();
    }

    public async Task<ServiceResult<int>> AcceptAllHighConfidenceAsync(
        Guid treeId, double minConfidence, UserContext userContext, CancellationToken ct = default)
    {
        if (!HasAdminAccess(userContext))
            return ServiceResult<int>.Forbidden();

        var predictions = await _context.PredictedRelationships
            .Where(p => p.TreeId == treeId
                && p.Status == PredictionStatus.New
                && p.Confidence >= (decimal)minConfidence)
            .OrderByDescending(p => p.Confidence)
            .ToListAsync(ct);

        int accepted = 0;
        foreach (var prediction in predictions)
        {
            var result = await AcceptPredictionAsync(prediction.Id, userContext, ct);
            if (result.IsSuccess)
                accepted++;
        }

        _logger.LogInformation("Bulk accept for tree {TreeId}: {Accepted}/{Total} predictions accepted",
            treeId, accepted, predictions.Count);

        return ServiceResult<int>.Success(accepted);
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    private bool HasAdminAccess(UserContext userContext)
    {
        return userContext.IsDeveloper || userContext.IsSuperAdmin || userContext.IsAdmin;
    }

    private static PredictionDto MapToDto(PredictedRelationship p)
    {
        return new PredictionDto(
            Id: p.Id,
            TreeId: p.TreeId,
            RuleId: p.RuleId,
            RuleDescription: GetRuleDescription(p.RuleId),
            PredictedType: p.PredictedType,
            SourcePersonId: p.SourcePersonId,
            SourcePersonName: p.SourcePerson?.PrimaryName,
            SourcePersonNameArabic: p.SourcePerson?.NameArabic,
            TargetPersonId: p.TargetPersonId,
            TargetPersonName: p.TargetPerson?.PrimaryName,
            TargetPersonNameArabic: p.TargetPerson?.NameArabic,
            Confidence: p.Confidence,
            ConfidenceLevel: p.ConfidenceLevel,
            Explanation: p.Explanation,
            Status: (int)p.Status,
            CreatedAt: p.CreatedAt,
            ScanBatchId: p.ScanBatchId
        );
    }

    private static string GetRuleDescription(string ruleId) => ruleId switch
    {
        "spouse_child_gap" => "Spouse not linked to children",
        "missing_union" => "Co-parents without a union",
        "sibling_parent_gap" => "Sibling missing second parent",
        "patronymic_name" => "Arabic patronymic name match",
        "age_family" => "Age gap and family membership",
        _ => ruleId
    };
}
