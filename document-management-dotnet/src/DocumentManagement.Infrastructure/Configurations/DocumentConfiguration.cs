using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.ValueObjects;
using System.Text.Json;

namespace DocumentManagement.Infrastructure.Configurations;

public class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> builder)
    {
        builder.ToTable("Documents");

        builder.HasKey(d => d.Id);

        builder.Property(d => d.TenantId)
            .IsRequired();

        builder.Property(d => d.Status)
            .HasConversion<string>()
            .HasMaxLength(50);

        builder.Property(d => d.StoragePath)
            .IsRequired()
            .HasMaxLength(1000);

        builder.Property(d => d.ThumbnailPath)
            .HasMaxLength(1000);

        builder.Property(d => d.PreviewPath)
            .HasMaxLength(1000);

        builder.Property(d => d.ExtractedText)
            .HasColumnType("nvarchar(max)");

        builder.Property(d => d.EncryptionKey)
            .HasMaxLength(500);

        builder.Property(d => d.PublishedBy)
            .HasMaxLength(450);

        // Configure value objects
        builder.OwnsOne(d => d.Metadata, metadata =>
        {
            metadata.Property(m => m.Title)
                .IsRequired()
                .HasMaxLength(500);

            metadata.Property(m => m.Description)
                .HasMaxLength(2000);

            metadata.Property(m => m.Author)
                .HasMaxLength(200);

            metadata.Property(m => m.Subject)
                .HasMaxLength(500);

            metadata.Property(m => m.Keywords)
                .HasMaxLength(1000);

            metadata.Property(m => m.Category)
                .HasMaxLength(100);

            metadata.Property(m => m.Language)
                .HasMaxLength(10);

            metadata.Property(m => m.Classification)
                .HasConversion<string>()
                .HasMaxLength(50);

            metadata.Property(m => m.CustomProperties)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                    v => JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>())
                .HasColumnType("nvarchar(max)");
        });

        builder.OwnsOne(d => d.FileInfo, fileInfo =>
        {
            fileInfo.Property(f => f.FileName)
                .IsRequired()
                .HasMaxLength(500);

            fileInfo.Property(f => f.ContentType)
                .HasMaxLength(200);

            fileInfo.Property(f => f.Extension)
                .HasMaxLength(20);

            fileInfo.Property(f => f.Hash)
                .HasMaxLength(128);

            fileInfo.Property(f => f.Type)
                .HasConversion<string>()
                .HasMaxLength(50);
        });

        // Configure relationships
        builder.HasMany(d => d.Versions)
            .WithOne(v => v.Document)
            .HasForeignKey(v => v.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(d => d.Tags)
            .WithOne(t => t.Document)
            .HasForeignKey(t => t.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(d => d.Permissions)
            .WithOne(p => p.Document)
            .HasForeignKey(p => p.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(d => d.Comments)
            .WithOne(c => c.Document)
            .HasForeignKey(c => c.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(d => d.ParentDocument)
            .WithMany(d => d.ChildDocuments)
            .HasForeignKey(d => d.ParentDocumentId)
            .OnDelete(DeleteBehavior.Restrict);

        // Configure indexes
        builder.HasIndex(d => d.TenantId);
        builder.HasIndex(d => d.Status);
        builder.HasIndex(d => d.CreatedAt);
        builder.HasIndex(d => d.CreatedBy);
        builder.HasIndex(d => d.IsDeleted);
        builder.HasIndex(d => new { d.TenantId, d.IsDeleted });
        builder.HasIndex(d => d.WorkflowInstanceId);

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