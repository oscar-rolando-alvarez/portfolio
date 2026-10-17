namespace DocumentManagement.Domain.Events;

public interface IDomainEvent
{
    Guid Id { get; }

    DateTime OccurredOn { get; }

    string EventType { get; }
}

public abstract class DomainEvent : IDomainEvent
{
    public Guid Id { get; } = Guid.NewGuid();

    public DateTime OccurredOn { get; } = DateTime.UtcNow;

    public abstract string EventType { get; }
}
