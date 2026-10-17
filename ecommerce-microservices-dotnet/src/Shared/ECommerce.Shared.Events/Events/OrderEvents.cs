using ECommerce.Shared.Events.Base;

namespace ECommerce.Shared.Events.Events;

/// <summary>Published by Ordering when an order has been accepted and is awaiting payment.</summary>
public sealed record OrderCreated : IntegrationEvent
{
    public required Guid OrderId { get; init; }

    public required Guid CustomerId { get; init; }

    public required decimal TotalAmount { get; init; }

    public string Currency { get; init; } = "USD";

    public required string PaymentMethod { get; init; }

    public IReadOnlyList<OrderLine> Items { get; init; } = [];
}

/// <summary>Published by Ordering once the order is paid.</summary>
public sealed record OrderPaid : IntegrationEvent
{
    public required Guid OrderId { get; init; }

    public required Guid PaymentId { get; init; }
}

/// <summary>Published by Ordering when an order is cancelled (for example after a declined payment).</summary>
public sealed record OrderCancelled : IntegrationEvent
{
    public required Guid OrderId { get; init; }

    public required string Reason { get; init; }
}

public sealed record OrderLine(Guid ProductId, string ProductName, int Quantity, decimal UnitPrice);
