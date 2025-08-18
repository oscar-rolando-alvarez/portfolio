using ECommerce.Shared.Events.Base;

namespace ECommerce.Shared.Events.Events;

public class CustomerRegistered : IntegrationEvent
{
    public Guid CustomerId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateTime RegisteredAt { get; set; }
}

public class CustomerUpdated : IntegrationEvent
{
    public Guid CustomerId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
}

public class CustomerDeactivated : IntegrationEvent
{
    public Guid CustomerId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime DeactivatedAt { get; set; }
}