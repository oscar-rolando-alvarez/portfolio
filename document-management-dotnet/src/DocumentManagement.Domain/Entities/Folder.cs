using DocumentManagement.Domain.Common;
using DocumentManagement.Domain.Events;

namespace DocumentManagement.Domain.Entities;

/// <summary>Hierarchical container for documents within a tenant.</summary>
public class Folder : AggregateRoot, ITenantAwareEntity
{
    public Guid TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public Guid? ParentFolderId { get; private set; }

    public bool IsSystemFolder { get; private set; }

    protected Folder()
    {
    }

    public static Folder Create(Guid tenantId, string name, string? description, string createdBy, Guid? parentFolderId = null, bool isSystemFolder = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        var folder = new Folder
        {
            TenantId = tenantId,
            Name = name.Trim(),
            Description = description?.Trim() ?? string.Empty,
            ParentFolderId = parentFolderId,
            IsSystemFolder = isSystemFolder,
            CreatedBy = createdBy,
        };

        folder.AddDomainEvent(new FolderCreatedEvent(folder.Id, tenantId, folder.Name, createdBy));
        return folder;
    }

    public void Rename(string newName, string updatedBy)
    {
        if (IsSystemFolder)
        {
            throw new InvalidOperationException("System folders cannot be renamed.");
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(newName);
        var oldName = Name;
        Name = newName.Trim();
        MarkAsUpdated(updatedBy);
        AddDomainEvent(new FolderRenamedEvent(Id, TenantId, oldName, Name, updatedBy));
    }

    public void Move(Guid? newParentFolderId, string movedBy)
    {
        if (IsSystemFolder)
        {
            throw new InvalidOperationException("System folders cannot be moved.");
        }

        if (newParentFolderId == Id)
        {
            throw new InvalidOperationException("A folder cannot be moved into itself.");
        }

        var oldParentId = ParentFolderId;
        ParentFolderId = newParentFolderId;
        MarkAsUpdated(movedBy);
        AddDomainEvent(new FolderMovedEvent(Id, TenantId, oldParentId, newParentFolderId, movedBy));
    }

    public void SetTenant(Guid tenantId) => TenantId = tenantId;
}
