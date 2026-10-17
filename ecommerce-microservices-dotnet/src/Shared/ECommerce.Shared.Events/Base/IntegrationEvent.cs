namespace ECommerce.Shared.Events.Base;

/// <summary>
/// Base type for events published across service boundaries. Events are immutable facts;
/// <see cref="CorrelationId"/> ties together every event produced for the same business transaction.
/// </summary>
public abstract record IntegrationEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();

    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;

    public Guid CorrelationId { get; init; }

    public string Source { get; init; } = string.Empty;
}
