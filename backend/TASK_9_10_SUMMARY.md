# Task 9 & 10: Media and Tree APIs

## Task 9: Media Upload API

### IStorageService Interface (Plug-in Pattern)
**File**: `Services/IStorageService.cs`

The Media API uses a plug-in pattern for cloud storage. Implement this interface with your preferred storage provider:

```csharp
public interface IStorageService
{
    Task<string> UploadFileAsync(string fileName, Stream stream, string contentType, Guid orgId);
    Task<(Stream stream, string contentType)> DownloadFileAsync(string fileUrl);
    Task DeleteFileAsync(string fileUrl);
    Task<string?> GenerateThumbnailAsync(string fileName, Stream stream, string contentType, Guid orgId, int maxWidth = 200, int maxHeight = 200);
}
```

**Storage Implementation Examples**:
- Azure Blob Storage
- AWS S3
- Google Cloud Storage
- Local filesystem (development)

**Register in Program.cs**:
```csharp
// Add before builder.Build()
builder.Services.AddScoped<IStorageService, YourStorageImplementation>();
```

### MediaController Endpoints

**GET /api/media** - Search media
- Query params: PersonId, Type, DateFrom, DateTo, PlaceId, SearchTerm, Page, PageSize
- Returns: Paginated media with thumbnails

**GET /api/media/{id}** - Get media details
- Returns: Full media metadata

**POST /api/media/upload** - Upload media file
- Form data: file (IFormFile) + metadata (MediaUploadRequest)
- Max file size: 50MB
- Allowed types:
  - Images: JPEG, PNG, GIF, WebP, HEIC
  - Videos: MP4, WebM, QuickTime
  - Audio: MP3, WAV, OGG
  - Documents: PDF, DOC, DOCX
- Auto-generates thumbnails for images
- Returns: Created media response

**PUT /api/media/{id}** - Update media metadata
- Body: MediaUpdateRequest (title, description, date, place, person)
- Roles: Owner, Admin, Editor

**DELETE /api/media/{id}** - Delete media
- Deletes file from storage and database record
- Roles: Owner, Admin, Editor

**GET /api/media/{id}/download** - Download media file
- Returns: File stream with proper content type

### Security Features
- Multi-tenant isolation (org-scoped queries)
- File type validation
- File size limits (50MB)
- Person/Place validation (must belong to org)
- Role-based authorization

---

## Task 10: Tree Visualization API

### TreeController Endpoints

**POST /api/tree/pedigree** - Get pedigree (ancestor) tree
- Body: `{ PersonId, Generations (default 4), IncludeSpouses }`
- Returns: Tree structure with ancestors
- Lazy loading: `HasMoreAncestors` flag indicates expandable nodes

**POST /api/tree/descendants** - Get descendant tree
- Body: `{ PersonId, Generations (default 3), IncludeSpouses }`
- Returns: Tree structure with descendants
- Lazy loading: `HasMoreDescendants` flag indicates expandable nodes

**POST /api/tree/hourglass** - Get hourglass view (ancestors + descendants)
- Body: `{ PersonId, AncestorGenerations, DescendantGenerations, IncludeSpouses }`
- Returns: Combined ancestor/descendant view centered on person

**POST /api/tree/ancestor-path** - Find path between person and ancestor
- Body: `{ PersonId, AncestorId }`
- Returns: List of people in path with relationships
- Example: Self → Parent → Grandparent → Great-Grandparent

**POST /api/tree/relationship** - Calculate relationship between two people
- Body: `{ Person1Id, Person2Id }`
- Returns: Relationship text + common ancestors
- Examples: "Sibling", "1st Cousin", "2nd Cousin 1x Removed", "Great Uncle/Aunt"

### Tree Node Structure

**TreePersonNode**:
```json
{
  "id": "guid",
  "primaryName": "John Smith",
  "sex": 0,
  "birthDate": "1950-01-15",
  "birthPlace": "New York",
  "deathDate": null,
  "isLiving": true,
  "thumbnailUrl": "https://...",
  "parents": [],
  "children": [],
  "unions": [],
  "hasMoreAncestors": false,
  "hasMoreDescendants": true
}
```

**TreeUnionNode**:
```json
{
  "id": "guid",
  "type": 0,
  "startDate": "2010-06-15",
  "startPlace": "Chicago",
  "partners": [],
  "children": []
}
```

### Lazy Loading Strategy
- Client requests initial tree with N generations
- Backend returns tree with `HasMoreAncestors`/`HasMoreDescendants` flags
- Client can expand individual nodes by requesting additional generations
- Prevents loading entire tree at once for large families

### Relationship Calculation Algorithm
1. Find all ancestors for both persons
2. Identify common ancestors
3. Calculate generation distance from each person
4. Apply relationship rules:
   - Same generation (gen1 == gen2): Siblings, Cousins
   - Different generations: Parent/Child, Uncle/Aunt, Removed cousins
   - Special cases: Grandparents, Great-grandparents

### Performance Considerations
- BFS (breadth-first search) for ancestor/descendant queries
- Visited set prevents infinite loops
- Includes only Primary names for performance
- Thumbnail URLs included (first image only)
- Lazy loading prevents over-fetching

---

## Integration Notes

### Program.cs Registration Required
```csharp
// Add storage service (Task 9)
builder.Services.AddScoped<IStorageService, YourStorageImplementation>();

// Controllers already registered via AddControllers()
```

### Multi-Tenant Security
- All tree queries are org-scoped
- Media files isolated by OrgId in storage path
- Cross-org relationships automatically filtered out

### Frontend Integration Tips
1. **Pedigree View**: Start with 4 generations, lazy load on node click
2. **Descendant View**: Start with 3 generations, expand families on demand
3. **Hourglass View**: Show 3 ancestors + 2 descendants for balance
4. **Relationship Calculator**: Use for "How am I related to X?" feature
5. **Media Gallery**: Display thumbnails in grid, lazy load on scroll

---

## Testing Checklist

### Media API
- [ ] Upload image → verify thumbnail generated
- [ ] Upload video → verify no thumbnail
- [ ] Update media metadata → verify person/place validation
- [ ] Delete media → verify storage cleanup
- [ ] Search by person → verify org isolation
- [ ] Download media → verify correct content type

### Tree API
- [ ] Pedigree → verify 4 generations of ancestors
- [ ] Descendants → verify children/grandchildren
- [ ] Hourglass → verify both directions
- [ ] Ancestor path → verify path calculation
- [ ] Relationship → verify sibling/cousin detection
- [ ] Lazy loading → verify flags set correctly

---

## Next Steps
- **Task 11**: Initialize Angular 20 frontend
- **Task 12**: Setup i18n (English, Arabic, Nobiin)
- **Task 13**: Authentication module (login/register)
