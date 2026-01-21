# Governance Model Database Scripts

## Overview

These scripts implement the database layer for the Family Tree Governance Model, which allows viewers to submit structured relationship suggestions that admins review and approve.

## Scripts

Run these scripts in order:

| # | Script | Purpose |
|---|--------|---------|
| 017 | `017_AddUserProfileFields.sql` | Adds `SelectedTownId` and `IsFirstLogin` to users |
| 018 | `018_AddSoftDeleteToEntities.sql` | Adds soft delete columns to People, ParentChildren, Unions |
| 019 | `019_ExtendAuditLog.sql` | Extends AuditLogs with suggestion tracking fields |
| 020 | `020_CreateSuggestionTables.sql` | Creates main suggestion tables |
| 021 | `021_CreateSuggestionHelperViews.sql` | Creates views and helper functions |
| 022 | `022_GovernanceModel_Rollback.sql` | **ROLLBACK ONLY** - Removes all changes |

## Execution

### Apply All Migrations

```bash
# Connect to your PostgreSQL database and run in order:
psql -h localhost -U postgres -d FamilyTree -f 017_AddUserProfileFields.sql
psql -h localhost -U postgres -d FamilyTree -f 018_AddSoftDeleteToEntities.sql
psql -h localhost -U postgres -d FamilyTree -f 019_ExtendAuditLog.sql
psql -h localhost -U postgres -d FamilyTree -f 020_CreateSuggestionTables.sql
psql -h localhost -U postgres -d FamilyTree -f 021_CreateSuggestionHelperViews.sql
```

Or run them all in a single transaction:

```bash
psql -h localhost -U postgres -d FamilyTree -c "
BEGIN;
\i 017_AddUserProfileFields.sql
\i 018_AddSoftDeleteToEntities.sql
\i 019_ExtendAuditLog.sql
\i 020_CreateSuggestionTables.sql
\i 021_CreateSuggestionHelperViews.sql
COMMIT;
"
```

### Rollback (Emergency Only!)

```bash
# WARNING: This will DELETE all suggestion data!
psql -h localhost -U postgres -d FamilyTree -f 022_GovernanceModel_Rollback.sql
```

## New Tables

### RelationshipSuggestions

Main table for viewer suggestions.

| Column | Type | Description |
|--------|------|-------------|
| Id | uuid | Primary key |
| TownId | uuid | Town scope (FK to Towns) |
| TreeId | uuid | Tree scope (FK to Orgs) |
| Type | int | Suggestion type enum (0-7) |
| TargetPersonId | uuid | Person this suggestion relates to |
| SecondaryPersonId | uuid | Second person (for merge suggestions) |
| ProposedValuesJson | jsonb | Proposed field values |
| Status | int | Workflow status enum (0-4) |
| SubmittedByUserId | bigint | Who submitted (FK to AspNetUsers) |
| ReviewedByUserId | bigint | Who reviewed (FK to AspNetUsers) |
| AppliedEntityId | uuid | Entity created/modified on approval |
| PreviousValuesJson | jsonb | Snapshot for rollback |

### SuggestionEvidence

Evidence attachments for suggestions.

| Column | Type | Description |
|--------|------|-------------|
| Id | uuid | Primary key |
| SuggestionId | uuid | FK to RelationshipSuggestions |
| Type | int | Evidence type enum (0-5) |
| MediaId | uuid | FK to MediaFiles (for uploads) |
| Url | varchar(2000) | URL for web evidence |
| Description | varchar(500) | Description of evidence |

### SuggestionComments

Conversation thread between submitter and reviewers.

| Column | Type | Description |
|--------|------|-------------|
| Id | uuid | Primary key |
| SuggestionId | uuid | FK to RelationshipSuggestions |
| AuthorUserId | bigint | FK to AspNetUsers |
| Content | varchar(2000) | Comment text |
| IsAdminComment | boolean | TRUE if from admin |

## Enums

### SuggestionType (int)
- 0 = AddPerson
- 1 = UpdatePerson
- 2 = AddParent
- 3 = AddChild
- 4 = AddSpouse
- 5 = RemoveRelationship
- 6 = MergePerson
- 7 = SplitPerson

### SuggestionStatus (int)
- 0 = Pending
- 1 = Approved
- 2 = Rejected
- 3 = NeedsInfo
- 4 = Withdrawn

### ConfidenceLevel (int)
- 0 = Certain
- 1 = Probable
- 2 = Possible
- 3 = Uncertain

### EvidenceType (int)
- 0 = Photo
- 1 = Document
- 2 = Audio
- 3 = Video
- 4 = Url
- 5 = OtherMedia

## Helper Views

### vw_pending_suggestions_by_town
Aggregates pending suggestion counts by town for admin dashboard.

### vw_suggestion_queue
Detailed suggestion view with joined data for admin queue.

## Helper Functions

### fn_get_suggestion_statistics(town_id, tree_id, user_id)
Returns suggestion statistics (counts by status, avg review time, etc.)

### fn_check_duplicate_suggestion(tree_id, type, target_person_id, secondary_person_id)
Checks if a similar pending suggestion already exists.

## Modified Tables

### AspNetUsers
- Added: `SelectedTownId` (uuid, FK to Towns)
- Added: `IsFirstLogin` (boolean, default TRUE)

### People, ParentChildren, Unions, UnionMembers
- Added: `IsDeleted` (boolean, default FALSE)
- Added: `DeletedAt` (timestamp)
- Added: `DeletedByUserId` (bigint, FK to AspNetUsers)

### AuditLogs
- Added: `SuggestionId` (uuid, FK to RelationshipSuggestions)
- Added: `PreviousValuesJson` (jsonb)
- Added: `NewValuesJson` (jsonb)
