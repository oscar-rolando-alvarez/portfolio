using System.ComponentModel.DataAnnotations.Schema;
using DocumentManagement.Domain.Events;

namespace DocumentManagement.Domain.Common;

public abstract class BaseEntity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();
    
    public DateTime CreatedAt { get; protected set; } = DateTime.UtcNow;
    
    public DateTime? UpdatedAt { get; protected set; }
    
    public string CreatedBy { get; protected set; } = string.Empty;
    
    public string? UpdatedBy { get; protected set; }
    
    public bool IsDeleted { get; protected set; }
    
    public DateTime? DeletedAt { get; protected set; }
    
    public string? DeletedBy { get; protected set; }

    private readonly List<IDomainEvent> _domainEvents = new();

    [NotMapped]
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void AddDomainEvent(IDomainEvent domainEvent)
    {
        _domainEvents.Add(domainEvent);
    }

    public void ClearDomainEvents()
    {
        _domainEvents.Clear();
    }

    protected void MarkAsUpdated(string updatedBy)
    {
        UpdatedAt = DateTime.UtcNow;
        UpdatedBy = updatedBy;
    }

    public void MarkAsDeleted(string deletedBy)
    {
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
        DeletedBy = deletedBy;
    }

    public void Restore()
    {
        IsDeleted = false;
        DeletedAt = null;
        DeletedBy = null;
    }
}