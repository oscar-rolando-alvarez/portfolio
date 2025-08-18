using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Infrastructure.Data;
using DocumentManagement.Infrastructure.Identity;
using System.Text.Json;

namespace DocumentManagement.Infrastructure.Configurations;

public class DocumentVersionConfiguration : IEntityTypeConfiguration<DocumentVersion>
{
    public void Configure(EntityTypeBuilder<DocumentVersion> builder)
    {
        builder.ToTable("DocumentVersions");
        builder.HasKey(dv => dv.Id);

        builder.Property(dv => dv.DocumentId).IsRequired();
        builder.Property(dv => dv.MajorVersion).IsRequired();
        builder.Property(dv => dv.MinorVersion).IsRequired();
        builder.Property(dv => dv.Notes).HasMaxLength(1000);
        builder.Property(dv => dv.StoragePath).HasMaxLength(1000);
        builder.Property(dv => dv.FileHash).HasMaxLength(128);

        builder.HasIndex(dv => dv.DocumentId);
        builder.HasIndex(dv => new { dv.DocumentId, dv.MajorVersion, dv.MinorVersion }).IsUnique();

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class DocumentTagConfiguration : IEntityTypeConfiguration<DocumentTag>
{
    public void Configure(EntityTypeBuilder<DocumentTag> builder)
    {
        builder.ToTable("DocumentTags");
        builder.HasKey(dt => dt.Id);

        builder.Property(dt => dt.DocumentId).IsRequired();
        builder.Property(dt => dt.Name).IsRequired().HasMaxLength(100);
        builder.Property(dt => dt.Value).HasMaxLength(500);
        builder.Property(dt => dt.TagType).IsRequired().HasMaxLength(50);

        builder.HasIndex(dt => dt.DocumentId);
        builder.HasIndex(dt => dt.Name);
        builder.HasIndex(dt => new { dt.DocumentId, dt.Name }).IsUnique();

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class DocumentPermissionConfiguration : IEntityTypeConfiguration<DocumentPermission>
{
    public void Configure(EntityTypeBuilder<DocumentPermission> builder)
    {
        builder.ToTable("DocumentPermissions");
        builder.HasKey(dp => dp.Id);

        builder.Property(dp => dp.DocumentId).IsRequired();
        builder.Property(dp => dp.PrincipalId).IsRequired().HasMaxLength(450);
        builder.Property(dp => dp.PrincipalType).IsRequired().HasMaxLength(50);
        builder.Property(dp => dp.AccessLevel).HasConversion<int>();
        builder.Property(dp => dp.GrantedBy).IsRequired().HasMaxLength(450);

        builder.HasIndex(dp => dp.DocumentId);
        builder.HasIndex(dp => new { dp.DocumentId, dp.PrincipalId, dp.PrincipalType }).IsUnique();

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class DocumentCommentConfiguration : IEntityTypeConfiguration<DocumentComment>
{
    public void Configure(EntityTypeBuilder<DocumentComment> builder)
    {
        builder.ToTable("DocumentComments");
        builder.HasKey(dc => dc.Id);

        builder.Property(dc => dc.DocumentId).IsRequired();
        builder.Property(dc => dc.Content).IsRequired().HasMaxLength(2000);
        builder.Property(dc => dc.AuthorId).IsRequired().HasMaxLength(450);
        builder.Property(dc => dc.AuthorName).HasMaxLength(200);
        builder.Property(dc => dc.ResolvedBy).HasMaxLength(450);

        builder.HasOne(dc => dc.ParentComment)
            .WithMany(dc => dc.Replies)
            .HasForeignKey(dc => dc.ParentCommentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(dc => dc.DocumentId);
        builder.HasIndex(dc => dc.AuthorId);
        builder.HasIndex(dc => dc.ParentCommentId);

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.ToTable("Tenants");
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Name).IsRequired().HasMaxLength(200);
        builder.Property(t => t.Domain).IsRequired().HasMaxLength(100);
        builder.Property(t => t.DatabaseName).HasMaxLength(100);
        builder.Property(t => t.SubscriptionPlan).HasMaxLength(50);
        builder.Property(t => t.ContactEmail).IsRequired().HasMaxLength(320);
        builder.Property(t => t.LogoUrl).HasMaxLength(500);

        builder.Property(t => t.Settings)
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>())
            .HasColumnType("nvarchar(max)");

        builder.HasIndex(t => t.Domain).IsUnique();
        builder.HasIndex(t => t.IsActive);

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");
        builder.HasKey(al => al.Id);

        builder.Property(al => al.TenantId).IsRequired();
        builder.Property(al => al.EntityName).IsRequired().HasMaxLength(100);
        builder.Property(al => al.EntityId).IsRequired().HasMaxLength(50);
        builder.Property(al => al.Action).IsRequired().HasMaxLength(20);
        builder.Property(al => al.Changes).HasColumnType("nvarchar(max)");
        builder.Property(al => al.UserId).IsRequired().HasMaxLength(450);
        builder.Property(al => al.IpAddress).HasMaxLength(45);
        builder.Property(al => al.UserAgent).HasMaxLength(500);
        builder.Property(al => al.SessionId).HasMaxLength(100);

        builder.HasIndex(al => al.TenantId);
        builder.HasIndex(al => al.EntityName);
        builder.HasIndex(al => al.EntityId);
        builder.HasIndex(al => al.UserId);
        builder.HasIndex(al => al.Timestamp);

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class WorkflowInstanceConfiguration : IEntityTypeConfiguration<WorkflowInstance>
{
    public void Configure(EntityTypeBuilder<WorkflowInstance> builder)
    {
        builder.ToTable("WorkflowInstances");
        builder.HasKey(wi => wi.Id);

        builder.Property(wi => wi.TenantId).IsRequired();
        builder.Property(wi => wi.WorkflowName).IsRequired().HasMaxLength(200);
        builder.Property(wi => wi.WorkflowVersion).IsRequired().HasMaxLength(20);
        builder.Property(wi => wi.DocumentId).IsRequired();
        builder.Property(wi => wi.Status).HasConversion<string>().HasMaxLength(50);
        builder.Property(wi => wi.Data).HasColumnType("nvarchar(max)");
        builder.Property(wi => wi.StartedBy).IsRequired().HasMaxLength(450);
        builder.Property(wi => wi.ErrorMessage).HasMaxLength(2000);

        builder.HasIndex(wi => wi.TenantId);
        builder.HasIndex(wi => wi.DocumentId);
        builder.HasIndex(wi => wi.Status);
        builder.HasIndex(wi => wi.StartedBy);

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class WorkflowStepConfiguration : IEntityTypeConfiguration<WorkflowStep>
{
    public void Configure(EntityTypeBuilder<WorkflowStep> builder)
    {
        builder.ToTable("WorkflowSteps");
        builder.HasKey(ws => ws.Id);

        builder.Property(ws => ws.TenantId).IsRequired();
        builder.Property(ws => ws.WorkflowInstanceId).IsRequired();
        builder.Property(ws => ws.StepName).IsRequired().HasMaxLength(200);
        builder.Property(ws => ws.StepType).IsRequired().HasMaxLength(100);
        builder.Property(ws => ws.Status).HasConversion<string>().HasMaxLength(50);
        builder.Property(ws => ws.Data).HasColumnType("nvarchar(max)");
        builder.Property(ws => ws.AssignedTo).HasMaxLength(450);
        builder.Property(ws => ws.ErrorMessage).HasMaxLength(2000);
        builder.Property(ws => ws.Comments).HasMaxLength(2000);

        builder.HasIndex(ws => ws.TenantId);
        builder.HasIndex(ws => ws.WorkflowInstanceId);
        builder.HasIndex(ws => ws.Status);
        builder.HasIndex(ws => ws.AssignedTo);

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("Notifications");
        builder.HasKey(n => n.Id);

        builder.Property(n => n.TenantId).IsRequired();
        builder.Property(n => n.RecipientId).IsRequired().HasMaxLength(450);
        builder.Property(n => n.Type).HasConversion<string>().HasMaxLength(50);
        builder.Property(n => n.Title).IsRequired().HasMaxLength(200);
        builder.Property(n => n.Message).IsRequired().HasMaxLength(1000);
        builder.Property(n => n.Data).HasColumnType("nvarchar(max)");
        builder.Property(n => n.RelatedEntityType).HasMaxLength(100);
        builder.Property(n => n.Priority).HasMaxLength(20);

        builder.HasIndex(n => n.TenantId);
        builder.HasIndex(n => n.RecipientId);
        builder.HasIndex(n => n.Type);
        builder.HasIndex(n => n.IsRead);
        builder.HasIndex(n => n.CreatedAt);

        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.CreatedBy).IsRequired().HasMaxLength(450);
        builder.Property(e => e.UpdatedBy).HasMaxLength(450);
        builder.Property(e => e.DeletedBy).HasMaxLength(450);
        builder.Property(e => e.Version).IsRowVersion();
    }
}

public class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> builder)
    {
        builder.Property(u => u.TenantId).IsRequired();
        builder.Property(u => u.FirstName).IsRequired().HasMaxLength(100);
        builder.Property(u => u.LastName).IsRequired().HasMaxLength(100);
        builder.Property(u => u.DisplayName).HasMaxLength(200);
        builder.Property(u => u.Department).HasMaxLength(100);
        builder.Property(u => u.JobTitle).HasMaxLength(100);
        builder.Property(u => u.ProfileImageUrl).HasMaxLength(500);
        builder.Property(u => u.TimeZone).HasMaxLength(50);
        builder.Property(u => u.Language).HasMaxLength(10);

        builder.Property(u => u.Preferences)
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>())
            .HasColumnType("nvarchar(max)");

        builder.HasIndex(u => u.TenantId);
        builder.HasIndex(u => u.IsActive);
    }
}

public class ApplicationRoleConfiguration : IEntityTypeConfiguration<ApplicationRole>
{
    public void Configure(EntityTypeBuilder<ApplicationRole> builder)
    {
        builder.Property(r => r.TenantId).IsRequired();
        builder.Property(r => r.Description).HasMaxLength(500);

        builder.Property(r => r.Permissions)
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>())
            .HasColumnType("nvarchar(max)");

        builder.HasIndex(r => r.TenantId);
        builder.HasIndex(r => r.IsSystemRole);
    }
}