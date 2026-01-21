# Claude Code Implementation Prompt
## User Role Town-Based Browsing System - Gap Implementation

---

## Context

You are implementing missing features for a **Family Tree Application** with the following tech stack:
- **Backend:** ASP.NET Core 8 Web API with PostgreSQL
- **Frontend:** Angular 18+ with Material Design, Standalone Components, Signals
- **Auth:** JWT with role-based access (User, Admin, SuperAdmin)

The codebase already has:
- Town selection mechanism (`/api/auth/select-town-user`)
- Basic suggestion system with approve/reject workflow
- Dashboard with role-based quick actions
- Town and FamilyTree CRUD operations

---

## Implementation Tasks

Complete the following tasks in order. After each task, verify the implementation compiles and follows existing patterns.

---

## TASK 1: Backend - Town Statistics Endpoint

### 1.1 Add DTOs to `FamilyTreeApi/DTOs/TownDTOs.cs`

Add these new DTOs after the existing ones:

```csharp
/// <summary>
/// Statistics for a town including all family trees
/// </summary>
public record TownStatisticsDto(
    Guid TownId,
    string TownName,
    string? TownNameEn,
    string? TownNameAr,
    int TotalFamilyTrees,
    int TotalPeople,
    int TotalFamilies,
    int TotalRelationships,
    int TotalMediaFiles,
    List<FamilyTreeSummaryDto> FamilyTrees
);

/// <summary>
/// Summary of a family tree with counts for display in town overview
/// </summary>
public record FamilyTreeSummaryDto(
    Guid Id,
    string Name,
    string? Description,
    string? CoverImageUrl,
    int PeopleCount,
    int MaleCount,
    int FemaleCount,
    int FamiliesCount,
    int RelationshipsCount,
    int MediaFilesCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
```

### 1.2 Add Service Method to `ITownService.cs`

```csharp
Task<ServiceResult<TownStatisticsDto>> GetTownStatisticsAsync(Guid townId, UserContext userContext);
```

### 1.3 Implement in `TownService.cs`

Add this method to the TownService class:

```csharp
public async Task<ServiceResult<TownStatisticsDto>> GetTownStatisticsAsync(Guid townId, UserContext userContext)
{
    try
    {
        // Get town
        var town = await _context.Towns.FindAsync(townId);
        if (town == null)
        {
            return ServiceResult<TownStatisticsDto>.NotFound("Town not found");
        }

        // Get all trees in this town with statistics using a single efficient query
        var treeStats = await _context.Orgs
            .Where(o => o.TownId == townId && !o.IsDeleted)
            .Select(o => new FamilyTreeSummaryDto(
                o.Id,
                o.Name,
                o.Description,
                o.CoverImageUrl,
                o.People.Count(p => !p.IsDeleted),
                o.People.Count(p => !p.IsDeleted && p.Sex == "M"),
                o.People.Count(p => !p.IsDeleted && p.Sex == "F"),
                o.Unions.Count(u => !u.IsDeleted),
                o.ParentChildren.Count(pc => !pc.IsDeleted),
                o.MediaFiles.Count(m => !m.IsDeleted),
                o.CreatedAt,
                o.UpdatedAt
            ))
            .ToListAsync();

        // Aggregate totals
        var statistics = new TownStatisticsDto(
            TownId: townId,
            TownName: town.Name,
            TownNameEn: town.NameEn,
            TownNameAr: town.NameAr,
            TotalFamilyTrees: treeStats.Count,
            TotalPeople: treeStats.Sum(t => t.PeopleCount),
            TotalFamilies: treeStats.Sum(t => t.FamiliesCount),
            TotalRelationships: treeStats.Sum(t => t.RelationshipsCount),
            TotalMediaFiles: treeStats.Sum(t => t.MediaFilesCount),
            FamilyTrees: treeStats
        );

        return ServiceResult<TownStatisticsDto>.Success(statistics);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error getting town statistics for {TownId}", townId);
        return ServiceResult<TownStatisticsDto>.InternalError("Failed to get town statistics");
    }
}
```

### 1.4 Add Endpoint to `TownController.cs`

Add this endpoint after the existing `GetTownTrees` method:

```csharp
/// <summary>
/// Get aggregated statistics for a town including all family trees
/// </summary>
[HttpGet("{townId}/statistics")]
public async Task<ActionResult<TownStatisticsDto>> GetTownStatistics(Guid townId)
{
    var userContext = BuildUserContext();
    var result = await _townService.GetTownStatisticsAsync(townId, userContext);

    return HandleResult(result);
}
```

---

## TASK 2: Backend - Tree Details with Statistics Endpoint

### 2.1 Add DTOs to `FamilyTreeApi/DTOs/FamilyTreeDtos.cs`

```csharp
/// <summary>
/// Detailed family tree information with statistics
/// </summary>
public record FamilyTreeDetailDto(
    Guid Id,
    string Name,
    string? Description,
    string? CoverImageUrl,
    Guid TownId,
    string TownName,
    bool IsPublic,
    TreeStatisticsDto Statistics,
    List<RecentPersonDto> RecentlyAddedPeople,
    List<RecentPersonDto> RecentlyUpdatedPeople,
    long OwnerId,
    string? OwnerName,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>
/// Statistics for a family tree
/// </summary>
public record TreeStatisticsDto(
    int TotalPeople,
    int MaleCount,
    int FemaleCount,
    int UnknownGenderCount,
    int LivingCount,
    int DeceasedCount,
    int FamiliesCount,
    int RelationshipsCount,
    int MediaFilesCount,
    int PhotosCount,
    int DocumentsCount,
    RecentPersonDto? OldestPerson,
    RecentPersonDto? YoungestPerson
);

/// <summary>
/// Recent person for activity feeds
/// </summary>
public record RecentPersonDto(
    Guid Id,
    string? PrimaryName,
    string? NameEnglish,
    string? NameArabic,
    string? Sex,
    string? BirthDate,
    string? DeathDate,
    string? AvatarUrl,
    DateTime ActivityDate
);
```

### 2.2 Add to `IFamilyTreeService.cs`

```csharp
Task<ServiceResult<FamilyTreeDetailDto>> GetTreeDetailsAsync(Guid treeId, UserContext userContext);
```

### 2.3 Implement in `FamilyTreeService.cs`

```csharp
public async Task<ServiceResult<FamilyTreeDetailDto>> GetTreeDetailsAsync(Guid treeId, UserContext userContext)
{
    try
    {
        var tree = await _context.Orgs
            .Include(o => o.Town)
            .Include(o => o.Owner)
            .FirstOrDefaultAsync(o => o.Id == treeId && !o.IsDeleted);

        if (tree == null)
        {
            return ServiceResult<FamilyTreeDetailDto>.NotFound("Family tree not found");
        }

        // Get people statistics
        var people = await _context.People
            .Where(p => p.OrgId == treeId && !p.IsDeleted)
            .ToListAsync();

        var maleCount = people.Count(p => p.Sex == "M");
        var femaleCount = people.Count(p => p.Sex == "F");
        var unknownCount = people.Count(p => p.Sex != "M" && p.Sex != "F");
        var livingCount = people.Count(p => p.DeathDate == null);
        var deceasedCount = people.Count(p => p.DeathDate != null);

        // Get counts
        var familiesCount = await _context.Unions
            .CountAsync(u => u.OrgId == treeId && !u.IsDeleted);
        var relationshipsCount = await _context.ParentChildren
            .CountAsync(pc => pc.OrgId == treeId && !pc.IsDeleted);
        var mediaFiles = await _context.MediaFiles
            .Where(m => m.OrgId == treeId && !m.IsDeleted)
            .ToListAsync();

        // Find oldest and youngest
        var oldestPerson = people
            .Where(p => p.BirthDate != null)
            .OrderBy(p => p.BirthDate)
            .FirstOrDefault();
        var youngestPerson = people
            .Where(p => p.BirthDate != null)
            .OrderByDescending(p => p.BirthDate)
            .FirstOrDefault();

        // Recent people
        var recentlyAdded = people
            .OrderByDescending(p => p.CreatedAt)
            .Take(5)
            .Select(p => MapToRecentPerson(p, p.CreatedAt))
            .ToList();

        var recentlyUpdated = people
            .Where(p => p.UpdatedAt > p.CreatedAt)
            .OrderByDescending(p => p.UpdatedAt)
            .Take(5)
            .Select(p => MapToRecentPerson(p, p.UpdatedAt))
            .ToList();

        var statistics = new TreeStatisticsDto(
            TotalPeople: people.Count,
            MaleCount: maleCount,
            FemaleCount: femaleCount,
            UnknownGenderCount: unknownCount,
            LivingCount: livingCount,
            DeceasedCount: deceasedCount,
            FamiliesCount: familiesCount,
            RelationshipsCount: relationshipsCount,
            MediaFilesCount: mediaFiles.Count,
            PhotosCount: mediaFiles.Count(m => m.MediaType == "photo"),
            DocumentsCount: mediaFiles.Count(m => m.MediaType == "document"),
            OldestPerson: oldestPerson != null ? MapToRecentPerson(oldestPerson, oldestPerson.CreatedAt) : null,
            YoungestPerson: youngestPerson != null ? MapToRecentPerson(youngestPerson, youngestPerson.CreatedAt) : null
        );

        var detail = new FamilyTreeDetailDto(
            Id: tree.Id,
            Name: tree.Name,
            Description: tree.Description,
            CoverImageUrl: tree.CoverImageUrl,
            TownId: tree.TownId ?? Guid.Empty,
            TownName: tree.Town?.Name ?? "Unknown",
            IsPublic: tree.IsPublic,
            Statistics: statistics,
            RecentlyAddedPeople: recentlyAdded,
            RecentlyUpdatedPeople: recentlyUpdated,
            OwnerId: tree.OwnerId,
            OwnerName: tree.Owner?.DisplayName,
            CreatedAt: tree.CreatedAt,
            UpdatedAt: tree.UpdatedAt
        );

        return ServiceResult<FamilyTreeDetailDto>.Success(detail);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error getting tree details for {TreeId}", treeId);
        return ServiceResult<FamilyTreeDetailDto>.InternalError("Failed to get tree details");
    }
}

private static RecentPersonDto MapToRecentPerson(Person p, DateTime activityDate)
{
    return new RecentPersonDto(
        Id: p.Id,
        PrimaryName: p.PrimaryName,
        NameEnglish: p.NameEnglish,
        NameArabic: p.NameArabic,
        Sex: p.Sex,
        BirthDate: p.BirthDate?.ToString("yyyy-MM-dd"),
        DeathDate: p.DeathDate?.ToString("yyyy-MM-dd"),
        AvatarUrl: p.AvatarUrl,
        ActivityDate: activityDate
    );
}
```

### 2.4 Add Endpoint to `FamilyTreeController.cs`

```csharp
/// <summary>
/// Get detailed family tree information with statistics
/// </summary>
[HttpGet("{treeId}/details")]
public async Task<ActionResult<FamilyTreeDetailDto>> GetTreeDetails(Guid treeId)
{
    var userContext = BuildUserContext();
    var result = await _familyTreeService.GetTreeDetailsAsync(treeId, userContext);

    return HandleResult(result);
}
```

---

## TASK 3: Backend - Convenience Suggestion Endpoints

### 3.1 Add DTOs to `SuggestionDTOs.cs`

```csharp
/// <summary>
/// Simplified request to suggest adding a new person
/// </summary>
public record SuggestAddPersonRequest(
    Guid TreeId,
    string PrimaryName,
    string? NameEnglish,
    string? NameArabic,
    string? Sex,
    string? BirthDate,
    string? BirthPlace,
    string? DeathDate,
    string? DeathPlace,
    string? Occupation,
    string? Notes,
    // Optional relationship
    Guid? RelatedPersonId,
    string? RelationshipType, // "parent", "child", "spouse"
    ConfidenceLevel Confidence = ConfidenceLevel.Probable,
    string? SubmitterNotes
);

/// <summary>
/// Simplified request to suggest adding a relationship
/// </summary>
public record SuggestAddRelationshipRequest(
    Guid TreeId,
    Guid Person1Id,
    Guid Person2Id,
    string RelationshipType, // "parent-child", "spouse"
    // For parent-child: who is the parent?
    bool Person1IsParent,
    // For spouse
    string? MarriageDate,
    string? MarriagePlace,
    ConfidenceLevel Confidence = ConfidenceLevel.Probable,
    string? SubmitterNotes
);

/// <summary>
/// Response after submitting a suggestion
/// </summary>
public record SuggestionSubmittedResponse(
    Guid SuggestionId,
    string Status,
    string Message,
    DateTime SubmittedAt
);
```

### 3.2 Add Endpoints to `SuggestionController.cs`

Add these after the existing `CreateSuggestion` endpoint:

```csharp
/// <summary>
/// Convenience endpoint to suggest adding a new person
/// </summary>
[HttpPost("add-person")]
public async Task<ActionResult<SuggestionSubmittedResponse>> SuggestAddPerson(
    [FromBody] SuggestAddPersonRequest request)
{
    try
    {
        var userId = GetUserId();
        var townId = GetSelectedTownId();

        if (!townId.HasValue)
            return BadRequest(new { message = "No town selected. Please select a town first." });

        // Convert to generic suggestion request
        var proposedValues = new Dictionary<string, object>
        {
            ["PrimaryName"] = request.PrimaryName,
            ["NameEnglish"] = request.NameEnglish ?? "",
            ["NameArabic"] = request.NameArabic ?? "",
            ["Sex"] = request.Sex ?? "",
            ["BirthDate"] = request.BirthDate ?? "",
            ["BirthPlace"] = request.BirthPlace ?? "",
            ["DeathDate"] = request.DeathDate ?? "",
            ["DeathPlace"] = request.DeathPlace ?? "",
            ["Occupation"] = request.Occupation ?? "",
            ["Notes"] = request.Notes ?? ""
        };

        var suggestionType = SuggestionType.AddPerson;
        
        // If relationship specified, adjust type
        if (request.RelatedPersonId.HasValue && !string.IsNullOrEmpty(request.RelationshipType))
        {
            suggestionType = request.RelationshipType.ToLower() switch
            {
                "parent" => SuggestionType.AddParent,
                "child" => SuggestionType.AddChild,
                "spouse" => SuggestionType.AddSpouse,
                _ => SuggestionType.AddPerson
            };
        }

        var genericRequest = new CreateSuggestionRequest(
            TreeId: request.TreeId,
            Type: suggestionType,
            TargetPersonId: request.RelatedPersonId,
            SecondaryPersonId: null,
            TargetUnionId: null,
            ProposedValues: proposedValues,
            RelationshipType: null,
            UnionType: null,
            Confidence: request.Confidence,
            SubmitterNotes: request.SubmitterNotes,
            Evidence: null
        );

        var result = await _suggestionService.CreateSuggestionAsync(genericRequest, userId, townId.Value);

        if (!result.IsSuccess)
            return HandleServiceResult(result);

        return Ok(new SuggestionSubmittedResponse(
            SuggestionId: result.Data!.Id,
            Status: "Pending",
            Message: "Your suggestion has been submitted for review.",
            SubmittedAt: DateTime.UtcNow
        ));
    }
    catch (UnauthorizedAccessException ex)
    {
        return Unauthorized(new { message = ex.Message });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error creating add-person suggestion");
        return StatusCode(500, new { message = "An error occurred" });
    }
}

/// <summary>
/// Convenience endpoint to suggest adding a relationship between two people
/// </summary>
[HttpPost("add-relationship")]
public async Task<ActionResult<SuggestionSubmittedResponse>> SuggestAddRelationship(
    [FromBody] SuggestAddRelationshipRequest request)
{
    try
    {
        var userId = GetUserId();
        var townId = GetSelectedTownId();

        if (!townId.HasValue)
            return BadRequest(new { message = "No town selected. Please select a town first." });

        SuggestionType suggestionType;
        Guid? targetPersonId;
        Guid? secondaryPersonId;
        RelationshipType? relType = null;
        UnionType? unionType = null;

        if (request.RelationshipType.ToLower() == "spouse")
        {
            suggestionType = SuggestionType.AddSpouse;
            targetPersonId = request.Person1Id;
            secondaryPersonId = request.Person2Id;
            unionType = UnionType.Marriage;
        }
        else // parent-child
        {
            if (request.Person1IsParent)
            {
                suggestionType = SuggestionType.AddChild;
                targetPersonId = request.Person1Id; // parent
                secondaryPersonId = request.Person2Id; // child
            }
            else
            {
                suggestionType = SuggestionType.AddParent;
                targetPersonId = request.Person2Id; // child
                secondaryPersonId = request.Person1Id; // parent
            }
            relType = RelationshipType.Biological;
        }

        var proposedValues = new Dictionary<string, object>();
        if (!string.IsNullOrEmpty(request.MarriageDate))
            proposedValues["StartDate"] = request.MarriageDate;
        if (!string.IsNullOrEmpty(request.MarriagePlace))
            proposedValues["StartPlace"] = request.MarriagePlace;

        var genericRequest = new CreateSuggestionRequest(
            TreeId: request.TreeId,
            Type: suggestionType,
            TargetPersonId: targetPersonId,
            SecondaryPersonId: secondaryPersonId,
            TargetUnionId: null,
            ProposedValues: proposedValues.Count > 0 ? proposedValues : null,
            RelationshipType: relType,
            UnionType: unionType,
            Confidence: request.Confidence,
            SubmitterNotes: request.SubmitterNotes,
            Evidence: null
        );

        var result = await _suggestionService.CreateSuggestionAsync(genericRequest, userId, townId.Value);

        if (!result.IsSuccess)
            return HandleServiceResult(result);

        return Ok(new SuggestionSubmittedResponse(
            SuggestionId: result.Data!.Id,
            Status: "Pending",
            Message: "Your relationship suggestion has been submitted for review.",
            SubmittedAt: DateTime.UtcNow
        ));
    }
    catch (UnauthorizedAccessException ex)
    {
        return Unauthorized(new { message = ex.Message });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error creating add-relationship suggestion");
        return StatusCode(500, new { message = "An error occurred" });
    }
}
```

---

## TASK 4: Frontend - Models and Services

### 4.1 Add Models to `src/app/core/models/town.models.ts`

```typescript
export interface TownStatistics {
  townId: string;
  townName: string;
  townNameEn?: string;
  townNameAr?: string;
  totalFamilyTrees: number;
  totalPeople: number;
  totalFamilies: number;
  totalRelationships: number;
  totalMediaFiles: number;
  familyTrees: FamilyTreeSummary[];
}

export interface FamilyTreeSummary {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  peopleCount: number;
  maleCount: number;
  femaleCount: number;
  familiesCount: number;
  relationshipsCount: number;
  mediaFilesCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### 4.2 Add Models to `src/app/core/models/family-tree.models.ts`

```typescript
export interface FamilyTreeDetail {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  townId: string;
  townName: string;
  isPublic: boolean;
  statistics: TreeStatistics;
  recentlyAddedPeople: RecentPerson[];
  recentlyUpdatedPeople: RecentPerson[];
  ownerId: number;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreeStatistics {
  totalPeople: number;
  maleCount: number;
  femaleCount: number;
  unknownGenderCount: number;
  livingCount: number;
  deceasedCount: number;
  familiesCount: number;
  relationshipsCount: number;
  mediaFilesCount: number;
  photosCount: number;
  documentsCount: number;
  oldestPerson?: RecentPerson;
  youngestPerson?: RecentPerson;
}

export interface RecentPerson {
  id: string;
  primaryName?: string;
  nameEnglish?: string;
  nameArabic?: string;
  sex?: string;
  birthDate?: string;
  deathDate?: string;
  avatarUrl?: string;
  activityDate: string;
}
```

### 4.3 Update `src/app/core/services/town.service.ts`

Add this method:

```typescript
/**
 * Get aggregated statistics for a town
 */
getTownStatistics(townId: string): Observable<TownStatistics> {
  return this.http.get<TownStatistics>(`${this.apiUrl}/${townId}/statistics`);
}
```

### 4.4 Update `src/app/core/services/family-tree.service.ts`

Add this method:

```typescript
/**
 * Get detailed tree information with statistics
 */
getTreeDetails(treeId: string): Observable<FamilyTreeDetail> {
  return this.http.get<FamilyTreeDetail>(`${this.apiUrl}/${treeId}/details`);
}
```

### 4.5 Add to `src/app/core/models/suggestion.models.ts`

```typescript
export interface SuggestAddPersonRequest {
  treeId: string;
  primaryName: string;
  nameEnglish?: string;
  nameArabic?: string;
  sex?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  occupation?: string;
  notes?: string;
  relatedPersonId?: string;
  relationshipType?: 'parent' | 'child' | 'spouse';
  confidence?: ConfidenceLevel;
  submitterNotes?: string;
}

export interface SuggestAddRelationshipRequest {
  treeId: string;
  person1Id: string;
  person2Id: string;
  relationshipType: 'parent-child' | 'spouse';
  person1IsParent?: boolean;
  marriageDate?: string;
  marriagePlace?: string;
  confidence?: ConfidenceLevel;
  submitterNotes?: string;
}

export interface SuggestionSubmittedResponse {
  suggestionId: string;
  status: string;
  message: string;
  submittedAt: string;
}
```

### 4.6 Update `src/app/core/services/suggestion.service.ts`

Add these methods:

```typescript
/**
 * Suggest adding a new person (convenience endpoint)
 */
suggestAddPerson(request: SuggestAddPersonRequest): Observable<SuggestionSubmittedResponse> {
  return this.http.post<SuggestionSubmittedResponse>(`${this.apiUrl}/add-person`, request);
}

/**
 * Suggest adding a relationship (convenience endpoint)
 */
suggestAddRelationship(request: SuggestAddRelationshipRequest): Observable<SuggestionSubmittedResponse> {
  return this.http.post<SuggestionSubmittedResponse>(`${this.apiUrl}/add-relationship`, request);
}
```

---

## TASK 5: Frontend - Town Overview Component

### 5.1 Create `src/app/features/towns/town-overview.component.ts`

```typescript
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TownService } from '../../core/services/town.service';
import { AuthService } from '../../core/services/auth.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { TownStatistics, FamilyTreeSummary } from '../../core/models/town.models';

@Component({
  selector: 'app-town-overview',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTooltipModule,
    TranslatePipe
  ],
  template: `
    <div class="town-overview">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
        </div>
      } @else if (error()) {
        <div class="error-container">
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="loadStatistics()">
            {{ 'common.retry' | translate }}
          </button>
        </div>
      } @else if (statistics()) {
        <!-- Town Header -->
        <div class="town-header">
          <h1>{{ getTownDisplayName() }}</h1>
          <p class="town-subtitle">{{ 'towns.browsingTown' | translate }}</p>
        </div>

        <!-- Statistics Cards -->
        <div class="stats-grid">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-icon trees">
                <i class="fa-solid fa-tree"></i>
              </div>
              <div class="stat-value">{{ statistics()!.totalFamilyTrees }}</div>
              <div class="stat-label">{{ 'towns.familyTrees' | translate }}</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-icon people">
                <i class="fa-solid fa-users"></i>
              </div>
              <div class="stat-value">{{ statistics()!.totalPeople }}</div>
              <div class="stat-label">{{ 'dashboard.totalPeople' | translate }}</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-icon families">
                <i class="fa-solid fa-people-roof"></i>
              </div>
              <div class="stat-value">{{ statistics()!.totalFamilies }}</div>
              <div class="stat-label">{{ 'dashboard.totalFamilies' | translate }}</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-icon media">
                <i class="fa-solid fa-images"></i>
              </div>
              <div class="stat-value">{{ statistics()!.totalMediaFiles }}</div>
              <div class="stat-label">{{ 'nav.media' | translate }}</div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Family Trees Section -->
        <div class="trees-section">
          <h2>{{ 'towns.familyTrees' | translate }}</h2>
          
          @if (statistics()!.familyTrees.length === 0) {
            <div class="empty-state">
              <i class="fa-solid fa-tree"></i>
              <p>{{ 'towns.noTrees' | translate }}</p>
            </div>
          } @else {
            <div class="trees-grid">
              @for (tree of statistics()!.familyTrees; track tree.id) {
                <mat-card class="tree-card" (click)="selectTree(tree)">
                  <div class="tree-cover" 
                       [style.background-image]="tree.coverImageUrl ? 'url(' + tree.coverImageUrl + ')' : 'none'">
                    @if (!tree.coverImageUrl) {
                      <i class="fa-solid fa-sitemap"></i>
                    }
                  </div>
                  <mat-card-header>
                    <mat-card-title>{{ tree.name }}</mat-card-title>
                  </mat-card-header>
                  <mat-card-content>
                    @if (tree.description) {
                      <p class="tree-description">{{ tree.description | slice:0:100 }}...</p>
                    }
                    <div class="tree-stats">
                      <span matTooltip="{{ 'dashboard.totalPeople' | translate }}">
                        <i class="fa-solid fa-users"></i> {{ tree.peopleCount }}
                      </span>
                      <span matTooltip="{{ 'dashboard.totalFamilies' | translate }}">
                        <i class="fa-solid fa-people-roof"></i> {{ tree.familiesCount }}
                      </span>
                      <span matTooltip="{{ 'nav.media' | translate }}">
                        <i class="fa-solid fa-images"></i> {{ tree.mediaFilesCount }}
                      </span>
                    </div>
                  </mat-card-content>
                  <mat-card-actions>
                    <button mat-button color="primary">
                      {{ 'common.viewDetails' | translate }}
                    </button>
                  </mat-card-actions>
                </mat-card>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./town-overview.component.scss']
})
export class TownOverviewComponent implements OnInit {
  private townService = inject(TownService);
  private authService = inject(AuthService);
  private treeContext = inject(TreeContextService);
  private router = inject(Router);
  i18n = inject(I18nService);

  statistics = signal<TownStatistics | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.loadStatistics();
  }

  loadStatistics() {
    const user = this.authService.getCurrentUser();
    if (!user?.selectedTownId) {
      this.router.navigate(['/onboarding/town']);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.townService.getTownStatistics(user.selectedTownId).subscribe({
      next: (stats) => {
        this.statistics.set(stats);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('towns.failedLoad'));
        this.loading.set(false);
      }
    });
  }

  getTownDisplayName(): string {
    const stats = this.statistics();
    if (!stats) return '';
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && stats.townNameAr) return stats.townNameAr;
    if (lang === 'en' && stats.townNameEn) return stats.townNameEn;
    return stats.townName;
  }

  selectTree(tree: FamilyTreeSummary) {
    this.treeContext.selectTree(tree.id);
    this.router.navigate(['/trees', tree.id, 'details']);
  }
}
```

### 5.2 Create `src/app/features/towns/town-overview.component.scss`

```scss
.town-overview {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 1rem;
}

.town-header {
  margin-bottom: 2rem;
  
  h1 {
    margin: 0;
    font-size: 2rem;
    color: var(--nubian-teal, #187573);
  }
  
  .town-subtitle {
    margin: 0.5rem 0 0;
    color: #666;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  mat-card-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem;
  }
  
  .stat-icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: white;
    margin-bottom: 1rem;
    
    &.trees { background: #2D7A3E; }
    &.people { background: #187573; }
    &.families { background: #C17E3E; }
    &.media { background: #E85D35; }
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #333;
  }
  
  .stat-label {
    color: #666;
    font-size: 0.9rem;
  }
}

.trees-section {
  h2 {
    margin-bottom: 1rem;
    color: #333;
  }
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #666;
  
  i {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }
}

.trees-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.tree-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
  
  .tree-cover {
    height: 150px;
    background-color: #f0f0f0;
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    
    i {
      font-size: 3rem;
      color: #ccc;
    }
  }
  
  .tree-description {
    color: #666;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }
  
  .tree-stats {
    display: flex;
    gap: 1rem;
    color: #888;
    font-size: 0.85rem;
    
    span {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }
}
```

---

## TASK 6: Frontend - Tree Detail Component

### 6.1 Create `src/app/features/family-trees/tree-detail.component.ts`

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDialog } from '@angular/material/dialog';

import { FamilyTreeService } from '../../core/services/family-tree.service';
import { AuthService } from '../../core/services/auth.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyTreeDetail, RecentPerson } from '../../core/models/family-tree.models';
import { SuggestionWizardDialogComponent } from '../suggestions/suggestion-wizard-dialog.component';

@Component({
  selector: 'app-tree-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatListModule,
    TranslatePipe
  ],
  template: `
    <div class="tree-detail">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
        </div>
      } @else if (error()) {
        <div class="error-container">
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="loadTreeDetails()">
            {{ 'common.retry' | translate }}
          </button>
        </div>
      } @else if (treeDetail()) {
        <!-- Header -->
        <div class="tree-header">
          <div class="tree-cover" 
               [style.background-image]="treeDetail()!.coverImageUrl ? 'url(' + treeDetail()!.coverImageUrl + ')' : 'none'">
          </div>
          <div class="tree-info">
            <h1>{{ treeDetail()!.name }}</h1>
            <p class="tree-town">{{ treeDetail()!.townName }}</p>
            @if (treeDetail()!.description) {
              <p class="tree-description">{{ treeDetail()!.description }}</p>
            }
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="action-buttons">
          <button mat-raised-button color="primary" [routerLink]="['/people']">
            <i class="fa-solid fa-users"></i>
            {{ 'nav.browsePeople' | translate }}
          </button>
          <button mat-raised-button [routerLink]="['/tree']">
            <i class="fa-solid fa-sitemap"></i>
            {{ 'nav.familyTree' | translate }}
          </button>
          @if (isViewer()) {
            <button mat-raised-button color="accent" (click)="openSuggestionWizard()">
              <i class="fa-solid fa-lightbulb"></i>
              {{ 'suggestion.suggest' | translate }}
            </button>
          }
        </div>

        <!-- Statistics Grid -->
        <div class="stats-section">
          <h2>{{ 'common.statistics' | translate }}</h2>
          <div class="stats-grid">
            <mat-card class="stat-card">
              <div class="stat-value">{{ treeDetail()!.statistics.totalPeople }}</div>
              <div class="stat-label">{{ 'dashboard.totalPeople' | translate }}</div>
            </mat-card>
            <mat-card class="stat-card male">
              <div class="stat-value">{{ treeDetail()!.statistics.maleCount }}</div>
              <div class="stat-label">{{ 'people.male' | translate }}</div>
            </mat-card>
            <mat-card class="stat-card female">
              <div class="stat-value">{{ treeDetail()!.statistics.femaleCount }}</div>
              <div class="stat-label">{{ 'people.female' | translate }}</div>
            </mat-card>
            <mat-card class="stat-card">
              <div class="stat-value">{{ treeDetail()!.statistics.familiesCount }}</div>
              <div class="stat-label">{{ 'dashboard.totalFamilies' | translate }}</div>
            </mat-card>
            <mat-card class="stat-card">
              <div class="stat-value">{{ treeDetail()!.statistics.mediaFilesCount }}</div>
              <div class="stat-label">{{ 'nav.media' | translate }}</div>
            </mat-card>
            <mat-card class="stat-card">
              <div class="stat-value">{{ treeDetail()!.statistics.livingCount }}</div>
              <div class="stat-label">{{ 'people.living' | translate }}</div>
            </mat-card>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="recent-section">
          <h2>{{ 'dashboard.recentActivity' | translate }}</h2>
          <div class="recent-grid">
            <mat-card>
              <mat-card-header>
                <mat-card-title>{{ 'dashboard.recentlyAdded' | translate }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                @if (treeDetail()!.recentlyAddedPeople.length === 0) {
                  <p class="empty-text">{{ 'common.noData' | translate }}</p>
                } @else {
                  <mat-list>
                    @for (person of treeDetail()!.recentlyAddedPeople; track person.id) {
                      <mat-list-item [routerLink]="['/people', person.id]">
                        <span matListItemTitle>{{ getPersonName(person) }}</span>
                        <span matListItemLine>{{ person.activityDate | date:'shortDate' }}</span>
                      </mat-list-item>
                    }
                  </mat-list>
                }
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title>{{ 'dashboard.recentlyUpdated' | translate }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                @if (treeDetail()!.recentlyUpdatedPeople.length === 0) {
                  <p class="empty-text">{{ 'common.noData' | translate }}</p>
                } @else {
                  <mat-list>
                    @for (person of treeDetail()!.recentlyUpdatedPeople; track person.id) {
                      <mat-list-item [routerLink]="['/people', person.id]">
                        <span matListItemTitle>{{ getPersonName(person) }}</span>
                        <span matListItemLine>{{ person.activityDate | date:'shortDate' }}</span>
                      </mat-list-item>
                    }
                  </mat-list>
                }
              </mat-card-content>
            </mat-card>
          </div>
        </div>

        <!-- Notable People -->
        @if (treeDetail()!.statistics.oldestPerson || treeDetail()!.statistics.youngestPerson) {
          <div class="notable-section">
            <h2>{{ 'dashboard.notablePeople' | translate }}</h2>
            <div class="notable-grid">
              @if (treeDetail()!.statistics.oldestPerson) {
                <mat-card [routerLink]="['/people', treeDetail()!.statistics.oldestPerson!.id]">
                  <mat-card-header>
                    <mat-card-title>{{ 'dashboard.oldest' | translate }}</mat-card-title>
                  </mat-card-header>
                  <mat-card-content>
                    <p class="person-name">{{ getPersonName(treeDetail()!.statistics.oldestPerson!) }}</p>
                    <p class="person-dates">{{ treeDetail()!.statistics.oldestPerson!.birthDate }}</p>
                  </mat-card-content>
                </mat-card>
              }
              @if (treeDetail()!.statistics.youngestPerson) {
                <mat-card [routerLink]="['/people', treeDetail()!.statistics.youngestPerson!.id]">
                  <mat-card-header>
                    <mat-card-title>{{ 'dashboard.youngest' | translate }}</mat-card-title>
                  </mat-card-header>
                  <mat-card-content>
                    <p class="person-name">{{ getPersonName(treeDetail()!.statistics.youngestPerson!) }}</p>
                    <p class="person-dates">{{ treeDetail()!.statistics.youngestPerson!.birthDate }}</p>
                  </mat-card-content>
                </mat-card>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styleUrls: ['./tree-detail.component.scss']
})
export class TreeDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private treeService = inject(FamilyTreeService);
  private authService = inject(AuthService);
  private treeContext = inject(TreeContextService);
  private dialog = inject(MatDialog);
  i18n = inject(I18nService);

  treeDetail = signal<FamilyTreeDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    const treeId = this.route.snapshot.paramMap.get('id');
    if (treeId) {
      this.treeContext.selectTree(treeId);
      this.loadTreeDetails();
    }
  }

  loadTreeDetails() {
    const treeId = this.route.snapshot.paramMap.get('id');
    if (!treeId) return;

    this.loading.set(true);
    this.error.set(null);

    this.treeService.getTreeDetails(treeId).subscribe({
      next: (detail) => {
        this.treeDetail.set(detail);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load tree details');
        this.loading.set(false);
      }
    });
  }

  getPersonName(person: RecentPerson): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar' && person.nameArabic) return person.nameArabic;
    if (lang === 'en' && person.nameEnglish) return person.nameEnglish;
    return person.primaryName || 'Unknown';
  }

  isViewer(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.systemRole === 'User';
  }

  openSuggestionWizard() {
    this.dialog.open(SuggestionWizardDialogComponent, {
      width: '600px',
      maxHeight: '90vh'
    });
  }
}
```

---

## TASK 7: Frontend - Update Routes

### 7.1 Update `src/app/app.routes.ts`

Add these routes inside the main children array:

```typescript
// Add after 'dashboard' route
{
  path: 'town-overview',
  loadComponent: () => import('./features/towns/town-overview.component').then(m => m.TownOverviewComponent)
},

// Update trees/:id route
{
  path: 'trees/:id/details',
  loadComponent: () => import('./features/family-trees/tree-detail.component').then(m => m.TreeDetailComponent)
},
```

---

## TASK 8: Verification

After completing all tasks, verify:

### Backend
```bash
# Build the project
dotnet build

# Run and test endpoints
dotnet run

# Test endpoints with curl or Postman:
# GET /api/towns/{townId}/statistics
# GET /api/familytree/{treeId}/details
# POST /api/suggestion/add-person
# POST /api/suggestion/add-relationship
```

### Frontend
```bash
# Install dependencies if needed
npm install

# Build to check for errors
ng build

# Run dev server
ng serve

# Navigate to:
# /town-overview
# /trees/{id}/details
```

---

## Summary of Created/Modified Files

### Backend
- `DTOs/TownDTOs.cs` - Added TownStatisticsDto, FamilyTreeSummaryDto
- `DTOs/FamilyTreeDtos.cs` - Added FamilyTreeDetailDto, TreeStatisticsDto, RecentPersonDto
- `DTOs/SuggestionDTOs.cs` - Added SuggestAddPersonRequest, SuggestAddRelationshipRequest
- `Services/ITownService.cs` - Added GetTownStatisticsAsync
- `Services/TownService.cs` - Implemented GetTownStatisticsAsync
- `Services/IFamilyTreeService.cs` - Added GetTreeDetailsAsync
- `Services/FamilyTreeService.cs` - Implemented GetTreeDetailsAsync
- `Controllers/TownController.cs` - Added GetTownStatistics endpoint
- `Controllers/FamilyTreeController.cs` - Added GetTreeDetails endpoint
- `Controllers/SuggestionController.cs` - Added SuggestAddPerson, SuggestAddRelationship endpoints

### Frontend
- `core/models/town.models.ts` - Added TownStatistics, FamilyTreeSummary
- `core/models/family-tree.models.ts` - Added FamilyTreeDetail, TreeStatistics, RecentPerson
- `core/models/suggestion.models.ts` - Added request/response interfaces
- `core/services/town.service.ts` - Added getTownStatistics
- `core/services/family-tree.service.ts` - Added getTreeDetails
- `core/services/suggestion.service.ts` - Added suggestAddPerson, suggestAddRelationship
- `features/towns/town-overview.component.ts` - New component
- `features/towns/town-overview.component.scss` - New styles
- `features/family-trees/tree-detail.component.ts` - New component
- `features/family-trees/tree-detail.component.scss` - New styles
- `app.routes.ts` - Added new routes

---

**End of Implementation Prompt**
