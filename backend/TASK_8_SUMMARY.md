# Task 8: Union/Marriage and ParentChild Relationship APIs

## Completed Features

### 1. Union/Marriage API (`UnionController.cs`)
**Endpoints:**
- `GET /api/union` - Search unions with filters (type, person, dates, place)
- `GET /api/union/{id}` - Get union details with all members
- `POST /api/union` - Create union with members
- `PUT /api/union/{id}` - Update union details
- `DELETE /api/union/{id}` - Delete union
- `POST /api/union/{id}/members` - Add member to union
- `DELETE /api/union/{unionId}/members/{personId}` - Remove member from union

**Features:**
- Multi-tenant security (org-scoped)
- Date validation (end date cannot be before start date)
- Place validation (must belong to same org)
- Member validation (all members must be from same org)
- Pagination support
- Supports polygamy (multiple concurrent unions)

**DTOs:**
- `CreateUnionRequest` - UnionType, dates, precision, places, member IDs
- `UpdateUnionRequest` - All fields nullable for partial updates
- `UnionResponse` - Full union details with member info
- `UnionSearchRequest` - Filter by type, person, dates, place

### 2. ParentChild Relationship API (`ParentChildController.cs`)
**Endpoints:**
- `GET /api/parentchild/person/{personId}` - Get all relationships for a person
- `GET /api/parentchild/{id}` - Get specific relationship
- `POST /api/parentchild` - Create parent-child relationship
- `PUT /api/parentchild/{id}` - Update relationship type
- `DELETE /api/parentchild/{id}` - Delete relationship

**Features:**
- **Cycle detection**: Prevents creating relationships that would create loops
- **Date validation**: Warns if parent birth date < 10 years before child
- **Duplicate prevention**: Cannot create same parent-child pair twice
- Multi-tenant security (org-scoped)
- RelationshipType enum support (Biological, Adopted, Foster, Step, Guardian)

**DTOs:**
- `CreateParentChildRequest` - Parent ID, child ID, relationship type
- `UpdateParentChildRequest` - Relationship type only
- `ParentChildResponse` - Full relationship with person names
- `PersonRelationshipsResponse` - All relationships for a person (as parent, as child, unions)

### 3. Enums Used
**UnionType:**
- Marriage (0)
- CivilUnion (1)
- DomesticPartnership (2)
- Engagement (3)
- Informal (4)

**DatePrecision:**
- Unknown (0)
- Year (1)
- Exact (2)
- Before (3)
- After (4)
- Circa (5)

**RelationshipType:**
- Biological (0)
- Adopted (1)
- Foster (2)
- Step (3)
- Guardian (4)

## Multi-Tenant Security

### Implemented Safeguards:
1. **Union API:**
   - All queries filtered by `OrgId`
   - Place validation: `Place.OrgId == user.OrgId`
   - Member validation: All union members must be from same org
   - Cross-org union creation blocked

2. **ParentChild API:**
   - All queries filtered by both parent and child `OrgId`
   - Prevents cross-org relationships
   - Cycle detection operates within org boundary

3. **Place Model Changes:**
   - Added `OrgId` property for multi-tenant isolation
   - Updated `ApplicationDbContext` with Place-Org relationship
   - See `DATABASE_MIGRATION_NOTES.md` for migration steps

## Validation Rules

### Union Validation:
- End date must be after start date
- Start/end places must belong to user's org
- All members must belong to user's org
- Members cannot be duplicated in same union

### ParentChild Validation:
- Person cannot be their own parent
- Cannot create duplicate parent-child relationships
- Cycle detection prevents creating loops in family tree
- Date sanity check (logs warning if parent < 10 years older than child)

## Role-Based Authorization

### Create Operations (POST):
- Owner, Admin, Editor, Contributor can create

### Update Operations (PUT):
- Owner, Admin, Editor can update

### Delete Operations (DELETE):
- Owner, Admin, Editor can delete

### Read Operations (GET):
- All authenticated users can read within their org

## Notes for Testing

### Sample Union Creation:
```json
POST /api/union
{
  "type": 0,
  "startDate": "2010-06-15T00:00:00Z",
  "startPrecision": 2,
  "memberIds": [
    "person-id-1",
    "person-id-2"
  ]
}
```

### Sample ParentChild Creation:
```json
POST /api/parentchild
{
  "parentId": "parent-person-id",
  "childId": "child-person-id",
  "relationshipType": 0
}
```

## Database Migration Required

Before running the application in Visual Studio, you must:

1. Add `OrgId` column to `Places` table
2. Add foreign key constraint from `Places.OrgId` to `Orgs.Id`
3. Create index on `(OrgId, Name)`

See `DATABASE_MIGRATION_NOTES.md` for complete SQL scripts and EF Core migration commands.
