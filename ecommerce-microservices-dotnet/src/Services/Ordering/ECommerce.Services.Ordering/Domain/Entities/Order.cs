using ECommerce.Shared.Common.Models;

namespace ECommerce.Services.Ordering.Domain.Entities;

/// <summary>
/// Order aggregate. State transitions are guarded here so consumers and endpoints cannot
/// move an order into an invalid state (for example paying a cancelled order).
/// </summary>
public sealed class Order : BaseEntity
{
    private readonly List<OrderItem> _items = [];

    public string OrderNumber { get; private set; } = string.Empty;

    public Guid CustomerId { get; private set; }

    public OrderStatus Status { get; private set; } = OrderStatus.Pending;

    public decimal TotalAmount { get; private set; }

    public Address ShippingAddress { get; private set; } = new();

    public Address BillingAddress { get; private set; } = new();

    public string PaymentMethod { get; private set; } = string.Empty;

    public Guid? PaymentId { get; private set; }

    public string? FailureReason { get; private set; }

    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    private Order()
    {
    }

    public static Order Create(Guid customerId, Address shippingAddress, Address billingAddress, string paymentMethod, TimeProvider? clock = null)
    {
        var now = (clock ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        return new Order
        {
            CustomerId = customerId,
            ShippingAddress = shippingAddress,
            BillingAddress = billingAddress,
            PaymentMethod = paymentMethod,
            CreatedAt = now,
            OrderNumber = $"ORD-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
        };
    }

    public void AddItem(Guid productId, string productName, int quantity, decimal unitPrice)
    {
        EnsureStatus(OrderStatus.Pending);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(quantity);
        ArgumentOutOfRangeException.ThrowIfNegative(unitPrice);

        var existing = _items.FirstOrDefault(i => i.ProductId == productId);
        if (existing is not null)
        {
            existing.Quantity += quantity;
        }
        else
        {
            _items.Add(new OrderItem
            {
                OrderId = Id,
                ProductId = productId,
                ProductName = productName,
                Quantity = quantity,
                Price = unitPrice,
            });
        }

        TotalAmount = _items.Sum(i => i.Total);
    }

    /// <summary>Marks the order as paid. Returns false when the event was already applied (idempotent).</summary>
    public bool MarkPaid(Guid paymentId)
    {
        if (Status == OrderStatus.Paid && PaymentId == paymentId)
        {
            return false;
        }

        EnsureStatus(OrderStatus.Pending);
        Status = OrderStatus.Paid;
        PaymentId = paymentId;
        UpdatedAt = DateTime.UtcNow;
        return true;
    }

    /// <summary>Cancels a pending order. Returns false when it was already cancelled (idempotent).</summary>
    public bool Cancel(string reason)
    {
        if (Status == OrderStatus.Cancelled)
        {
            return false;
        }

        EnsureStatus(OrderStatus.Pending);
        Status = OrderStatus.Cancelled;
        FailureReason = reason;
        UpdatedAt = DateTime.UtcNow;
        return true;
    }

    private void EnsureStatus(OrderStatus expected)
    {
        if (Status != expected)
        {
            throw new InvalidOperationException($"Order {OrderNumber} is {Status}; expected {expected}.");
        }
    }
}

public sealed class OrderItem : BaseEntity
{
    public Guid OrderId { get; set; }

    public Guid ProductId { get; set; }

    public string ProductName { get; set; } = string.Empty;

    public int Quantity { get; set; }

    public decimal Price { get; set; }

    public decimal Total => Quantity * Price;
}

public sealed record Address
{
    public string Street { get; init; } = string.Empty;

    public string City { get; init; } = string.Empty;

    public string State { get; init; } = string.Empty;

    public string Country { get; init; } = string.Empty;

    public string PostalCode { get; init; } = string.Empty;
}

public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Paid = 2,
    Shipped = 3,
    Delivered = 4,
    Cancelled = 5,
}
