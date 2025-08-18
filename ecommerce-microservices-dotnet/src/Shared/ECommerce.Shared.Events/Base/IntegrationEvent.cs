namespace ECommerce.Shared.Events.Base;

public abstract class IntegrationEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string CorrelationId { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
}