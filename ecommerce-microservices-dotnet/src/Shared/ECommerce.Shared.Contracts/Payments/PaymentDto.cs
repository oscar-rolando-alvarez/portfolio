namespace ECommerce.Shared.Contracts.Payments;

public sealed record PaymentDto(
    Guid Id,
    Guid OrderId,
    Guid CustomerId,
    decimal Amount,
    string Currency,
    string Status,
    string? TransactionId,
    string? FailureReason,
    DateTime CreatedAt,
    DateTime? ProcessedAt);
