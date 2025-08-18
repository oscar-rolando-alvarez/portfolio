using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using DocumentManagement.Domain.Entities;

namespace DocumentManagement.Infrastructure.Configurations;

public class FolderConfiguration : IEntityTypeConfiguration<Folder>
{
    public void Configure(EntityTypeBuilder<Folder> builder)
    {
        builder.ToTable("Folders");

        builder.HasKey(f => f.Id);

        builder.Property(f => f.TenantId)
            .IsRequired();

        builder.Property(f => f.Name)
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(f => f.Description)
            .HasMaxLength(1000);

        builder.Property(f => f.Path)
            .IsRequired()
            .HasMaxLength(2000);

        // Configure relationships
        builder.HasOne(f => f.ParentFolder)
            .WithMany(f => f.ChildFolders)
            .HasForeignKey(f => f.ParentFolderId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(f => f.Permissions)
            .WithOne()
            .HasForeignKey("FolderId")
            .OnDelete(DeleteBehavior.Cascade);

        // Configure indexes
        builder.HasIndex(f => f.TenantId);
        builder.HasIndex(f => f.ParentFolderId);
        builder.HasIndex(f => f.Path);
        builder.HasIndex(f => f.IsDeleted);
        builder.HasIndex(f => new { f.TenantId, f.IsDeleted });
        builder.HasIndex(f => new { f.ParentFolderId, f.Name })
            .IsUnique()
            .HasFilter("[ParentFolderId] IS NOT NULL AND [IsDeleted] = 0");

        // Configure base entity properties
        ConfigureBaseEntity(builder);
    }

    private static void ConfigureBaseEntity<T>(EntityTypeBuilder<T> builder) where T : Domain.Common.BaseEntity
    {
        builder.Property(e => e.CreatedAt)
            .IsRequired();

        builder.Property(e => e.CreatedBy)
            .IsRequired()
            .HasMaxLength(450);

        builder.Property(e => e.UpdatedBy)
            .HasMaxLength(450);

        builder.Property(e => e.DeletedBy)
            .HasMaxLength(450);

        builder.Property(e => e.Version)
            .IsRowVersion();
    }
}