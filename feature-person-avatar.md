# Feature: Person Avatar (Profile Picture)

## Requirement

Each Person can have ONE avatar/profile picture. Should follow the existing media file patterns in the codebase.

---

## Step 1: Explore Existing Media Patterns (DO THIS FIRST)

### Frontend - Find and read these files:

```bash
# Find media-related services
find src -name "*.service.ts" | xargs grep -l -i "media\|upload\|file" 

# Find media components
find src -name "*.component.ts" | xargs grep -l -i "media\|upload\|image"

# Find media models/interfaces
find src -name "*.ts" | xargs grep -l "MediaFile\|IMedia\|MediaDto"

# Find how images are displayed
grep -rn "thumbnailPath\|StorageKey\|base64" --include="*.ts" --include="*.html" src/

# Find API endpoints for media
grep -rn "/api/media\|/api/.*upload" --include="*.ts" src/
```

### Backend - Verify existing services:

```bash
# Find MediaService
find . -name "MediaService.cs" -o -name "IMediaService.cs"

# Find file storage service
find . -name "*FileStorage*.cs" -o -name "*Storage*.cs"

# Find media controller
find . -name "*MediaController*.cs"

# Check Person model
grep -n "Avatar\|Media" Models/Person.cs
```

---

## Step 2: Database Changes

Add `AvatarMediaId` column to People table:

### Migration

```csharp
public partial class AddPersonAvatar : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "AvatarMediaId",
            table: "People",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_People_AvatarMediaId",
            table: "People",
            column: "AvatarMediaId");

        migrationBuilder.AddForeignKey(
            name: "FK_People_MediaFiles_AvatarMediaId",
            table: "People",
            column: "AvatarMediaId",
            principalTable: "MediaFiles",
            principalColumn: "Id",
            onDelete: ReferentialAction.SetNull);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_People_MediaFiles_AvatarMediaId",
            table: "People");

        migrationBuilder.DropIndex(
            name: "IX_People_AvatarMediaId",
            table: "People");

        migrationBuilder.DropColumn(
            name: "AvatarMediaId",
            table: "People");
    }
}
```

### Or Raw SQL

```sql
ALTER TABLE "People" ADD COLUMN "AvatarMediaId" uuid NULL;

CREATE INDEX "IX_People_AvatarMediaId" ON "People" ("AvatarMediaId");

ALTER TABLE "People" ADD CONSTRAINT "FK_People_MediaFiles_AvatarMediaId" 
FOREIGN KEY ("AvatarMediaId") REFERENCES "MediaFiles"("Id") ON DELETE SET NULL;
```

---

## Step 3: Update Person Model

```csharp
// In Models/Person.cs - add these properties
public Guid? AvatarMediaId { get; set; }

// Navigation property
public MediaFile? Avatar { get; set; }
```

---

## Step 4: Backend API Endpoints

Add to `PeopleController.cs` (or create separate controller):

```csharp
/// <summary>
/// Upload avatar for a person
/// </summary>
[HttpPost("{personId}/avatar")]
public async Task<ActionResult<AvatarDto>> UploadAvatar(
    Guid personId, 
    [FromBody] UploadAvatarDto dto)
{
    var result = await _personService.UploadAvatarAsync(personId, dto, GetUserContext());
    
    if (!result.IsSuccess)
        return StatusCode(result.StatusCode, result.Error);
    
    return Ok(result.Data);
}

/// <summary>
/// Get avatar for a person
/// </summary>
[HttpGet("{personId}/avatar")]
public async Task<ActionResult<AvatarDto>> GetAvatar(Guid personId)
{
    var result = await _personService.GetAvatarAsync(personId);
    
    if (!result.IsSuccess)
        return StatusCode(result.StatusCode, result.Error);
    
    return Ok(result.Data);
}

/// <summary>
/// Delete avatar for a person
/// </summary>
[HttpDelete("{personId}/avatar")]
public async Task<ActionResult> DeleteAvatar(Guid personId)
{
    var result = await _personService.DeleteAvatarAsync(personId, GetUserContext());
    
    if (!result.IsSuccess)
        return StatusCode(result.StatusCode, result.Error);
    
    return NoContent();
}
```

---

## Step 5: PersonService Avatar Methods

Add to `PersonService.cs` (use existing `IMediaService`):

```csharp
public async Task<ServiceResult<AvatarDto>> UploadAvatarAsync(
    Guid personId,
    UploadAvatarDto dto,
    UserContext userContext)
{
    // 1. Validate person exists
    var person = await _context.People.FindAsync(personId);
    if (person == null)
        return ServiceResult<AvatarDto>.NotFound("Person not found");

    // 2. Check permission
    if (!userContext.CanEdit())
        return ServiceResult<AvatarDto>.Forbidden("No permission to upload avatar");

    // 3. Validate file type (images only)
    var allowedTypes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp" };
    if (!allowedTypes.Contains(dto.MimeType.ToLower()))
        return ServiceResult<AvatarDto>.Failure("Only image files allowed for avatar");

    // 4. Delete old avatar if exists
    if (person.AvatarMediaId.HasValue)
    {
        await _mediaService.DeleteMediaAsync(person.AvatarMediaId.Value);
    }

    // 5. Upload new avatar using existing MediaService
    var media = await _mediaService.UploadMediaAsync(
        personId,
        dto.Base64Data,
        dto.FileName,
        dto.MimeType,
        "Avatar",           // title
        null,               // description
        null                // copyright
    );

    if (media == null)
        return ServiceResult<AvatarDto>.InternalError("Failed to upload avatar");

    // 6. Update person with new avatar
    person.AvatarMediaId = media.Id;
    person.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    _logger.LogInformation("Avatar uploaded for person {PersonId}", personId);

    return ServiceResult<AvatarDto>.Success(new AvatarDto
    {
        MediaId = media.Id,
        ThumbnailPath = media.ThumbnailPath,
        FileName = media.FileName,
        MimeType = media.MimeType
    });
}

public async Task<ServiceResult<AvatarDto>> GetAvatarAsync(Guid personId)
{
    var person = await _context.People
        .Include(p => p.Avatar)
        .FirstOrDefaultAsync(p => p.Id == personId);

    if (person == null)
        return ServiceResult<AvatarDto>.NotFound("Person not found");

    if (person.Avatar == null)
        return ServiceResult<AvatarDto>.Success(null); // No avatar

    return ServiceResult<AvatarDto>.Success(new AvatarDto
    {
        MediaId = person.Avatar.Id,
        ThumbnailPath = person.Avatar.ThumbnailPath,
        FileName = person.Avatar.FileName,
        MimeType = person.Avatar.MimeType
    });
}

public async Task<ServiceResult> DeleteAvatarAsync(Guid personId, UserContext userContext)
{
    if (!userContext.CanEdit())
        return ServiceResult.Forbidden("No permission to delete avatar");

    var person = await _context.People.FindAsync(personId);
    if (person == null)
        return ServiceResult.NotFound("Person not found");

    if (!person.AvatarMediaId.HasValue)
        return ServiceResult.Success(); // No avatar to delete

    // Delete media file
    await _mediaService.DeleteMediaAsync(person.AvatarMediaId.Value);

    // Clear reference
    person.AvatarMediaId = null;
    person.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    _logger.LogInformation("Avatar deleted for person {PersonId}", personId);

    return ServiceResult.Success();
}
```

---

## Step 6: DTOs

```csharp
// DTOs/UploadAvatarDto.cs
public class UploadAvatarDto
{
    public string Base64Data { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
}

// DTOs/AvatarDto.cs
public class AvatarDto
{
    public Guid MediaId { get; set; }
    public string? ThumbnailPath { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? MimeType { get; set; }
}
```

---

## Step 7: Update PersonDto to Include Avatar

```csharp
// In PersonDto or PersonDetailDto - add:
public AvatarDto? Avatar { get; set; }

// Or just the URL:
public string? AvatarUrl { get; set; }
```

Update the mapping to include avatar:

```csharp
// When mapping Person to PersonDto
AvatarUrl = person.Avatar?.ThumbnailPath
```

---

## Step 8: Frontend Service

Add to existing `people.service.ts` or `media.service.ts`:

```typescript
// In people.service.ts
uploadAvatar(personId: string, file: File): Observable<AvatarDto> {
  return this.convertToBase64(file).pipe(
    switchMap(base64 => {
      const dto = {
        base64Data: base64,
        fileName: file.name,
        mimeType: file.type
      };
      return this.http.post<AvatarDto>(`/api/people/${personId}/avatar`, dto);
    })
  );
}

getAvatar(personId: string): Observable<AvatarDto | null> {
  return this.http.get<AvatarDto | null>(`/api/people/${personId}/avatar`);
}

deleteAvatar(personId: string): Observable<void> {
  return this.http.delete<void>(`/api/people/${personId}/avatar`);
}

private convertToBase64(file: File): Observable<string> {
  return new Observable(observer => {
    const reader = new FileReader();
    reader.onload = () => {
      observer.next(reader.result as string);
      observer.complete();
    };
    reader.onerror = error => observer.error(error);
    reader.readAsDataURL(file);
  });
}
```

---

## Step 9: Frontend Avatar Component

Create reusable avatar component:

```typescript
// person-avatar.component.ts
@Component({
  selector: 'app-person-avatar',
  templateUrl: './person-avatar.component.html',
  styleUrls: ['./person-avatar.component.scss']
})
export class PersonAvatarComponent {
  @Input() person: any;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() editable = false;
  
  @Output() avatarChanged = new EventEmitter<void>();

  uploading = false;

  constructor(
    private peopleService: PeopleService,
    private snackBar: MatSnackBar
  ) {}

  get avatarUrl(): string | null {
    return this.person?.avatarUrl || this.person?.avatar?.thumbnailPath || null;
  }

  get initials(): string {
    const name = this.person?.primaryName || this.person?.nameEnglish || '';
    return name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    
    // Validate
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Please select an image file', 'Close', { duration: 3000 });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
      this.snackBar.open('Image must be less than 5MB', 'Close', { duration: 3000 });
      return;
    }

    this.uploading = true;
    this.peopleService.uploadAvatar(this.person.id, file).subscribe({
      next: (avatar) => {
        this.person.avatarUrl = avatar.thumbnailPath;
        this.uploading = false;
        this.avatarChanged.emit();
        this.snackBar.open('Avatar updated', 'Close', { duration: 2000 });
      },
      error: () => {
        this.uploading = false;
        this.snackBar.open('Failed to upload avatar', 'Close', { duration: 3000 });
      }
    });
  }

  removeAvatar() {
    this.peopleService.deleteAvatar(this.person.id).subscribe({
      next: () => {
        this.person.avatarUrl = null;
        this.avatarChanged.emit();
        this.snackBar.open('Avatar removed', 'Close', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Failed to remove avatar', 'Close', { duration: 3000 });
      }
    });
  }
}
```

```html
<!-- person-avatar.component.html -->
<div class="avatar-container" [ngClass]="size">
  <!-- Avatar Image or Initials -->
  <div class="avatar" [class.has-image]="avatarUrl">
    <img *ngIf="avatarUrl" [src]="avatarUrl" [alt]="person?.primaryName">
    <span *ngIf="!avatarUrl" class="initials">{{ initials }}</span>
    
    <!-- Loading Overlay -->
    <div *ngIf="uploading" class="loading-overlay">
      <mat-spinner diameter="24"></mat-spinner>
    </div>
  </div>

  <!-- Edit Controls -->
  <div *ngIf="editable" class="avatar-controls">
    <input type="file" #fileInput accept="image/*" (change)="onFileSelected($event)" hidden>
    
    <button mat-icon-button (click)="fileInput.click()" [disabled]="uploading" matTooltip="Change photo">
      <mat-icon>camera_alt</mat-icon>
    </button>
    
    <button *ngIf="avatarUrl" mat-icon-button (click)="removeAvatar()" [disabled]="uploading" 
            matTooltip="Remove photo" color="warn">
      <mat-icon>delete</mat-icon>
    </button>
  </div>
</div>
```

```scss
// person-avatar.component.scss
.avatar-container {
  position: relative;
  display: inline-block;
  
  &.small .avatar { width: 32px; height: 32px; font-size: 12px; }
  &.medium .avatar { width: 64px; height: 64px; font-size: 20px; }
  &.large .avatar { width: 120px; height: 120px; font-size: 36px; }
}

.avatar {
  border-radius: 50%;
  background-color: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .initials {
    color: #666;
    font-weight: 500;
  }
  
  .loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.avatar-controls {
  position: absolute;
  bottom: -8px;
  right: -8px;
  display: flex;
  gap: 4px;
  
  button {
    transform: scale(0.8);
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
}
```

---

## Step 10: Usage in Person Detail Page

```html
<!-- In person-detail.component.html -->
<div class="person-header">
  <app-person-avatar 
    [person]="person" 
    size="large" 
    [editable]="canEdit"
    (avatarChanged)="loadPerson()">
  </app-person-avatar>
  
  <div class="person-info">
    <h1>{{ getPersonDisplayName(person) }}</h1>
    <!-- ... other info -->
  </div>
</div>
```

---

## Step 11: Show Avatar in Tree Nodes (Optional)

Update tree node template to show small avatar:

```html
<!-- In family-tree node template -->
<div class="tree-node">
  <app-person-avatar [person]="node" size="small"></app-person-avatar>
  <span class="name">{{ node.name }}</span>
</div>
```

---

## Summary

| Component | Change |
|-----------|--------|
| **Database** | Add `AvatarMediaId` to People table |
| **Person Model** | Add `AvatarMediaId` and `Avatar` navigation |
| **PersonService** | Add Upload/Get/Delete avatar methods |
| **PeopleController** | Add 3 endpoints: POST/GET/DELETE avatar |
| **Frontend Service** | Add avatar methods to PeopleService |
| **Avatar Component** | Reusable component with upload/delete |
| **Person Detail** | Show large editable avatar |
| **Tree Nodes** | Show small avatar (optional) |
| **Search Results** | Show avatar in results (optional) |

## API Endpoints

```
POST   /api/people/{personId}/avatar  - Upload avatar (Base64)
GET    /api/people/{personId}/avatar  - Get avatar info
DELETE /api/people/{personId}/avatar  - Remove avatar
```
