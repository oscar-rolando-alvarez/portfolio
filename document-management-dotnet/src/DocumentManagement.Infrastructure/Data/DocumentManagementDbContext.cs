using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Common;
using DocumentManagement.Infrastructure.Identity;
using DocumentManagement.Infrastructure.Configurations;
using System.Reflection;

namespace DocumentManagement.Infrastructure.Data;

public class DocumentManagementDbContext : IdentityDbContext<ApplicationUser, IdentityRole, string>, IDocumentManagementDbContext
{
    private readonly ITenantContext _tenantContext;

    public DocumentManagementDbContext(
        DbContextOptions<DocumentManagementDbContext> options,
        ITenantContext tenantContext) : base(options)
    {
        _tenantContext = tenantContext;
    }

    public DbSet<Document> Documents { get; set; } = null!;
    public DbSet<DocumentVersion> DocumentVersions { get; set; } = null!;
    public DbSet<DocumentTag> DocumentTags { get; set; } = null!;
    public DbSet<DocumentPermission> DocumentPermissions { get; set; } = null!;
    public DbSet<DocumentComment> DocumentComments { get; set; } = null!;
    public DbSet<Folder> Folders { get; set; } = null!;
    public DbSet<Tenant> Tenants { get; set; } = null!;
    public DbSet<AuditLog> AuditLogs { get; set; } = null!;
    public DbSet<WorkflowInstance> WorkflowInstances { get; set; } = null!;
    public DbSet<WorkflowStep> WorkflowSteps { get; set; } = null!;
    public DbSet<Notification> Notifications { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Apply all configurations from assembly
        builder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());

        // Configure multi-tenancy
        ConfigureMultiTenancy(builder);
        
        // Configure global query filters for soft delete
        ConfigureSoftDelete(builder);
    }

    private void ConfigureMultiTenancy(ModelBuilder builder)
    {
        // Add tenant filter for tenant entities
        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            if (typeof(ITenantEntity).IsAssignableFrom(entityType.ClrType))
            {
                var method = typeof(DocumentManagementDbContext)
                    .GetMethod(nameof(GetTenantFilter), BindingFlags.NonPublic | BindingFlags.Static)?
                    .MakeGenericMethod(entityType.ClrType);
                
                var filter = method?.Invoke(null, new object[] { _tenantContext });
                if (filter != null)
                {
                    entityType.SetQueryFilter((System.Linq.Expressions.LambdaExpression)filter);
                }
            }
        }
    }

    private static System.Linq.Expressions.Expression<Func<T, bool>> GetTenantFilter<T>(ITenantContext tenantContext) 
        where T : class, ITenantEntity
    {
        if (tenantContext.IsSystemContext)
            return _ => true; // No filter for system context
            
        return e => e.TenantId == tenantContext.TenantId;
    }

    private void ConfigureSoftDelete(ModelBuilder builder)
    {
        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            if (typeof(BaseEntity).IsAssignableFrom(entityType.ClrType))
            {
                var method = typeof(DocumentManagementDbContext)
                    .GetMethod(nameof(GetSoftDeleteFilter), BindingFlags.NonPublic | BindingFlags.Static)?
                    .MakeGenericMethod(entityType.ClrType);
                
                var filter = method?.Invoke(null, null);
                if (filter != null)
                {
                    var existingFilter = entityType.GetQueryFilter();
                    if (existingFilter != null)
                    {
                        // Combine filters
                        var param = System.Linq.Expressions.Expression.Parameter(entityType.ClrType);
                        var body = System.Linq.Expressions.Expression.AndAlso(
                            existingFilter.Body,
                            ((System.Linq.Expressions.LambdaExpression)filter).Body);
                        var combinedFilter = System.Linq.Expressions.Expression.Lambda(body, param);
                        entityType.SetQueryFilter(combinedFilter);
                    }
                    else
                    {
                        entityType.SetQueryFilter((System.Linq.Expressions.LambdaExpression)filter);
                    }
                }
            }
        }
    }

    private static System.Linq.Expressions.Expression<Func<T, bool>> GetSoftDeleteFilter<T>() 
        where T : BaseEntity
    {
        return e => !e.IsDeleted;
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ProcessEntitiesBeforeSave();
        return await base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        ProcessEntitiesBeforeSave();
        return base.SaveChanges();
    }

    private void ProcessEntitiesBeforeSave()
    {
        var now = DateTime.UtcNow;
        var userId = _tenantContext.UserId ?? "system";

        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    if (entry.Entity is ITenantAwareEntity tenantEntity && !_tenantContext.IsSystemContext)
                    {
                        tenantEntity.SetTenant(_tenantContext.TenantId);
                    }
                    break;
                    
                case EntityState.Modified:
                    entry.Property(nameof(BaseEntity.UpdatedAt)).CurrentValue = now;
                    entry.Property(nameof(BaseEntity.UpdatedBy)).CurrentValue = userId;
                    break;
            }
        }

        // Handle audit logging
        var auditEntries = ChangeTracker.Entries<BaseEntity>()
            .Where(e => e.State == EntityState.Added || e.State == EntityState.Modified || e.State == EntityState.Deleted)
            .Select(entry => CreateAuditEntry(entry, userId))
            .ToList();

        foreach (var auditEntry in auditEntries)
        {
            AuditLogs.Add(auditEntry);
        }
    }

    private AuditLog CreateAuditEntry(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry<BaseEntity> entry, string userId)
    {
        var entityName = entry.Entity.GetType().Name;
        var action = entry.State switch
        {
            EntityState.Added => "INSERT",
            EntityState.Modified => "UPDATE", 
            EntityState.Deleted => "DELETE",
            _ => "UNKNOWN"
        };

        var changes = new Dictionary<string, object>();
        
        if (entry.State == EntityState.Modified)
        {
            foreach (var property in entry.Properties)
            {
                if (property.IsModified)
                {
                    changes[property.Metadata.Name] = new
                    {
                        OldValue = property.OriginalValue,
                        NewValue = property.CurrentValue
                    };
                }
            }
        }

        return new AuditLog
        {
            TenantId = _tenantContext.TenantId,
            EntityName = entityName,
            EntityId = entry.Entity.Id.ToString(),
            Action = action,
            Changes = System.Text.Json.JsonSerializer.Serialize(changes),
            UserId = userId,
            Timestamp = DateTime.UtcNow,
            IpAddress = string.Empty, // This would be set by middleware
            UserAgent = string.Empty  // This would be set by middleware
        };
    }
}

public interface IDocumentManagementDbContext
{
    DbSet<Document> Documents { get; }
    DbSet<DocumentVersion> DocumentVersions { get; }
    DbSet<DocumentTag> DocumentTags { get; }
    DbSet<DocumentPermission> DocumentPermissions { get; }
    DbSet<DocumentComment> DocumentComments { get; }
    DbSet<Folder> Folders { get; }
    DbSet<Tenant> Tenants { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<WorkflowInstance> WorkflowInstances { get; }
    DbSet<WorkflowStep> WorkflowSteps { get; }
    DbSet<Notification> Notifications { get; }
    
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    int SaveChanges();
}