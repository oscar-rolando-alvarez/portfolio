using DocumentManagement.Domain.Common;
using DocumentManagement.Domain.Events;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Domain.Entities;

public class Folder : AggregateRoot, ITenantAwareEntity
{
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public string Path { get; private set; } = string.Empty;
    public Guid? ParentFolderId { get; private set; }
    public bool IsSystemFolder { get; private set; }
    public bool IsTemplate { get; private set; }

    private readonly List<DocumentPermission> _permissions = new();
    public IReadOnlyCollection<DocumentPermission> Permissions => _permissions.AsReadOnly();

    // Navigation properties
    public Folder? ParentFolder { get; private set; }
    public virtual ICollection<Folder> ChildFolders { get; private set; } = new List<Folder>();
    public virtual ICollection<Document> Documents { get; private set; } = new List<Document>();

    private Folder() { } // For EF Core

    public static Folder Create(
        Guid tenantId,
        string name,
        string description,
        string createdBy,
        Guid? parentFolderId = null,
        bool isSystemFolder = false)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Folder name cannot be empty", nameof(name));

        var folder = new Folder
        {
            TenantId = tenantId,
            Name = name.Trim(),
            Description = description?.Trim() ?? string.Empty,
            ParentFolderId = parentFolderId,
            IsSystemFolder = isSystemFolder,
            CreatedBy = createdBy
        };

        folder.UpdatePath();
        folder.AddDomainEvent(new FolderCreatedEvent(folder.Id, tenantId, name, createdBy));
        
        return folder;
    }

    public void UpdateName(string newName, string updatedBy)
    {
        if (IsSystemFolder)
            throw new InvalidOperationException("Cannot rename system folders");

        if (string.IsNullOrWhiteSpace(newName))
            throw new ArgumentException("Folder name cannot be empty", nameof(newName));

        var oldName = Name;
        Name = newName.Trim();
        UpdatePath();
        MarkAsUpdated(updatedBy);
        IncrementVersion();

        AddDomainEvent(new FolderRenamedEvent(Id, TenantId, oldName, newName, updatedBy));
    }

    public void UpdateDescription(string newDescription, string updatedBy)
    {
        Description = newDescription?.Trim() ?? string.Empty;
        MarkAsUpdated(updatedBy);
    }

    public void Move(Guid? newParentFolderId, string movedBy)
    {
        if (IsSystemFolder)
            throw new InvalidOperationException("Cannot move system folders");

        if (newParentFolderId == Id)
            throw new InvalidOperationException("Cannot move folder to itself");

        var oldParentId = ParentFolderId;
        ParentFolderId = newParentFolderId;
        UpdatePath();
        MarkAsUpdated(movedBy);
        IncrementVersion();

        AddDomainEvent(new FolderMovedEvent(Id, TenantId, oldParentId, newParentFolderId, movedBy));
    }

    public void GrantPermission(Permission permission)
    {
        var existingPermission = _permissions.FirstOrDefault(p => 
            p.PrincipalId == permission.PrincipalId && 
            p.PrincipalType == permission.PrincipalType);

        if (existingPermission != null)
        {
            existingPermission.UpdateAccessLevel(permission.AccessLevel, permission.GrantedBy);
        }
        else
        {
            var folderPermission = DocumentPermission.Create(Id, permission);
            _permissions.Add(folderPermission);
        }

        MarkAsUpdated(permission.GrantedBy);
    }

    public void RevokePermission(string principalId, string principalType, string revokedBy)
    {
        var permission = _permissions.FirstOrDefault(p => 
            p.PrincipalId == principalId && 
            p.PrincipalType == principalType);

        if (permission != null)
        {
            _permissions.Remove(permission);
            MarkAsUpdated(revokedBy);
        }
    }

    public void MarkAsTemplate(string updatedBy)
    {
        IsTemplate = true;
        MarkAsUpdated(updatedBy);
    }

    public void SetTenant(Guid tenantId)
    {
        TenantId = tenantId;
    }

    private void UpdatePath()
    {
        // This would typically be calculated based on the parent hierarchy
        // For now, we'll use a simple implementation
        Path = ParentFolderId.HasValue ? $"/{ParentFolderId}/{Name}" : $"/{Name}";
    }

    public bool HasPermission(SecurityContext securityContext, DocumentManagement.Domain.Enums.AccessLevel requiredAccess)
    {
        // Check if user is the creator
        if (CreatedBy == securityContext.UserId)
            return true;

        // Check direct user permissions
        var userPermission = _permissions.FirstOrDefault(p => 
            p.PrincipalId == securityContext.UserId && 
            p.PrincipalType == "User" &&
            p.IsValid());

        if (userPermission != null && userPermission.HasAccess(requiredAccess))
            return true;

        // Check role permissions
        foreach (var role in securityContext.Roles)
        {
            var rolePermission = _permissions.FirstOrDefault(p => 
                p.PrincipalId == role && 
                p.PrincipalType == "Role" &&
                p.IsValid());

            if (rolePermission != null && rolePermission.HasAccess(requiredAccess))
                return true;
        }

        // Check group permissions
        foreach (var group in securityContext.Groups)
        {
            var groupPermission = _permissions.FirstOrDefault(p => 
                p.PrincipalId == group && 
                p.PrincipalType == "Group" &&
                p.IsValid());

            if (groupPermission != null && groupPermission.HasAccess(requiredAccess))
                return true;
        }

        return false;
    }
}