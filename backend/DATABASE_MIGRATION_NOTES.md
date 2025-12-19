# Database Migration Notes

## Required Schema Changes for Place.OrgId

### What Changed
Added `OrgId` column to `Place` model for multi-tenant security.

### Migration Steps (Visual Studio 2022)

#### Option 1: Using EF Core Migrations (Recommended)
```bash
# In Package Manager Console or Terminal
dotnet ef migrations add AddOrgIdToPlace
dotnet ef database update
```

#### Option 2: Manual SQL (if EF CLI unavailable)
```sql
-- Add OrgId column to Places table
ALTER TABLE "Places" 
ADD COLUMN "OrgId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add foreign key constraint
ALTER TABLE "Places"
ADD CONSTRAINT "FK_Places_Orgs_OrgId" 
FOREIGN KEY ("OrgId") REFERENCES "Orgs"("Id") ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX "IX_Places_OrgId_Name" ON "Places" ("OrgId", "Name");

-- Update existing Places to belong to first org (if any exist)
UPDATE "Places" 
SET "OrgId" = (SELECT "Id" FROM "Orgs" LIMIT 1)
WHERE "OrgId" = '00000000-0000-0000-0000-000000000000';
```

### Updated Models
- **Place.cs**: Added `OrgId` property and `Org` navigation property
- **Org.cs**: Added `Places` collection
- **ApplicationDbContext.cs**: Configured Place-Org relationship

### Security Impact
- All Place queries now require org-scoping
- UnionController validates Place.OrgId matches user's OrgId
- Prevents cross-tenant data leakage through place references
