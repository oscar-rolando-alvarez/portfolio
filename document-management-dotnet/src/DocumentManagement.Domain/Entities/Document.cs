using DocumentManagement.Domain.Common;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.Events;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Domain.Entities;

/// <summary>
/// Document aggregate: metadata, the current binary (by storage path), its version history,
/// tags, comments, sharing permissions and review workflow state.
/// </summary>
public class Document : AggregateRoot, ITenantAwareEntity
{
    private readonly List<DocumentVersion> _versions = [];
    private readonly List<DocumentTag> _tags = [];
    private readonly List<DocumentPermission> _permissions = [];
    private readonly List<DocumentComment> _comments = [];

    public Guid TenantId { get; private set; }

    public Guid? FolderId { get; private set; }

    public DocumentMetadata Metadata { get; private set; } = null!;

    public FileInformation FileInfo { get; private set; } = null!;

    public DocumentStatus Status { get; private set; }

    public string StoragePath { get; private set; } = string.Empty;

    public string? ExtractedText { get; private set; }

    public string? Summary { get; private set; }

    public DateTime? SummaryGeneratedAt { get; private set; }

    public DateTime? PublishedAt { get; private set; }

    public string? PublishedBy { get; private set; }

    public IReadOnlyCollection<DocumentVersion> Versions => _versions.AsReadOnly();

    public IReadOnlyCollection<DocumentTag> Tags => _tags.AsReadOnly();

    public IReadOnlyCollection<DocumentPermission> Permissions => _permissions.AsReadOnly();

    public IReadOnlyCollection<DocumentComment> Comments => _comments.AsReadOnly();

    public DocumentVersion? CurrentVersion => _versions.FirstOrDefault(v => v.IsCurrent);

    protected Document()
    {
    }

    public static Document Create(
        Guid tenantId,
        DocumentMetadata metadata,
        FileInformation fileInfo,
        string storagePath,
        string createdBy,
        Guid? folderId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storagePath);
        ArgumentException.ThrowIfNullOrWhiteSpace(createdBy);

        var document = new Document
        {
            TenantId = tenantId,
            FolderId = folderId,
            Metadata = metadata,
            FileInfo = fileInfo,
            Status = DocumentStatus.Draft,
            StoragePath = storagePath,
            CreatedBy = createdBy,
        };

        document._versions.Add(DocumentVersion.Create(document.Id, 1, 0, "Initial version", createdBy, storagePath, fileInfo.Size, fileInfo.Hash));
        document.AddDomainEvent(new DocumentCreatedEvent(document.Id, tenantId, metadata.Title, createdBy));
        return document;
    }

    public void UpdateMetadata(DocumentMetadata newMetadata, string updatedBy)
    {
        EnsureEditable();

        var oldTitle = Metadata.Title;
        Metadata = newMetadata;
        MarkAsUpdated(updatedBy);
        AddDomainEvent(new DocumentUpdatedEvent(Id, TenantId, oldTitle, newMetadata.Title, updatedBy));
    }

    /// <summary>Uploads new content. A major version resets the minor counter (1.3 -> 2.0).</summary>
    public DocumentVersion AddVersion(FileInformation fileInfo, string storagePath, string notes, bool isMajor, string createdBy)
    {
        EnsureEditable();

        var current = CurrentVersion;
        var (major, minor) = current is null
            ? (1, 0)
            : isMajor ? (current.MajorVersion + 1, 0) : (current.MajorVersion, current.MinorVersion + 1);

        current?.MarkAsNotCurrent(createdBy);
        var version = DocumentVersion.Create(Id, major, minor, notes, createdBy, storagePath, fileInfo.Size, fileInfo.Hash);
        _versions.Add(version);

        FileInfo = fileInfo;
        StoragePath = storagePath;
        ExtractedText = null;
        Summary = null;
        SummaryGeneratedAt = null;
        MarkAsUpdated(createdBy);
        AddDomainEvent(new DocumentVersionCreatedEvent(Id, TenantId, major, minor, createdBy));
        return version;
    }

    /// <summary>Applies a workflow action; throws when the transition is not allowed from the current status.</summary>
    public void Apply(DocumentAction action, string actor, string? comment = null)
    {
        if (!DocumentLifecycle.TryGetNextStatus(Status, action, out var next))
        {
            throw new InvalidOperationException($"Cannot {action.ToString().ToLowerInvariant()} a document that is {Status}.");
        }

        if (action == DocumentAction.Reject && string.IsNullOrWhiteSpace(comment))
        {
            throw new ArgumentException("A reason is required to reject a document.", nameof(comment));
        }

        var previous = Status;
        Status = next;
        if (next == DocumentStatus.Published)
        {
            PublishedAt = DateTime.UtcNow;
            PublishedBy = actor;
        }

        if (!string.IsNullOrWhiteSpace(comment))
        {
            AddComment($"[{action}] {comment}", actor);
        }

        MarkAsUpdated(actor);
        AddDomainEvent(new DocumentStatusChangedEvent(Id, TenantId, previous, next, actor));
    }

    public void MoveToFolder(Guid? folderId, string movedBy)
    {
        FolderId = folderId;
        MarkAsUpdated(movedBy);
    }

    public void AddTag(string name, string? value, string addedBy)
    {
        if (_tags.Any(t => t.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        _tags.Add(DocumentTag.Create(Id, name.Trim().ToLowerInvariant(), value, addedBy));
        MarkAsUpdated(addedBy);
    }

    public bool RemoveTag(string name, string removedBy)
    {
        var removed = _tags.RemoveAll(t => t.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase)) > 0;
        if (removed)
        {
            MarkAsUpdated(removedBy);
        }

        return removed;
    }

    public void GrantPermission(Permission permission)
    {
        var existing = _permissions.FirstOrDefault(p => p.PrincipalId == permission.PrincipalId && p.PrincipalType == permission.PrincipalType);
        if (existing is not null)
        {
            existing.UpdateAccessLevel(permission.AccessLevel, permission.GrantedBy);
        }
        else
        {
            _permissions.Add(DocumentPermission.Create(Id, permission));
        }

        MarkAsUpdated(permission.GrantedBy);
        AddDomainEvent(new DocumentPermissionGrantedEvent(Id, TenantId, permission.PrincipalId, permission.AccessLevel, permission.GrantedBy));
    }

    public DocumentComment AddComment(string content, string authorId, Guid? parentCommentId = null)
    {
        var comment = DocumentComment.Create(Id, content, authorId, parentCommentId);
        _comments.Add(comment);
        MarkAsUpdated(authorId);
        AddDomainEvent(new DocumentCommentAddedEvent(Id, TenantId, comment.Id, authorId));
        return comment;
    }

    public void SetExtractedText(string? extractedText) => ExtractedText = extractedText;

    public void SetSummary(string summary, string requestedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(summary);
        Summary = summary.Trim();
        SummaryGeneratedAt = DateTime.UtcNow;
        MarkAsUpdated(requestedBy);
    }

    public void SetTenant(Guid tenantId) => TenantId = tenantId;

    /// <summary>
    /// Resolves effective access: owners have full control, published documents are readable tenant-wide,
    /// otherwise explicit user, role or group grants apply.
    /// </summary>
    public bool HasPermission(SecurityContext securityContext, AccessLevel requiredAccess)
    {
        if (CreatedBy == securityContext.UserId)
        {
            return true;
        }

        if (requiredAccess == AccessLevel.Read && Status == DocumentStatus.Published)
        {
            return true;
        }

        return _permissions.Any(p => p.IsValid() && p.HasAccess(requiredAccess) && p.PrincipalType switch
        {
            "User" => p.PrincipalId == securityContext.UserId,
            "Role" => securityContext.Roles.Contains(p.PrincipalId),
            "Group" => securityContext.Groups.Contains(p.PrincipalId),
            _ => false,
        });
    }

    private void EnsureEditable()
    {
        if (!DocumentLifecycle.IsEditable(Status))
        {
            throw new InvalidOperationException($"A document that is {Status} cannot be modified. Revise or create a new document instead.");
        }
    }
}
