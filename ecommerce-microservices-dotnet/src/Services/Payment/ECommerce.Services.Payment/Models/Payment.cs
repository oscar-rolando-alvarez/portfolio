using ECommerce.Shared.Common.Models;

namespace ECommerce.Services.Payment.Models;

public class Payment : BaseEntity
{
    public Guid OrderId { get; set; }
    public Guid CustomerId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public PaymentMethod PaymentMethod { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public string? TransactionId { get; set; }
    public string? FailureReason { get; set; }
    public DateTime? ProcessedAt { get; set; }
}

public enum PaymentMethod
{
    CreditCard = 0,
    DebitCard = 1,
    PayPal = 2,
    BankTransfer = 3
}

public enum PaymentStatus
{
    Pending = 0,
    Processing = 1,
    Succeeded = 2,
    Failed = 3,
    Refunded = 4
}