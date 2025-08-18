namespace ECommerce.Services.Basket.Models;

public class CustomerBasket
{
    public Guid CustomerId { get; set; }
    public List<BasketItem> Items { get; set; } = new();
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

    public decimal TotalPrice => Items.Sum(item => item.TotalPrice);
}

public class BasketItem
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public string ImageUrl { get; set; } = string.Empty;

    public decimal TotalPrice => Quantity * Price;
}