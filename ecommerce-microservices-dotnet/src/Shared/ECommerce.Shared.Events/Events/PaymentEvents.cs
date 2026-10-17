using ECommerce.Shared.Events.Base;

namespace ECommerce.Shared.Events.Events;

// Payment events intentionally carry no card data: card details never leave the payment provider.

/// <summary>Published by Payment when the charge for an order was captured.</summary>
public sealed record PaymentSucceeded : IntegrationEvent
{
    public required Guid PaymentId { get; init; }

    public required Guid OrderId { get; init; }

    public required decimal Amount { get; init; }

    public required string TransactionId { get; init; }
}

/// <summary>Published by Payment when the charge for an order was declined or errored.</summary>
public sealed record PaymentFailed : IntegrationEvent
{
    public required Guid PaymentId { get; init; }

    public required Guid OrderId { get; init; }

    public required decimal Amount { get; init; }

    public required string Reason { get; init; }

    public required string ErrorCode { get; init; }
}
