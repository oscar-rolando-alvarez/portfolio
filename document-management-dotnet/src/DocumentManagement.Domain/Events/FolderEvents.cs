namespace DocumentManagement.Domain.Events;

public class FolderCreatedEvent : DomainEvent
{
    public Guid FolderId { get; }
    public Guid TenantId { get; }
    public string Name { get; }
    public string CreatedBy { get; }

    public FolderCreatedEvent(Guid folderId, Guid tenantId, string name, string createdBy)
    {
        FolderId = folderId;
        TenantId = tenantId;
        Name = name;
        CreatedBy = createdBy;
    }

    public override string EventType => "FolderCreated";
}

public class FolderRenamedEvent : DomainEvent
{
    public Guid FolderId { get; }
    public Guid TenantId { get; }
    public string OldName { get; }
    public string NewName { get; }
    public string RenamedBy { get; }

    public FolderRenamedEvent(Guid folderId, Guid tenantId, string oldName, string newName, string renamedBy)
    {
        FolderId = folderId;
        TenantId = tenantId;
        OldName = oldName;
        NewName = newName;
        RenamedBy = renamedBy;
    }

    public override string EventType => "FolderRenamed";
}

public class FolderMovedEvent : DomainEvent
{
    public Guid FolderId { get; }
    public Guid TenantId { get; }
    public Guid? OldParentId { get; }
    public Guid? NewParentId { get; }
    public string MovedBy { get; }

    public FolderMovedEvent(Guid folderId, Guid tenantId, Guid? oldParentId, Guid? newParentId, string movedBy)
    {
        FolderId = folderId;
        TenantId = tenantId;
        OldParentId = oldParentId;
        NewParentId = newParentId;
        MovedBy = movedBy;
    }

    public override string EventType => "FolderMoved";
}

public class FolderDeletedEvent : DomainEvent
{
    public Guid FolderId { get; }
    public Guid TenantId { get; }
    public string Name { get; }
    public string DeletedBy { get; }

    public FolderDeletedEvent(Guid folderId, Guid tenantId, string name, string deletedBy)
    {
        FolderId = folderId;
        TenantId = tenantId;
        Name = name;
        DeletedBy = deletedBy;
    }

    public override string EventType => "FolderDeleted";
}