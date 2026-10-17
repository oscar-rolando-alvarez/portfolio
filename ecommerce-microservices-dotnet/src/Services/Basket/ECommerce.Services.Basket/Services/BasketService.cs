using ECommerce.Services.Basket.Models;
using ECommerce.Services.Basket.Repositories;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Basket;

namespace ECommerce.Services.Basket.Services;

public interface IBasketService
{
    Task<BasketDto> GetBasketAsync(Guid customerId);

    Task<BasketDto> AddItemAsync(Guid customerId, AddToBasketRequest request, CancellationToken cancellationToken = default);

    Task<BasketDto?> UpdateItemAsync(Guid customerId, Guid productId, int quantity);

    Task<BasketDto?> RemoveItemAsync(Guid customerId, Guid productId);

    Task<bool> ClearAsync(Guid customerId);
}

public sealed class ProductNotFoundException(Guid productId)
    : KeyNotFoundException($"Product {productId} does not exist or is not available.");

public sealed class BasketService(IBasketRepository repository, ICatalogClient catalog) : IBasketService
{
    public async Task<BasketDto> GetBasketAsync(Guid customerId) =>
        (await repository.GetAsync(customerId) ?? new CustomerBasket { CustomerId = customerId }).ToDto();

    public async Task<BasketDto> AddItemAsync(Guid customerId, AddToBasketRequest request, CancellationToken cancellationToken = default)
    {
        // Price and name always come from the catalog, never from the client.
        var product = await catalog.GetProductAsync(request.ProductId, cancellationToken)
            ?? throw new ProductNotFoundException(request.ProductId);

        var basket = await repository.GetAsync(customerId) ?? new CustomerBasket { CustomerId = customerId };
        var line = basket.Items.FirstOrDefault(i => i.ProductId == request.ProductId);
        if (line is null)
        {
            basket.Items.Add(new BasketItem
            {
                ProductId = product.Id,
                ProductName = product.Name,
                Quantity = request.Quantity,
                Price = product.Price,
                ImageUrl = product.ImageUrl,
            });
        }
        else
        {
            line.Quantity += request.Quantity;
            line.Price = product.Price;
        }

        await repository.SaveAsync(basket);
        return basket.ToDto();
    }

    public async Task<BasketDto?> UpdateItemAsync(Guid customerId, Guid productId, int quantity)
    {
        var basket = await repository.GetAsync(customerId);
        var line = basket?.Items.FirstOrDefault(i => i.ProductId == productId);
        if (basket is null || line is null)
        {
            return null;
        }

        if (quantity <= 0)
        {
            basket.Items.Remove(line);
        }
        else
        {
            line.Quantity = quantity;
        }

        await repository.SaveAsync(basket);
        return basket.ToDto();
    }

    public async Task<BasketDto?> RemoveItemAsync(Guid customerId, Guid productId)
    {
        var basket = await repository.GetAsync(customerId);
        if (basket is null || basket.Items.RemoveAll(i => i.ProductId == productId) == 0)
        {
            return null;
        }

        await repository.SaveAsync(basket);
        return basket.ToDto();
    }

    public Task<bool> ClearAsync(Guid customerId) => repository.DeleteAsync(customerId);
}

public static class BasketMappings
{
    public static BasketDto ToDto(this CustomerBasket basket) => new(
        basket.CustomerId,
        [.. basket.Items.Select(i => new BasketItemDto(i.ProductId, i.ProductName, i.Quantity, i.Price, i.TotalPrice, i.ImageUrl))],
        basket.TotalPrice,
        basket.LastUpdated);
}
