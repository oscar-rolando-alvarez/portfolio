namespace ECommerce.Shared.Contracts.Basket;

public class BasketDto
{
    public Guid CustomerId { get; set; }
    public List<BasketItemDto> Items { get; set; } = new();
    public decimal TotalPrice { get; set; }
    public DateTime LastUpdated { get; set; }
}

public class BasketItemDto
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public decimal TotalPrice { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
}

public class AddToBasketRequest
{
    public Guid CustomerId { get; set; }
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
}

public class UpdateBasketItemRequest
{
    public Guid CustomerId { get; set; }
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
}

public class RemoveFromBasketRequest
{
    public Guid CustomerId { get; set; }
    public Guid ProductId { get; set; }
}