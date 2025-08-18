using ECommerce.Shared.Events.Base;

namespace ECommerce.Shared.Events.Events;

public class PaymentRequested : IntegrationEvent
{
    public Guid PaymentId { get; set; }
    public Guid OrderId { get; set; }
    public Guid CustomerId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public string PaymentMethod { get; set; } = string.Empty;
    public PaymentDetails PaymentDetails { get; set; } = new();
}

public class PaymentSucceeded : IntegrationEvent
{
    public Guid PaymentId { get; set; }
    public Guid OrderId { get; set; }
    public decimal Amount { get; set; }
    public string TransactionId { get; set; } = string.Empty;
    public DateTime ProcessedAt { get; set; }
}

public class PaymentFailed : IntegrationEvent
{
    public Guid PaymentId { get; set; }
    public Guid OrderId { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string ErrorCode { get; set; } = string.Empty;
    public DateTime FailedAt { get; set; }
}

public class PaymentRefunded : IntegrationEvent
{
    public Guid PaymentId { get; set; }
    public Guid OrderId { get; set; }
    public decimal RefundAmount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime RefundedAt { get; set; }
}

public class PaymentDetails
{
    public string CardNumber { get; set; } = string.Empty;
    public string CardHolderName { get; set; } = string.Empty;
    public string ExpiryDate { get; set; } = string.Empty;
    public string Cvv { get; set; } = string.Empty;
    public Address BillingAddress { get; set; } = new();
}