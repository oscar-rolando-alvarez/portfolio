using ECommerce.Shared.Common.Models;

namespace ECommerce.Services.Ordering.Domain.Entities;

public class Order : BaseEntity
{
    public string OrderNumber { get; set; } = string.Empty;
    public Guid CustomerId { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public decimal TotalAmount { get; set; }
    public Address ShippingAddress { get; set; } = new();
    public Address BillingAddress { get; set; } = new();
    public string PaymentMethod { get; set; } = string.Empty;
    public List<OrderItem> Items { get; set; } = new();

    public void AddItem(Guid productId, string productName, int quantity, decimal price)
    {
        var existingItem = Items.FirstOrDefault(x => x.ProductId == productId);
        if (existingItem != null)
        {
            existingItem.Quantity += quantity;
        }
        else
        {
            Items.Add(new OrderItem
            {
                ProductId = productId,
                ProductName = productName,
                Quantity = quantity,
                Price = price,
                OrderId = Id
            });
        }

        CalculateTotal();
    }

    public void RemoveItem(Guid productId)
    {
        var item = Items.FirstOrDefault(x => x.ProductId == productId);
        if (item != null)
        {
            Items.Remove(item);
            CalculateTotal();
        }
    }

    public void UpdateStatus(OrderStatus status)
    {
        Status = status;
        UpdatedAt = DateTime.UtcNow;
    }

    private void CalculateTotal()
    {
        TotalAmount = Items.Sum(x => x.Quantity * x.Price);
        UpdatedAt = DateTime.UtcNow;
    }
}

public class OrderItem : BaseEntity
{
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public decimal Total => Quantity * Price;
}

public class Address
{
    public string Street { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public string PostalCode { get; set; } = string.Empty;
}

public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Paid = 2,
    Shipped = 3,
    Delivered = 4,
    Cancelled = 5
}