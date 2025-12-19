# Family Tree Platform - Integration Guide for Your Baseline Application

## Overview
This guide explains how to integrate the Family Tree genealogy features into your existing Nobiin Dictionary baseline application that already uses ASP.NET Identity with `uint` user IDs.

## Key Differences Between Your Baseline and Family Tree Code

| Component | Your Baseline | Family Tree (as built) | Action Needed |
|-----------|---------------|------------------------|---------------|
| User ID Type | `uint` (32-bit) | `long` (64-bit) | ✅ Update Family Tree to use `uint` |
| Identity User Model | `AspNetUser` | `ApplicationUser` | ✅ Use your existing `AspNetUser` |
| DbContext | `ApplicationDbContext` | `ApplicationDbContext` | ✅ Merge entity sets |
| Database | FamilyTree (PostgreSQL) | FamilyTree | ✅ Already compatible |
| JWT Setup | Custom config in appsettings | Simplified | ✅ Keep your existing JWT setup |
| Storage Service | Factory pattern with multiple providers | Simple interface | ✅ Already have IStorageService |

## Step 1: Update Family Tree Models for `uint` User IDs

### 1.1 Update OrgUser.cs
```csharp
// backend/FamilyTreeApi/Models/OrgUser.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FamilyTreeApi.Models;

public class OrgUser
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrgId { get; set; }

    [ForeignKey(nameof(OrgId))]
    public Org Org { get; set; } = null!;

    [Required]
    public uint UserId { get; set; }  // ✅ Changed from long to uint

    [ForeignKey(nameof(UserId))]
    public AspNetUser User { get; set; } = null!;  // ✅ Changed from ApplicationUser

    [Required]
    public OrgRole Role { get; set; } = OrgRole.Viewer;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
```

### 1.2 Update AuditLog.cs
```csharp
// backend/FamilyTreeApi/Models/AuditLog.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FamilyTreeApi.Models;

public class AuditLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public uint ActorId { get; set; }  // ✅ Changed from long to uint

    [ForeignKey(nameof(ActorId))]
    public AspNetUser Actor { get; set; } = null!;  // ✅ Changed from ApplicationUser

    [Required]
    [StringLength(100)]
    public string EntityType { get; set; } = string.Empty;

    [Required]
    public Guid EntityId { get; set; }

    [Required]
    [StringLength(50)]
    public string Action { get; set; } = string.Empty;

    public string? ChangeJson { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
```

## Step 2: Add Family Tree Entities to Your ApplicationDbContext

```csharp
// In your existing ApplicationDbContext.cs
public class ApplicationDbContext : IdentityDbContext<AspNetUser, AspNetRole, uint>
{
    // Your existing DbSets (Dictionary entities)
    // ... existing code ...

    // ✅ ADD FAMILY TREE ENTITIES
    public DbSet<Org> Orgs { get; set; }
    public DbSet<OrgUser> OrgUsers { get; set; }
    public DbSet<Place> Places { get; set; }
    public DbSet<Person> People { get; set; }
    public DbSet<PersonName> PersonNames { get; set; }
    public DbSet<Union> Unions { get; set; }
    public DbSet<UnionMember> UnionMembers { get; set; }
    public DbSet<ParentChild> ParentChildren { get; set; }
    public DbSet<MediaFile> MediaFiles { get; set; }
    public DbSet<Source> Sources { get; set; }
    public DbSet<Tag> Tags { get; set; }
    public DbSet<PersonTag> PersonTags { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }

    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Your existing model configuration
        // ... existing code ...

        // ✅ ADD FAMILY TREE CONFIGURATION
        ConfigureFamilyTreeEntities(modelBuilder);
    }

    private void ConfigureFamilyTreeEntities(ModelBuilder modelBuilder)
    {
        // Org
        modelBuilder.Entity<Org>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.HasIndex(e => e.Name);
        });

        // OrgUser (Junction table)
        modelBuilder.Entity<OrgUser>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.OrgId, e.UserId }).IsUnique();
            
            entity.HasOne(e => e.Org)
                .WithMany()
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Place
        modelBuilder.Entity<Place>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.HasIndex(e => new { e.OrgId, e.Name });

            entity.HasOne(e => e.Org)
                .WithMany()
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Parent)
                .WithMany()
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Person
        modelBuilder.Entity<Person>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PrimaryName).HasMaxLength(200);
            entity.HasIndex(e => e.OrgId);
            entity.HasIndex(e => e.PrimaryName);

            entity.HasOne(e => e.Org)
                .WithMany()
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.BirthPlace)
                .WithMany()
                .HasForeignKey(e => e.BirthPlaceId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.DeathPlace)
                .WithMany()
                .HasForeignKey(e => e.DeathPlaceId)
                .OnDelete(DeleteBehavior.SetNull);

            // Full-text search (PostgreSQL specific)
            entity.Property(e => e.SearchVector)
                .HasColumnType("tsvector")
                .HasComputedColumnSql(
                    "to_tsvector('english', COALESCE(\"PrimaryName\", '') || ' ' || COALESCE(\"Occupation\", '') || ' ' || COALESCE(\"Notes\", ''))",
                    stored: true);

            entity.HasIndex(e => e.SearchVector).HasMethod("GIN");
        });

        // PersonName
        modelBuilder.Entity<PersonName>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.PersonId);
            entity.HasIndex(e => e.Full).HasMethod("GIN").HasOperators("gin_trgm_ops");
            entity.HasIndex(e => e.Given).HasMethod("GIN").HasOperators("gin_trgm_ops");
            entity.HasIndex(e => e.Family).HasMethod("GIN").HasOperators("gin_trgm_ops");

            entity.HasOne(e => e.Person)
                .WithMany(p => p.Names)
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Union
        modelBuilder.Entity<Union>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrgId);

            entity.HasOne(e => e.StartPlace)
                .WithMany()
                .HasForeignKey(e => e.StartPlaceId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.EndPlace)
                .WithMany()
                .HasForeignKey(e => e.EndPlaceId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // UnionMember
        modelBuilder.Entity<UnionMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.UnionId, e.PersonId }).IsUnique();

            entity.HasOne(e => e.Union)
                .WithMany(u => u.Members)
                .HasForeignKey(e => e.UnionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Person)
                .WithMany()
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ParentChild
        modelBuilder.Entity<ParentChild>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.ParentId);
            entity.HasIndex(e => e.ChildId);
            entity.HasIndex(e => new { e.ParentId, e.ChildId, e.RelationshipType }).IsUnique();

            entity.HasOne(e => e.Parent)
                .WithMany()
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Child)
                .WithMany()
                .HasForeignKey(e => e.ChildId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // MediaFile
        modelBuilder.Entity<MediaFile>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrgId);
            entity.HasIndex(e => e.StorageKey);

            entity.HasOne(e => e.Org)
                .WithMany()
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.CapturePlace)
                .WithMany()
                .HasForeignKey(e => e.CapturePlaceId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Source
        modelBuilder.Entity<Source>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrgId);
            entity.HasIndex(e => e.Title);
        });

        // Tag
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.OrgId, e.Name }).IsUnique();
        });

        // PersonTag
        modelBuilder.Entity<PersonTag>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.PersonId, e.TagId }).IsUnique();

            entity.HasOne(e => e.Person)
                .WithMany()
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Tag)
                .WithMany()
                .HasForeignKey(e => e.TagId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // AuditLog
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.ActorId);
            entity.HasIndex(e => new { e.EntityType, e.EntityId });
            entity.HasIndex(e => e.Timestamp);

            entity.HasOne(e => e.Actor)
                .WithMany()
                .HasForeignKey(e => e.ActorId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
```

## Step 3: Update Controllers to Use `uint` User IDs

All Family Tree controllers need a helper method to extract `uint` user IDs from JWT claims:

```csharp
// In each controller (PersonController, UnionController, etc.)
private uint GetUserId()
{
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? throw new UnauthorizedAccessException("User ID not found in token");

    return uint.Parse(userIdClaim);  // ✅ Parse as uint, not long
}
```

## Step 4: Update appsettings.json (Add Family Tree Section)

Add Family Tree specific configuration to your existing appsettings.json:

```json
{
  "ConnectionStrings": {
    "default": "User ID=xxx;Password=yyyyy;Host=yyyyyy;Port=5432;Database=FamilyTree;...",
    "redis": "..."
  },
  
  // ... your existing Serilog, Redis, JWT, Identity, etc. ...

  "FamilyTreeSettings": {
    "DefaultOrganizationName": "Smith Family Tree",
    "AllowPublicRegistration": true,
    "MaxMediaFileSizeMB": 50,
    "SupportedLanguages": ["en", "ar", "nob"],
    "DefaultLanguage": "en"
  }
}
```

## Step 5: Register Family Tree Services in Program.cs

Add these services to your existing `Program.cs`:

```csharp
// After your existing services.AddNobiinDictionaryServices();

// ✅ ADD FAMILY TREE SERVICES
services.AddScoped<IPersonService, PersonService>();
services.AddScoped<IUnionService, UnionService>();
services.AddScoped<IParentChildService, ParentChildService>();
services.AddScoped<ITreeService, TreeService>();
// MediaService already registered in your baseline as IMediaService
```

## Step 6: Create EF Core Migration

```bash
cd backend/FamilyTreeApi
dotnet ef migrations add AddFamilyTreeEntities
dotnet ef database update
```

## Step 7: Update CREATE_DATABASE.sql for Your Setup

Replace the Identity section in `CREATE_DATABASE.sql` to match your `uint` setup:

```sql
-- ASP.NET Identity with UINT (INTEGER) IDs
CREATE TABLE "AspNetUsers" (
    "Id" INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,  -- ✅ INTEGER for uint
    "UserName" VARCHAR(256),
    "NormalizedUserName" VARCHAR(256),
    "Email" VARCHAR(256),
    -- ... rest of Identity fields
);

-- OrgUsers with INTEGER UserId
CREATE TABLE "OrgUsers" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "OrgId" UUID NOT NULL,
    "UserId" INTEGER NOT NULL,  -- ✅ INTEGER for uint
    "Role" INTEGER NOT NULL DEFAULT 0,
    "JoinedAt" TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    
    CONSTRAINT "FK_OrgUsers_Orgs" FOREIGN KEY ("OrgId") 
        REFERENCES "Orgs" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_OrgUsers_AspNetUsers" FOREIGN KEY ("UserId") 
        REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE
);

-- AuditLogs with INTEGER ActorId
CREATE TABLE "AuditLogs" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ActorId" INTEGER NOT NULL,  -- ✅ INTEGER for uint
    -- ... rest of fields
    
    CONSTRAINT "FK_AuditLogs_AspNetUsers" FOREIGN KEY ("ActorId") 
        REFERENCES "AspNetUsers" ("Id") ON DELETE RESTRICT
);
```

## Key Differences Summary

### ✅ Changes Made for Integration:
1. **User ID Type**: Changed from `long` (int64) → `uint` (uint32/INTEGER)
2. **User Model**: Changed from `ApplicationUser` → `AspNetUser` (your existing model)
3. **DbContext**: Merge Family Tree entities into your existing `ApplicationDbContext`
4. **JWT Configuration**: Keep your existing comprehensive JWT setup
5. **Storage Service**: Use your existing `IStorageService` factory pattern

### ✅ What Stays the Same:
- All Family Tree entities (Person, Union, ParentChild, etc.)
- All Family Tree DTOs and enums
- Controller logic (just update GetUserId() method)
- Service interfaces and implementations
- Database schema (except Identity ID types)

## Testing Checklist

- [ ] Build succeeds with no compilation errors
- [ ] EF Core migration generated successfully
- [ ] Database updated with Family Tree tables
- [ ] Identity tables have INTEGER IDs (not BIGINT)
- [ ] OrgUsers.UserId is INTEGER
- [ ] AuditLogs.ActorId is INTEGER
- [ ] JWT authentication works with existing setup
- [ ] Can create/retrieve persons via API
- [ ] Storage service works for media uploads

## Next Steps

1. Copy Family Tree model files to your project
2. Update `OrgUser.cs` and `AuditLog.cs` with `uint` types
3. Merge Family Tree entities into your `ApplicationDbContext`
4. Update controllers with `uint GetUserId()` helper
5. Run migration and test

Your existing Nobiin Dictionary features will continue to work alongside the new Family Tree features! 🎉
