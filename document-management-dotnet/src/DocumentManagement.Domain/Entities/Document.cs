using DocumentManagement.Domain.Common;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.Events;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Domain.Entities;

public class Document : AggregateRoot, ITenantAwareEntity
{
    public Guid TenantId { get; private set; }
    public DocumentMetadata Metadata { get; private set; } = null!;
    public FileInformation FileInfo { get; private set; } = null!;
    public DocumentStatus Status { get; private set; }
    public string StoragePath { get; private set; } = string.Empty;
    public string? ThumbnailPath { get; private set; }
    public string? PreviewPath { get; private set; }
    public string? ExtractedText { get; private set; }
    public bool IsEncrypted { get; private set; }
    public string? EncryptionKey { get; private set; }
    public Guid? ParentDocumentId { get; private set; }
    public Guid? WorkflowInstanceId { get; private set; }
    public bool IsTemplate { get; private set; }
    public DateTime? PublishedAt { get; private set; }
    public string? PublishedBy { get; private set; }

    private readonly List<DocumentVersion> _versions = new();
    private readonly List<DocumentTag> _tags = new();
    private readonly List<DocumentPermission> _permissions = new();
    private readonly List<DocumentComment> _comments = new();

    public IReadOnlyCollection<DocumentVersion> Versions => _versions.AsReadOnly();
    public IReadOnlyCollection<DocumentTag> Tags => _tags.AsReadOnly();
    public IReadOnlyCollection<DocumentPermission> Permissions => _permissions.AsReadOnly();
    public IReadOnlyCollection<DocumentComment> Comments => _comments.AsReadOnly();

    // Navigation properties
    public Document? ParentDocument { get; private set; }
    public virtual ICollection<Document> ChildDocuments { get; private set; } = new List<Document>();

    private Document() { } // For EF Core

    public static Document Create(
        Guid tenantId,
        DocumentMetadata metadata,
        FileInformation fileInfo,
        string storagePath,
        string createdBy,
        bool isEncrypted = false,
        string? encryptionKey = null)
    {
        var document = new Document
        {
            TenantId = tenantId,
            Metadata = metadata,
            FileInfo = fileInfo,
            Status = DocumentStatus.Draft,
            StoragePath = storagePath,
            IsEncrypted = isEncrypted,
            EncryptionKey = encryptionKey,
            CreatedBy = createdBy
        };

        // Create initial version
        var initialVersion = DocumentVersion.Create(document.Id, 1, 0, "Initial version", createdBy);
        document._versions.Add(initialVersion);

        document.AddDomainEvent(new DocumentCreatedEvent(document.Id, tenantId, metadata.Title, createdBy));
        
        return document;
    }

    public void UpdateMetadata(DocumentMetadata newMetadata, string updatedBy)
    {
        if (Status == DocumentStatus.Archived)
            throw new InvalidOperationException("Cannot update archived document");

        var oldTitle = Metadata.Title;
        Metadata = newMetadata;
        MarkAsUpdated(updatedBy);
        IncrementVersion();

        AddDomainEvent(new DocumentUpdatedEvent(Id, TenantId, oldTitle, newMetadata.Title, updatedBy));
    }

    public void ChangeStatus(DocumentStatus newStatus, string changedBy)
    {
        if (Status == newStatus) return;

        var oldStatus = Status;
        Status = newStatus;
        MarkAsUpdated(changedBy);

        if (newStatus == DocumentStatus.Published)
        {
            PublishedAt = DateTime.UtcNow;
            PublishedBy = changedBy;
        }

        AddDomainEvent(new DocumentStatusChangedEvent(Id, TenantId, oldStatus, newStatus, changedBy));
    }

    public DocumentVersion CreateVersion(int majorVersion, int minorVersion, string notes, string createdBy)
    {
        if (Status == DocumentStatus.Archived)
            throw new InvalidOperationException("Cannot create version for archived document");

        var version = DocumentVersion.Create(Id, majorVersion, minorVersion, notes, createdBy);
        _versions.Add(version);
        
        MarkAsUpdated(createdBy);
        IncrementVersion();

        AddDomainEvent(new DocumentVersionCreatedEvent(Id, TenantId, majorVersion, minorVersion, createdBy));
        
        return version;
    }

    public void AddTag(string name, string? value, string addedBy)
    {
        if (_tags.Any(t => t.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
            return;

        var tag = DocumentTag.Create(Id, name, value, addedBy);
        _tags.Add(tag);
        MarkAsUpdated(addedBy);
    }

    public void RemoveTag(string name, string removedBy)
    {
        var tag = _tags.FirstOrDefault(t => t.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (tag != null)
        {
            _tags.Remove(tag);
            MarkAsUpdated(removedBy);
        }
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
            var documentPermission = DocumentPermission.Create(Id, permission);
            _permissions.Add(documentPermission);
        }

        MarkAsUpdated(permission.GrantedBy);
        AddDomainEvent(new DocumentPermissionGrantedEvent(Id, TenantId, permission.PrincipalId, permission.AccessLevel, permission.GrantedBy));
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
            AddDomainEvent(new DocumentPermissionRevokedEvent(Id, TenantId, principalId, revokedBy));
        }
    }

    public void AddComment(string content, string authorId, Guid? parentCommentId = null)
    {
        var comment = DocumentComment.Create(Id, content, authorId, parentCommentId);
        _comments.Add(comment);
        MarkAsUpdated(authorId);
        
        AddDomainEvent(new DocumentCommentAddedEvent(Id, TenantId, comment.Id, authorId));
    }

    public void SetExtractedText(string extractedText, string updatedBy)
    {
        ExtractedText = extractedText;
        MarkAsUpdated(updatedBy);
    }

    public void SetPreviewPath(string previewPath, string updatedBy)
    {
        PreviewPath = previewPath;
        MarkAsUpdated(updatedBy);
    }

    public void SetThumbnailPath(string thumbnailPath, string updatedBy)
    {
        ThumbnailPath = thumbnailPath;
        MarkAsUpdated(updatedBy);
    }

    public void SetWorkflowInstance(Guid workflowInstanceId, string updatedBy)
    {
        WorkflowInstanceId = workflowInstanceId;
        MarkAsUpdated(updatedBy);
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

    public bool HasPermission(SecurityContext securityContext, AccessLevel requiredAccess)
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