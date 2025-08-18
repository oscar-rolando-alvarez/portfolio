using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Domain.Events;

public class DocumentCreatedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public string Title { get; }
    public string CreatedBy { get; }

    public DocumentCreatedEvent(Guid documentId, Guid tenantId, string title, string createdBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        Title = title;
        CreatedBy = createdBy;
    }

    public override string EventType => "DocumentCreated";
}

public class DocumentUpdatedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public string OldTitle { get; }
    public string NewTitle { get; }
    public string UpdatedBy { get; }

    public DocumentUpdatedEvent(Guid documentId, Guid tenantId, string oldTitle, string newTitle, string updatedBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        OldTitle = oldTitle;
        NewTitle = newTitle;
        UpdatedBy = updatedBy;
    }

    public override string EventType => "DocumentUpdated";
}

public class DocumentDeletedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public string Title { get; }
    public string DeletedBy { get; }

    public DocumentDeletedEvent(Guid documentId, Guid tenantId, string title, string deletedBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        Title = title;
        DeletedBy = deletedBy;
    }

    public override string EventType => "DocumentDeleted";
}

public class DocumentStatusChangedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public DocumentStatus OldStatus { get; }
    public DocumentStatus NewStatus { get; }
    public string ChangedBy { get; }

    public DocumentStatusChangedEvent(Guid documentId, Guid tenantId, DocumentStatus oldStatus, DocumentStatus newStatus, string changedBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        OldStatus = oldStatus;
        NewStatus = newStatus;
        ChangedBy = changedBy;
    }

    public override string EventType => "DocumentStatusChanged";
}

public class DocumentVersionCreatedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public int MajorVersion { get; }
    public int MinorVersion { get; }
    public string CreatedBy { get; }

    public DocumentVersionCreatedEvent(Guid documentId, Guid tenantId, int majorVersion, int minorVersion, string createdBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        MajorVersion = majorVersion;
        MinorVersion = minorVersion;
        CreatedBy = createdBy;
    }

    public override string EventType => "DocumentVersionCreated";
}

public class DocumentPermissionGrantedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public string PrincipalId { get; }
    public AccessLevel AccessLevel { get; }
    public string GrantedBy { get; }

    public DocumentPermissionGrantedEvent(Guid documentId, Guid tenantId, string principalId, AccessLevel accessLevel, string grantedBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        PrincipalId = principalId;
        AccessLevel = accessLevel;
        GrantedBy = grantedBy;
    }

    public override string EventType => "DocumentPermissionGranted";
}

public class DocumentPermissionRevokedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public string PrincipalId { get; }
    public string RevokedBy { get; }

    public DocumentPermissionRevokedEvent(Guid documentId, Guid tenantId, string principalId, string revokedBy)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        PrincipalId = principalId;
        RevokedBy = revokedBy;
    }

    public override string EventType => "DocumentPermissionRevoked";
}

public class DocumentCommentAddedEvent : DomainEvent
{
    public Guid DocumentId { get; }
    public Guid TenantId { get; }
    public Guid CommentId { get; }
    public string AuthorId { get; }

    public DocumentCommentAddedEvent(Guid documentId, Guid tenantId, Guid commentId, string authorId)
    {
        DocumentId = documentId;
        TenantId = tenantId;
        CommentId = commentId;
        AuthorId = authorId;
    }

    public override string EventType => "DocumentCommentAdded";
}