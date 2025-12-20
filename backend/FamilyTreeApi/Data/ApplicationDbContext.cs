using FamilyTreeApi.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using NpgsqlTypes;

namespace FamilyTreeApi.Data;

public class ApplicationDbContext : IdentityDbContext<
    ApplicationUser,
    ApplicationRole,
    long,
    ApplicationUserClaim,
    ApplicationUserRole,
    ApplicationUserLogin,
    ApplicationRoleClaim,
    ApplicationUserToken>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<Town> Towns { get; set; }
    public DbSet<Org> Orgs { get; set; }
    public DbSet<OrgUser> OrgUsers { get; set; }
    public DbSet<Person> People { get; set; }
    public DbSet<PersonName> PersonNames { get; set; }
    public DbSet<Union> Unions { get; set; }
    public DbSet<UnionMember> UnionMembers { get; set; }
    public DbSet<ParentChild> ParentChildren { get; set; }
    public DbSet<Place> Places { get; set; }
    public DbSet<Media> MediaFiles { get; set; }
    public DbSet<Source> Sources { get; set; }
    public DbSet<Tag> Tags { get; set; }
    public DbSet<PersonTag> PersonTags { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }

    // New entities for multi-tree support
    public DbSet<PersonLink> PersonLinks { get; set; }
    public DbSet<AdminTreeAssignment> AdminTreeAssignments { get; set; }
    public DbSet<TreeInvitation> TreeInvitations { get; set; }
    public DbSet<PersonMedia> PersonMedia { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.HasPostgresExtension("pg_trgm");

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.HasMany(u => u.UserRoles)
                .WithOne(ur => ur.User)
                .HasForeignKey(ur => ur.UserId)
                .IsRequired();

            entity.HasMany(u => u.Claims)
                .WithOne(uc => uc.User)
                .HasForeignKey(uc => uc.UserId)
                .IsRequired();

            entity.HasMany(u => u.Logins)
                .WithOne(ul => ul.User)
                .HasForeignKey(ul => ul.UserId)
                .IsRequired();

            entity.HasMany(u => u.Tokens)
                .WithOne(ut => ut.User)
                .HasForeignKey(ut => ut.UserId)
                .IsRequired();
        });

        modelBuilder.Entity<ApplicationRole>(entity =>
        {
            entity.HasMany(r => r.UserRoles)
                .WithOne(ur => ur.Role)
                .HasForeignKey(ur => ur.RoleId)
                .IsRequired();

            entity.HasMany(r => r.RoleClaims)
                .WithOne(rc => rc.Role)
                .HasForeignKey(rc => rc.RoleId)
                .IsRequired();
        });

        modelBuilder.Entity<Town>(entity =>
        {
            entity.ToTable("Towns");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Name);
            entity.HasIndex(e => e.Country);
        });

        modelBuilder.Entity<Org>(entity =>
        {
            entity.ToTable("Orgs");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Name);
            entity.HasIndex(e => e.TownId);

            entity.Property(e => e.SettingsJson)
                .HasColumnType("jsonb");

            entity.HasOne(e => e.Town)
                .WithMany(t => t.FamilyTrees)
                .HasForeignKey(e => e.TownId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OrgUser>(entity =>
        {
            entity.ToTable("OrgUsers");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.OrgId, e.UserId }).IsUnique();

            entity.HasOne(e => e.Org)
                .WithMany(o => o.OrgUsers)
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                .WithMany(u => u.OrgUsers)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(e => e.UserId)
                .HasColumnName("UserId");
        });

        modelBuilder.Entity<Person>(entity =>
        {
            entity.ToTable("People");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrgId);
            entity.HasIndex(e => e.PrimaryName);

            entity.Property(p => p.SearchVector)
                .HasColumnType("tsvector")
                .HasComputedColumnSql("to_tsvector('english', coalesce(\"PrimaryName\",'') || ' ' || coalesce(\"Occupation\",'') || ' ' || coalesce(\"Notes\",''))", stored: true);

            entity.HasIndex(p => p.SearchVector)
                .HasMethod("GIN");

            entity.HasOne(e => e.Org)
                .WithMany(o => o.People)
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
        });

        modelBuilder.Entity<PersonName>(entity =>
        {
            entity.ToTable("PersonNames");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.PersonId);

            entity.HasIndex(e => e.Full)
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");

            entity.HasIndex(e => e.Given)
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");

            entity.HasIndex(e => e.Family)
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");

            entity.HasOne(e => e.Person)
                .WithMany(p => p.Names)
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Union>(entity =>
        {
            entity.ToTable("Unions");
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

        modelBuilder.Entity<UnionMember>(entity =>
        {
            entity.ToTable("UnionMembers");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.UnionId, e.PersonId }).IsUnique();

            entity.HasOne(e => e.Union)
                .WithMany(u => u.Members)
                .HasForeignKey(e => e.UnionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Person)
                .WithMany(p => p.UnionMemberships)
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ParentChild>(entity =>
        {
            entity.ToTable("ParentChildren");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.ParentId);
            entity.HasIndex(e => e.ChildId);
            entity.HasIndex(e => new { e.ParentId, e.ChildId, e.RelationshipType }).IsUnique();

            entity.HasOne(e => e.Parent)
                .WithMany(p => p.AsParent)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Child)
                .WithMany(p => p.AsChild)
                .HasForeignKey(e => e.ChildId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Place>(entity =>
        {
            entity.ToTable("Places");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.OrgId, e.Name });
            entity.HasIndex(e => e.ParentId);

            entity.Property(e => e.AltNamesJson)
                .HasColumnType("jsonb");

            entity.HasOne(e => e.Org)
                .WithMany(o => o.Places)
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Parent)
                .WithMany(p => p.Children)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Media>(entity =>
        {
            entity.ToTable("MediaFiles");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrgId);
            entity.HasIndex(e => e.StorageKey);

            entity.Property(e => e.MetadataJson)
                .HasColumnType("jsonb");

            entity.HasOne(e => e.Org)
                .WithMany(o => o.MediaFiles)
                .HasForeignKey(e => e.OrgId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.CapturePlace)
                .WithMany()
                .HasForeignKey(e => e.CapturePlaceId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Source>(entity =>
        {
            entity.ToTable("Sources");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrgId);
            entity.HasIndex(e => e.Title);

            entity.Property(e => e.MetadataJson)
                .HasColumnType("jsonb");
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("Tags");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.OrgId, e.Name }).IsUnique();
        });

        modelBuilder.Entity<PersonTag>(entity =>
        {
            entity.ToTable("PersonTags");
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

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("AuditLogs");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.ActorId);
            entity.HasIndex(e => new { e.EntityType, e.EntityId });
            entity.HasIndex(e => e.Timestamp);

            entity.Property(e => e.ChangeJson)
                .HasColumnType("jsonb");

            entity.HasOne(e => e.Actor)
                .WithMany(u => u.AuditLogs)
                .HasForeignKey(e => e.ActorId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.Property(e => e.ActorId)
                .HasColumnName("ActorId");
        });

        // New entity configurations for multi-tree support

        modelBuilder.Entity<PersonLink>(entity =>
        {
            entity.ToTable("PersonLinks");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.SourcePersonId);
            entity.HasIndex(e => e.TargetPersonId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => new { e.SourcePersonId, e.TargetPersonId }).IsUnique();

            entity.HasOne(e => e.SourcePerson)
                .WithMany()
                .HasForeignKey(e => e.SourcePersonId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.TargetPerson)
                .WithMany()
                .HasForeignKey(e => e.TargetPersonId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.CreatedByUser)
                .WithMany()
                .HasForeignKey(e => e.CreatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.ApprovedByUser)
                .WithMany()
                .HasForeignKey(e => e.ApprovedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AdminTreeAssignment>(entity =>
        {
            entity.ToTable("AdminTreeAssignments");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.TreeId);
            entity.HasIndex(e => new { e.UserId, e.TreeId }).IsUnique();

            entity.HasOne(e => e.User)
                .WithMany(u => u.AdminAssignments)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Tree)
                .WithMany(o => o.AdminAssignments)
                .HasForeignKey(e => e.TreeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.AssignedByUser)
                .WithMany()
                .HasForeignKey(e => e.AssignedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<TreeInvitation>(entity =>
        {
            entity.ToTable("TreeInvitations");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.TreeId);
            entity.HasIndex(e => e.Email);
            entity.HasIndex(e => e.Token).IsUnique();

            entity.HasOne(e => e.Tree)
                .WithMany(o => o.Invitations)
                .HasForeignKey(e => e.TreeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.InvitedByUser)
                .WithMany()
                .HasForeignKey(e => e.InvitedByUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.AcceptedByUser)
                .WithMany()
                .HasForeignKey(e => e.AcceptedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // PersonMedia - Junction table for Person-Media many-to-many relationship
        modelBuilder.Entity<PersonMedia>(entity =>
        {
            entity.ToTable("PersonMedia");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.PersonId);
            entity.HasIndex(e => e.MediaId);
            entity.HasIndex(e => new { e.PersonId, e.MediaId }).IsUnique();

            entity.HasOne(e => e.Person)
                .WithMany()
                .HasForeignKey(e => e.PersonId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Media)
                .WithMany(m => m.PersonLinks)
                .HasForeignKey(e => e.MediaId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
